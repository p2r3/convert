/**
 * Minimal MIDI file codec.
 * extractEvents(midiBytes)  -> array of event objects (the "table")
 * tableToString(table)      -> newline-separated human-readable string
 * stringToTable(text)       -> event table (inverse of tableToString)
 * buildMidi(table)          -> Uint8Array MIDI binary (inverse of extractEvents)
 */

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function noteName(midi) {
  return NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
}

/** Read a variable-length quantity, return { value, bytesRead }. */
function readVLQ(bytes, offset) {
  let value = 0;
  let bytesRead = 0;
  while (true) {
    const b = bytes[offset + bytesRead];
    value = (value << 7) | (b & 0x7f);
    bytesRead++;
    if (!(b & 0x80)) break;
    if (bytesRead > 4) break; // guard against malformed data
  }
  return { value, bytesRead };
}

function readUint16BE(bytes, offset) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32BE(bytes, offset) {
  return (
    (bytes[offset] * 0x1000000) +
    ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3])
  );
}

function readString(bytes, offset, length) {
  let s = "";
  for (let i = 0; i < length; i++) {
    const c = bytes[offset + i];
    if (c >= 0x20 && c < 0x7f) s += String.fromCharCode(c);
    else s += `\\x${c.toString(16).padStart(2, "0")}`;
  }
  return s;
}

const GM_PROGRAMS = [
  "Acoustic Grand Piano","Bright Acoustic Piano","Electric Grand Piano","Honky-tonk Piano",
  "Electric Piano 1","Electric Piano 2","Harpsichord","Clavi","Celesta","Glockenspiel",
  "Music Box","Vibraphone","Marimba","Xylophone","Tubular Bells","Dulcimer",
  "Drawbar Organ","Percussive Organ","Rock Organ","Church Organ","Reed Organ","Accordion",
  "Harmonica","Tango Accordion","Acoustic Guitar (nylon)","Acoustic Guitar (steel)",
  "Electric Guitar (jazz)","Electric Guitar (clean)","Electric Guitar (muted)","Overdriven Guitar",
  "Distortion Guitar","Guitar Harmonics","Acoustic Bass","Electric Bass (finger)",
  "Electric Bass (pick)","Fretless Bass","Slap Bass 1","Slap Bass 2","Synth Bass 1","Synth Bass 2",
  "Violin","Viola","Cello","Contrabass","Tremolo Strings","Pizzicato Strings",
  "Orchestral Harp","Timpani","String Ensemble 1","String Ensemble 2","Synth Strings 1",
  "Synth Strings 2","Choir Aahs","Voice Oohs","Synth Voice","Orchestra Hit",
  "Trumpet","Trombone","Tuba","Muted Trumpet","French Horn","Brass Section",
  "Synth Brass 1","Synth Brass 2","Soprano Sax","Alto Sax","Tenor Sax","Baritone Sax",
  "Oboe","English Horn","Bassoon","Clarinet","Piccolo","Flute","Recorder","Pan Flute",
  "Blown Bottle","Shakuhachi","Whistle","Ocarina","Lead 1 (square)","Lead 2 (sawtooth)",
  "Lead 3 (calliope)","Lead 4 (chiff)","Lead 5 (charang)","Lead 6 (voice)","Lead 7 (fifths)",
  "Lead 8 (bass+lead)","Pad 1 (new age)","Pad 2 (warm)","Pad 3 (polysynth)","Pad 4 (choir)",
  "Pad 5 (bowed)","Pad 6 (metallic)","Pad 7 (halo)","Pad 8 (sweep)","FX 1 (rain)",
  "FX 2 (soundtrack)","FX 3 (crystal)","FX 4 (atmosphere)","FX 5 (brightness)","FX 6 (goblins)",
  "FX 7 (echoes)","FX 8 (sci-fi)","Sitar","Banjo","Shamisen","Koto","Kalimba","Bagpipe",
  "Fiddle","Shanai","Tinkle Bell","Agogo","Steel Drums","Woodblock","Taiko Drum",
  "Melodic Tom","Synth Drum","Reverse Cymbal","Guitar Fret Noise","Breath Noise","Seashore",
  "Bird Tweet","Telephone Ring","Helicopter","Applause","Gunshot"
];

const CC_NAMES = {
  0:"Bank Select MSB", 1:"Mod Wheel", 2:"Breath", 6:"Data Entry MSB", 7:"Volume",
  8:"Balance", 10:"Pan", 11:"Expression", 12:"Effect 1", 13:"Effect 2",
  32:"Bank Select LSB", 38:"Data Entry LSB", 64:"Sustain", 65:"Portamento",
  66:"Sostenuto", 67:"Soft Pedal", 68:"Legato", 69:"Hold 2",
  71:"Resonance", 72:"Release Time", 73:"Attack Time", 74:"Brightness",
  91:"Reverb", 93:"Chorus", 94:"Detune", 95:"Phaser",
  120:"All Sound Off", 121:"Reset All Controllers", 123:"All Notes Off",
};

const META_NAMES = {
  0x00: "Sequence Number", 0x01: "Text", 0x02: "Copyright", 0x03: "Track Name",
  0x04: "Instrument Name", 0x05: "Lyric", 0x06: "Marker", 0x07: "Cue Point",
  0x08: "Program Name", 0x09: "Device Name", 0x20: "MIDI Channel Prefix",
  0x21: "MIDI Port", 0x2f: "End of Track", 0x51: "Set Tempo",
  0x54: "SMPTE Offset", 0x58: "Time Signature", 0x59: "Key Signature",
  0x7f: "Sequencer Specific",
};

/**
 * Parse all tracks of a MIDI file.
 * @param {Uint8Array} midiBytes
 * @returns {Array<Object>} flat table of event objects
 */
export function extractEvents(midiBytes) {
  const bytes = midiBytes instanceof Uint8Array ? midiBytes : new Uint8Array(midiBytes);

  // Validate MThd
  if (
    bytes[0] !== 0x4d || bytes[1] !== 0x54 ||
    bytes[2] !== 0x68 || bytes[3] !== 0x64
  ) throw new Error("Not a MIDI file (missing MThd)");

  const headerLength = readUint32BE(bytes, 4); // always 6
  const format    = readUint16BE(bytes, 8);
  const numTracks = readUint16BE(bytes, 10);
  const division  = readUint16BE(bytes, 12);

  const ticksPerBeat = (division & 0x8000) ? null : division; // null = SMPTE

  const events = [];

  // Push a synthetic header event
  events.push({
    track: -1,
    tick: 0,
    absoluteSec: null,
    type: "header",
    format,
    numTracks,
    division,
    ticksPerBeat,
  });

  let pos = 8 + headerLength; // start of first track chunk

  for (let trackIdx = 0; trackIdx < numTracks; trackIdx++) {
    // Find MTrk
    while (pos < bytes.length - 4) {
      if (
        bytes[pos] === 0x4d && bytes[pos+1] === 0x54 &&
        bytes[pos+2] === 0x72 && bytes[pos+3] === 0x6b
      ) break;
      pos++;
    }
    if (pos >= bytes.length - 4) break;

    const trackLength = readUint32BE(bytes, pos + 4);
    const trackEnd    = pos + 8 + trackLength;
    pos += 8; // skip MTrk + length

    let tick = 0;
    let runningStatus = 0;
    let microsecondsPerBeat = 500000; // default 120 BPM

    while (pos < trackEnd) {
      // delta time
      const vlq = readVLQ(bytes, pos);
      pos += vlq.bytesRead;
      tick += vlq.value;

      const absoluteSec = ticksPerBeat
        ? (tick * microsecondsPerBeat) / (ticksPerBeat * 1_000_000)
        : null;

      const statusByte = bytes[pos];

      let ev = { track: trackIdx, tick, absoluteSec };

      if (statusByte === 0xff) {
        // Meta event
        pos++;
        const metaType = bytes[pos++];
        const lenVlq = readVLQ(bytes, pos);
        pos += lenVlq.bytesRead;
        const dataLen = lenVlq.value;
        const data = bytes.slice(pos, pos + dataLen);
        pos += dataLen;

        ev.type = "meta";
        ev.metaType = metaType;
        ev.metaName = META_NAMES[metaType] || `Meta 0x${metaType.toString(16).padStart(2,"0")}`;

        switch (metaType) {
          case 0x51: // Set Tempo
            microsecondsPerBeat = (data[0] << 16) | (data[1] << 8) | data[2];
            ev.tempo = microsecondsPerBeat;
            ev.bpm   = Math.round(60_000_000 / microsecondsPerBeat * 100) / 100;
            break;
          case 0x58: // Time Signature
            ev.numerator   = data[0];
            ev.denominator = 1 << data[1];
            ev.metronome   = data[2];
            ev.thirtySeconds = data[3];
            break;
          case 0x59: // Key Signature
            {
              const sf = data[0] > 127 ? data[0] - 256 : data[0]; // signed
              const minor = data[1];
              const keys = ["Cb","Gb","Db","Ab","Eb","Bb","F","C","G","D","A","E","B","F#","C#"];
              ev.key = (keys[sf + 7] || "?") + (minor ? "m" : "");
            }
            break;
          case 0x2f: // End of Track
            ev.type = "end_of_track";
            break;
          default:
            if (metaType >= 0x01 && metaType <= 0x09) {
              ev.text = readString(data, 0, dataLen);
            } else {
              ev.raw = Array.from(data).map(b => b.toString(16).padStart(2,"0")).join(" ");
            }
        }
        runningStatus = 0;
      } else if (statusByte === 0xf0 || statusByte === 0xf7) {
        // SysEx
        pos++;
        const lenVlq = readVLQ(bytes, pos);
        pos += lenVlq.bytesRead;
        const dataLen = lenVlq.value;
        const data = bytes.slice(pos, pos + dataLen);
        pos += dataLen;
        ev.type = "sysex";
        ev.data = Array.from(data).map(b => b.toString(16).padStart(2,"0")).join(" ");
        runningStatus = 0;
      } else {
        // Channel event (possibly running status)
        let status;
        if (statusByte & 0x80) {
          status = statusByte;
          runningStatus = statusByte;
          pos++;
        } else {
          status = runningStatus;
        }

        const cmd     = status >> 4;
        const channel = status & 0x0f;
        ev.channel = channel;

        switch (cmd) {
          case 0x9: { // Note On
            const note = bytes[pos++];
            const vel  = bytes[pos++];
            ev.type = vel === 0 ? "note_off" : "note_on";
            ev.note = note;
            ev.noteName = noteName(note);
            ev.velocity = vel;
            break;
          }
          case 0x8: { // Note Off
            const note = bytes[pos++];
            const vel  = bytes[pos++];
            ev.type = "note_off";
            ev.note = note;
            ev.noteName = noteName(note);
            ev.velocity = vel;
            break;
          }
          case 0xa: { // Aftertouch (key pressure)
            const note = bytes[pos++];
            const pres = bytes[pos++];
            ev.type = "aftertouch";
            ev.note = note;
            ev.noteName = noteName(note);
            ev.pressure = pres;
            break;
          }
          case 0xb: { // Control Change
            const cc  = bytes[pos++];
            const val = bytes[pos++];
            ev.type = "control_change";
            ev.controller = cc;
            ev.controllerName = CC_NAMES[cc] || `CC${cc}`;
            ev.value = val;
            break;
          }
          case 0xc: { // Program Change
            const prog = bytes[pos++];
            ev.type = "program_change";
            ev.program = prog;
            ev.programName = channel === 9 ? "Drums" : (GM_PROGRAMS[prog] || `Program ${prog}`);
            break;
          }
          case 0xd: { // Channel Pressure
            const pres = bytes[pos++];
            ev.type = "channel_pressure";
            ev.pressure = pres;
            break;
          }
          case 0xe: { // Pitch Bend
            const lo = bytes[pos++];
            const hi = bytes[pos++];
            const value = ((hi << 7) | lo) - 8192;
            ev.type = "pitch_bend";
            ev.value = value;
            ev.semitones = Math.round(value / 8192 * 200) / 100;
            break;
          }
          default:
            ev.type = "unknown";
            ev.raw  = status.toString(16);
            // Skip one byte to avoid infinite loop
            pos++;
        }
      }

      events.push(ev);
    }

    pos = trackEnd; // advance past any unread bytes in track
  }

  return events;
}

/**
 * Convert an event table to a newline-separated human-readable string.
 * @param {Array<Object>} table
 * @returns {string}
 */
export function tableToString(table) {
  const lines = [];
  for (const ev of table) {
    if (ev.type === "header") {
      lines.push(
        `# MIDI File  format=${ev.format}  tracks=${ev.numTracks}` +
        (ev.ticksPerBeat ? `  ${ev.ticksPerBeat} ticks/beat` : `  SMPTE division=${ev.division}`)
      );
      continue;
    }

    const prefix = ev.absoluteSec != null
      ? `t=${ev.track} tick=${String(ev.tick).padStart(6)} (${ev.absoluteSec.toFixed(3)}s)`
      : `t=${ev.track} tick=${String(ev.tick).padStart(6)}`;

    switch (ev.type) {
      case "note_on":
        lines.push(`${prefix} ch${ev.channel+1} NOTE_ON  ${ev.noteName.padEnd(4)} vel=${ev.velocity}`);
        break;
      case "note_off":
        lines.push(`${prefix} ch${ev.channel+1} NOTE_OFF ${ev.noteName.padEnd(4)} vel=${ev.velocity}`);
        break;
      case "aftertouch":
        lines.push(`${prefix} ch${ev.channel+1} AFTERTOUCH ${ev.noteName} pres=${ev.pressure}`);
        break;
      case "control_change":
        lines.push(`${prefix} ch${ev.channel+1} CC  ${String(ev.controller).padStart(3)} (${ev.controllerName}) = ${ev.value}`);
        break;
      case "program_change":
        lines.push(`${prefix} ch${ev.channel+1} PROGRAM ${ev.program} (${ev.programName})`);
        break;
      case "channel_pressure":
        lines.push(`${prefix} ch${ev.channel+1} CHANNEL_PRESSURE pres=${ev.pressure}`);
        break;
      case "pitch_bend":
        lines.push(`${prefix} ch${ev.channel+1} PITCH_BEND ${ev.value} (${ev.semitones >= 0 ? "+" : ""}${ev.semitones} semitones)`);
        break;
      case "meta":
        if (ev.metaType === 0x51) {
          lines.push(`${prefix} [${ev.metaName}] ${ev.bpm} BPM (${ev.tempo} µs/beat)`);
        } else if (ev.metaType === 0x58) {
          lines.push(`${prefix} [${ev.metaName}] ${ev.numerator}/${ev.denominator}`);
        } else if (ev.metaType === 0x59) {
          lines.push(`${prefix} [${ev.metaName}] ${ev.key}`);
        } else if (ev.text != null) {
          lines.push(`${prefix} [${ev.metaName}] "${ev.text}"`);
        } else if (ev.raw != null) {
          lines.push(`${prefix} [${ev.metaName}] ${ev.raw}`);
        } else {
          lines.push(`${prefix} [${ev.metaName}]`);
        }
        break;
      case "end_of_track":
        lines.push(`${prefix} [End of Track]`);
        break;
      case "sysex":
        lines.push(`${prefix} SYSEX ${ev.data}`);
        break;
      default:
        lines.push(`${prefix} ${ev.type ?? "unknown"} ${ev.raw ?? ""}`);
    }
  }
  return lines.join("\n");
}

// Encoder helpers

/** Parse a note name like "C4", "F#3", "D-1" back to a MIDI note number. */
function noteNameToMidi(name) {
  const m = name.trim().match(/^([A-G]#?)(-?\d+)$/);
  if (!m) return 60;
  const idx = NOTE_NAMES.indexOf(m[1]);
  if (idx === -1) return 60;
  return (parseInt(m[2]) + 1) * 12 + idx;
}

/** Write a MIDI variable-length quantity into a byte array. */
function writeVLQ(bytes, value) {
  if (value === 0) { bytes.push(0); return; }
  const vlq = [];
  while (value > 0) { vlq.unshift(value & 0x7f); value >>>= 7; }
  for (let i = 0; i < vlq.length - 1; i++) vlq[i] |= 0x80;
  for (const b of vlq) bytes.push(b);
}

/** Build raw data bytes for a meta event from an event object. */
function buildMetaData(ev) {
  const metaType = ev.type === "end_of_track" ? 0x2f : ev.metaType;
  if (metaType === 0x2f) return [];

  if (metaType === 0x51) {
    const t = ev.tempo || 500000;
    return [(t >> 16) & 0xff, (t >> 8) & 0xff, t & 0xff];
  }
  if (metaType === 0x58) {
    const num  = ev.numerator   || 4;
    const den  = ev.denominator || 4;
    return [num, Math.round(Math.log2(den)), ev.metronome || 24, ev.thirtySeconds || 8];
  }
  if (metaType === 0x59) {
    // Reverse the same keys[] lookup used in extractEvents.
    const keyStr  = ev.key || "C";
    const minor   = keyStr.endsWith("m") ? 1 : 0;
    const keyBase = minor ? keyStr.slice(0, -1) : keyStr;
    const keys    = ["Cb","Gb","Db","Ab","Eb","Bb","F","C","G","D","A","E","B","F#","C#"];
    const idx     = keys.indexOf(keyBase);
    const sf      = idx >= 0 ? idx - 7 : 0;
    return [sf < 0 ? sf + 256 : sf, minor];
  }
  if (ev.text != null) return Array.from(new TextEncoder().encode(ev.text));
  if (ev.raw  != null) {
    return ev.raw.trim().split(/\s+/)
      .map(h => parseInt(h, 16)).filter(n => !isNaN(n));
  }
  return [];
}

// Exported encoder functions

/**
 * Parse the text produced by tableToString back into an event table.
 * @param {string} text
 * @returns {Array<Object>}
 */
export function stringToTable(text) {
  const table = [];

  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (!s) continue;

    // Header comment: # MIDI File  format=N  tracks=N  N ticks/beat
    if (s.startsWith("#")) {
      const fmtM   = s.match(/format=(\d+)/);
      const trkM   = s.match(/tracks=(\d+)/);
      const tpbM   = s.match(/(\d+)\s+ticks\/beat/);
      const smpteM = s.match(/SMPTE division=(\d+)/);
      const ticksPerBeat = tpbM ? parseInt(tpbM[1]) : null;
      table.push({
        track: -1, tick: 0, absoluteSec: null, type: "header",
        format:    fmtM   ? parseInt(fmtM[1])   : 1,
        numTracks: trkM   ? parseInt(trkM[1])   : 1,
        division:  ticksPerBeat ?? (smpteM ? parseInt(smpteM[1]) : 480),
        ticksPerBeat,
      });
      continue;
    }

    // Event prefix: t=N tick=NNNNNN [(X.XXXs)]
    const prefM = s.match(/^t=(-?\d+)\s+tick=\s*(-?\d+)(?:\s+\([\d.]+s\))?/);
    if (!prefM) continue;

    const ev   = { track: parseInt(prefM[1]), tick: parseInt(prefM[2]), absoluteSec: null };
    let   rest = s.slice(prefM[0].length).trim();

    // Channel events: chN TYPE ...
    const chM = rest.match(/^ch(\d+)\s+/);
    if (chM) {
      ev.channel = parseInt(chM[1]) - 1;
      rest = rest.slice(chM[0].length);

      if (rest.startsWith("NOTE_ON")) {
        const m = rest.match(/NOTE_ON\s+(\S+)\s+vel=(\d+)/);
        if (m) { ev.type = "note_on";  ev.noteName = m[1]; ev.note = noteNameToMidi(m[1]); ev.velocity = parseInt(m[2]); }
      } else if (rest.startsWith("NOTE_OFF")) {
        const m = rest.match(/NOTE_OFF\s+(\S+)\s+vel=(\d+)/);
        if (m) { ev.type = "note_off"; ev.noteName = m[1]; ev.note = noteNameToMidi(m[1]); ev.velocity = parseInt(m[2]); }
      } else if (rest.startsWith("AFTERTOUCH")) {
        const m = rest.match(/AFTERTOUCH\s+(\S+)\s+pres=(\d+)/);
        if (m) { ev.type = "aftertouch"; ev.noteName = m[1]; ev.note = noteNameToMidi(m[1]); ev.pressure = parseInt(m[2]); }
      } else if (rest.startsWith("CC")) {
        const m = rest.match(/CC\s+(\d+)\s+\([^)]*\)\s*=\s*(\d+)/);
        if (m) { ev.type = "control_change"; ev.controller = parseInt(m[1]); ev.value = parseInt(m[2]); }
      } else if (rest.startsWith("PROGRAM")) {
        const m = rest.match(/PROGRAM\s+(\d+)/);
        if (m) { ev.type = "program_change"; ev.program = parseInt(m[1]); }
      } else if (rest.startsWith("CHANNEL_PRESSURE")) {
        const m = rest.match(/CHANNEL_PRESSURE\s+pres=(\d+)/);
        if (m) { ev.type = "channel_pressure"; ev.pressure = parseInt(m[1]); }
      } else if (rest.startsWith("PITCH_BEND")) {
        const m = rest.match(/PITCH_BEND\s+(-?\d+)/);
        if (m) { ev.type = "pitch_bend"; ev.value = parseInt(m[1]); }
      }

    // Meta / End of Track: [Name] data
    } else if (rest.startsWith("[")) {
      const brM = rest.match(/^\[([^\]]+)\](.*)/);
      if (brM) {
        const metaName = brM[1];
        const data     = brM[2].trim();

        if (metaName === "End of Track") {
          ev.type     = "end_of_track";
          ev.metaType = 0x2f;
        } else {
          ev.type     = "meta";
          ev.metaName = metaName;
          // Reverse-lookup numeric type from META_NAMES
          for (const [k, v] of Object.entries(META_NAMES)) {
            if (v === metaName) { ev.metaType = parseInt(k); break; }
          }
          if (metaName === "Set Tempo") {
            const m = data.match(/(\d+)\s+µs\/beat/);
            if (m) { ev.tempo = parseInt(m[1]); ev.bpm = Math.round(60_000_000 / ev.tempo * 100) / 100; }
          } else if (metaName === "Time Signature") {
            const m = data.match(/(\d+)\/(\d+)/);
            if (m) { ev.numerator = parseInt(m[1]); ev.denominator = parseInt(m[2]); }
          } else if (metaName === "Key Signature") {
            ev.key = data;
          } else {
            const textM = data.match(/^"(.*)"$/s);
            if (textM) ev.text = textM[1];
            else if (data) ev.raw = data;
          }
        }
      }

    // SysEx
    } else if (rest.startsWith("SYSEX")) {
      ev.type = "sysex";
      ev.data = rest.slice("SYSEX".length).trim();
    }

    if (ev.type) table.push(ev);
  }

  return table;
}

/**
 * Build a MIDI binary from an event table (inverse of extractEvents).
 * @param {Array<Object>} table
 * @returns {Uint8Array}
 */
export function buildMidi(table) {
  const header      = table.find(ev => ev.type === "header");
  const ticksPerBeat = header?.ticksPerBeat ?? 480;
  const format       = header?.format ?? 1;

  // Group events by track index
  const trackMap = new Map();
  for (const ev of table) {
    if (ev.type === "header") continue;
    const ti = ev.track >= 0 ? ev.track : 0;
    if (!trackMap.has(ti)) trackMap.set(ti, []);
    trackMap.get(ti).push(ev);
  }

  // Encode each track chunk
  const chunks = [...trackMap.keys()].sort((a, b) => a - b).map(ti => {
    const events   = trackMap.get(ti).slice().sort((a, b) => a.tick - b.tick);
    const bytes    = [];
    let   lastTick = 0;

    for (const ev of events) {
      writeVLQ(bytes, Math.max(0, ev.tick - lastTick));
      lastTick = ev.tick;

      switch (ev.type) {
        case "note_on":
          bytes.push(0x90 | (ev.channel & 0xf), ev.note & 0x7f, ev.velocity & 0x7f);
          break;
        case "note_off":
          bytes.push(0x80 | (ev.channel & 0xf), ev.note & 0x7f, ev.velocity & 0x7f);
          break;
        case "aftertouch":
          bytes.push(0xa0 | (ev.channel & 0xf), ev.note & 0x7f, ev.pressure & 0x7f);
          break;
        case "control_change":
          bytes.push(0xb0 | (ev.channel & 0xf), ev.controller & 0x7f, ev.value & 0x7f);
          break;
        case "program_change":
          bytes.push(0xc0 | (ev.channel & 0xf), ev.program & 0x7f);
          break;
        case "channel_pressure":
          bytes.push(0xd0 | (ev.channel & 0xf), ev.pressure & 0x7f);
          break;
        case "pitch_bend": {
          const v = Math.max(0, Math.min(0x3fff, ev.value + 8192));
          bytes.push(0xe0 | (ev.channel & 0xf), v & 0x7f, (v >> 7) & 0x7f);
          break;
        }
        case "sysex": {
          const hex = (ev.data || "").trim().split(/\s+/)
            .map(h => parseInt(h, 16)).filter(n => !isNaN(n));
          bytes.push(0xf0);
          writeVLQ(bytes, hex.length);
          for (const b of hex) bytes.push(b);
          break;
        }
        case "end_of_track":
        case "meta": {
          const metaType = ev.type === "end_of_track" ? 0x2f : (ev.metaType ?? 0x01);
          const data     = buildMetaData(ev);
          bytes.push(0xff, metaType);
          writeVLQ(bytes, data.length);
          for (const b of data) bytes.push(b);
          break;
        }
        // skip unknown / header
      }
    }

    // Guarantee End of Track
    if (!events.some(ev => ev.type === "end_of_track")) {
      writeVLQ(bytes, 0);
      bytes.push(0xff, 0x2f, 0x00);
    }

    return bytes;
  });

  // Assemble: MThd (14 bytes) + MTrk chunks
  const buf  = new Uint8Array(14 + chunks.reduce((n, ch) => n + 8 + ch.length, 0));
  const view = new DataView(buf.buffer);

  buf.set([0x4d, 0x54, 0x68, 0x64], 0); // "MThd"
  view.setUint32(4,  6,            false);
  view.setUint16(8,  format,       false);
  view.setUint16(10, chunks.length, false);
  view.setUint16(12, ticksPerBeat,  false);

  let pos = 14;
  for (const ch of chunks) {
    buf.set([0x4d, 0x54, 0x72, 0x6b], pos); // "MTrk"
    view.setUint32(pos + 4, ch.length, false);
    buf.set(ch, pos + 8);
    pos += 8 + ch.length;
  }

  return buf;
}

// Builder helpers

/**
 * Append a note-on + note-off pair to an event array (in-place).
 * @param {Array<Object>} events       target array
 * @param {number}        track        MIDI track index
 * @param {number}        channel      MIDI channel (0–15)
 * @param {number}        tick         start tick
 * @param {number}        note         MIDI note number (0–127)
 * @param {number}        durationTicks
 * @param {number}        [velocity=100]
 */
export function addNote(events, track, channel, tick, note, durationTicks, velocity = 100) {
  events.push(
    { track, tick,                    absoluteSec: null, type: "note_on",  channel, note, noteName: noteName(note), velocity },
    { track, tick: tick + Math.max(1, durationTicks), absoluteSec: null, type: "note_off", channel, note, noteName: noteName(note), velocity: 0 },
  );
}

/**
 * Prepend a MIDI file header event and a tempo meta event to an event array (in-place).
 * Call this after all notes are already in the array so numTracks is computed correctly.
 * @param {Array<Object>} events       event array
 * @param {number}        ticksPerBeat ticks per quarter note
 * @param {number}        bpm          tempo in beats per minute
 * @param {number}        [format=0]   MIDI file format (0 = single track)
 */
export function initTrack(events, ticksPerBeat, bpm, format = 0) {
  if (bpm <= 0) throw new Error("initTrack: bpm must be positive");
  const usedTracks = new Set(events.filter(e => e.track >= 0).map(e => e.track));
  const numTracks  = usedTracks.size || 1;

  events.unshift(
    { track: -1, tick: 0, absoluteSec: null, type: "header",
      format, numTracks, division: ticksPerBeat, ticksPerBeat },
    { track: 0,  tick: 0, absoluteSec: null, type: "meta", metaType: 0x51, metaName: "Set Tempo",
      tempo: Math.round(60_000_000 / bpm), bpm },
  );
}

/** Convert a frequency in Hz to the nearest MIDI note number (clamped 0–127). */
function freqToMidi(hz) {
  return Math.max(0, Math.min(127, Math.round(69 + 12 * Math.log2(hz / 440))));
}

/**
 * Parse an RTTTL (Nokia Ring Tone Text Transfer Language) string into a MIDI event table.
 *
 * Format:  name:d=N,o=N,b=N:notes
 *   d = default duration  (1|2|4|8|16|32)
 *   o = default octave    (4–7)
 *   b = tempo in BPM
 *
 * Each note token: [duration][pitch][#][octave][.]
 *   pitch  – a b c d e f g  (or p for rest)
 *   #      – sharp
 *   .      – dotted (x1.5 duration)
 *
 * @param {string} text
 * @returns {Array<Object>}
 */
export function parseRtttl(text) {
  const parts = text.trim().split(":");
  if (parts.length < 3) throw new Error("Invalid RTTTL: expected 'name:settings:notes'");

  // Settings (part 2): key=value pairs with single-letter keys
  const settings = {};
  for (const param of parts[1].split(",")) {
    const m = param.trim().match(/^([a-z])\s*=\s*(\d+)$/i);
    if (m) settings[m[1].toLowerCase()] = parseInt(m[2]);
  }

  const defaultDuration = settings.d || 4;
  const defaultOctave   = settings.o || 5;
  const bpm             = settings.b || 63;
  const TICKS           = 480;

  // Semitone offset from C within an octave (natural notes only; # adds 1)
  const SEMITONES = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

  const events = [];
  let   tick   = 0;

  // Notes (part 3+; join remaining in case text has extra colons)
  for (const noteStr of parts.slice(2).join(":").split(",")) {
    const s = noteStr.trim();
    if (!s) continue;

    // [duration][pitch][#?][octave?][.?]
    const m = s.match(/^(\d*)(p|a|b|c|d|e|f|g)(#?)(\d?)(\.?)$/i);
    if (!m) continue;

    const durNum = m[1] ? parseInt(m[1]) : defaultDuration;
    const pitch  = m[2].toLowerCase();
    const sharp  = m[3] === "#";
    const octave = m[4] ? parseInt(m[4]) : defaultOctave;
    const dotted = m[5] === ".";

    // Quarter note = TICKS ticks; whole = 4xTICKS; eighth = TICKS/2, etc.
    let durationTicks = Math.round((4 / durNum) * TICKS);
    if (dotted) durationTicks = Math.round(durationTicks * 1.5);

    if (pitch === "p") {
      tick += Math.max(1, durationTicks);
    } else {
      const semitone = SEMITONES[pitch] + (sharp ? 1 : 0);
      const midiNote = Math.max(0, Math.min(127, 12 * (octave + 1) + semitone));
      addNote(events, 0, 0, tick, midiNote, durationTicks);
      tick += Math.max(1, durationTicks);
    }
  }

  events.push({ track: 0, tick, absoluteSec: null, type: "end_of_track", metaType: 0x2f });
  initTrack(events, TICKS, bpm, 0);
  return events;
}

/**
 * Parse a GRUB init tune string and return a MIDI event table for buildMidi().
 *
 * Accepted input:
 *   "tempo freq1 dur1 freq2 dur2 ..."            (bare numbers)
 *   GRUB_INIT_TUNE="tempo freq1 dur1 ..."        (shell-variable form, comments allowed)
 *
 * tempo  – BPM (60 = 1 beat/s)
 * freq   – Hz; 0 = rest
 * dur    – duration in beats
 *
 * @param {string} text
 * @returns {Array<Object>}
 */
export function parseGrubTune(text) {
  // Try to extract from GRUB_INIT_TUNE="..." wrapper first
  const tuneMatch = text.match(/GRUB_INIT_TUNE\s*=\s*["']([^"']+)["']/);
  const raw = tuneMatch
    ? tuneMatch[1]
    : text.split("\n").filter(l => !l.trim().startsWith("#")).join(" ");

  const nums = raw.trim().split(/\s+/).map(Number);
  if (nums.length < 3 || nums.some(isNaN)) {
    throw new Error("Invalid GRUB init tune: expected 'tempo freq dur [freq dur ...]'");
  }

  const TICKS   = 480;
  const bpm     = nums[0];
  if (bpm <= 0) throw new Error("Invalid GRUB init tune: tempo must be positive");

  const events  = [];
  let   tick    = 0;

  for (let i = 1; i + 1 < nums.length; i += 2) {
    const freq          = nums[i];
    const durationTicks = Math.round(nums[i + 1] * TICKS);

    if (freq > 0) {
      addNote(events, 0, 0, tick, freqToMidi(freq), durationTicks);
    }
    tick += Math.max(1, durationTicks);
  }

  events.push({ track: 0, tick, absoluteSec: null, type: "end_of_track", metaType: 0x2f });
  initTrack(events, TICKS, bpm, 0);
  return events;
}

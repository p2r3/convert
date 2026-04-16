import { expect, test } from "bun:test";
import CommonFormats from "../../src/CommonFormats.ts";
import { getCodecArgsForFormat, getSpecialAudioFormats } from "../../src/handlers/FFmpeg.ts";

test("ffmpeg exposes distinct ogg opus and ogg vorbis aliases", () => {
  const formats = getSpecialAudioFormats();

  expect(formats).toEqual([
    {
      name: "Ogg Opus Audio",
      format: "opus",
      extension: "ogg",
      mime: CommonFormats.OGG.mime,
      from: true,
      to: false,
      internal: "ogg",
      category: "audio",
      lossless: false
    },
    {
      name: "Ogg Vorbis Audio",
      format: "vorbis",
      extension: "ogg",
      mime: CommonFormats.OGG.mime,
      from: false,
      to: true,
      internal: "ogg",
      category: "audio",
      lossless: false
    }
  ]);
});

test("ffmpeg forces libvorbis for ogg vorbis output", () => {
  const vorbisFormat = getSpecialAudioFormats()[1];
  expect(getCodecArgsForFormat(vorbisFormat)).toEqual(["-c:a", "libvorbis"]);

  const plainOgg = CommonFormats.OGG.builder("ogg").allowTo();
  expect(getCodecArgsForFormat(plainOgg)).toEqual([]);
});

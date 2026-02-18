import type { FormatHandler, FileFormat, FileData } from "../FormatHandler.js";

// ── Base file parser ──────────────────────────────────────────────────────────

class TerrariaFileParser {
  offset: number = 0;
  buffer!: DataView;
  options: { ignoreBounds: boolean } = { ignoreBounds: false };
  RLE: number = 0;

  async loadFile(file: File): Promise<void> {
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => { reader.abort(); reject(reader.error); };
      reader.readAsArrayBuffer(file);
    });
    this.buffer = new DataView(buffer);
  }

  readUInt8(): number {
    this.offset += 1;
    if (this.options.ignoreBounds && this.offset > this.buffer.byteLength) return 0;
    return this.buffer.getUint8(this.offset - 1);
  }
  readInt16(): number {
    this.offset += 2;
    if (this.options.ignoreBounds && this.offset > this.buffer.byteLength) return 0;
    return this.buffer.getInt16(this.offset - 2, true);
  }
  readUInt16(): number {
    this.offset += 2;
    if (this.options.ignoreBounds && this.offset > this.buffer.byteLength) return 0;
    return this.buffer.getUint16(this.offset - 2, true);
  }
  readInt32(): number {
    this.offset += 4;
    if (this.options.ignoreBounds && this.offset > this.buffer.byteLength) return 0;
    return this.buffer.getInt32(this.offset - 4, true);
  }
  readUInt32(): number {
    this.offset += 4;
    if (this.options.ignoreBounds && this.offset > this.buffer.byteLength) return 0;
    return this.buffer.getUint32(this.offset - 4, true);
  }
  readFloat32(): number {
    this.offset += 4;
    if (this.options.ignoreBounds && this.offset > this.buffer.byteLength) return 0;
    return this.buffer.getFloat32(this.offset - 4, true);
  }
  readFloat64(): number {
    this.offset += 8;
    if (this.options.ignoreBounds && this.offset > this.buffer.byteLength) return 0;
    return this.buffer.getFloat64(this.offset - 8, true);
  }
  readBoolean(): boolean {
    return !!this.readUInt8();
  }
  readBytes(count: number): Uint8Array {
    const data: number[] = [];
    for (let i = 0; i < count; i++) data[i] = this.readUInt8();
    return new Uint8Array(data);
  }
  readString(length?: number): string {
    if (length === undefined) {
      length = 0;
      let shift = 0, byte: number;
      do {
        byte = this.readUInt8();
        length |= (byte & 127) << shift;
        shift += 7;
      } while (byte & 128);
    }
    return new TextDecoder().decode(this.readBytes(length));
  }
  skipBytes(count: number): void {
    this.offset += count;
  }
  jumpTo(offset: number): void {
    this.offset = offset;
  }
  parseBitsByte(size: number): boolean[] {
    const bytes: number[] = [];
    for (let i = size; i > 0; i -= 8) bytes.push(this.readUInt8());
    const bitValues: boolean[] = [];
    for (let i = 0, j = 0; i < size; i++, j++) {
      if (j === 8) j = 0;
      bitValues[i] = (bytes[~~(i / 8)] & (1 << j)) > 0;
    }
    return bitValues;
  }
  parseGuid(bytes: Uint8Array): string {
    const b = Array.from(bytes);
    return b.slice(0, 4).reverse()
      .concat(b.slice(4, 6).reverse())
      .concat(b.slice(6, 8).reverse())
      .concat(b.slice(8))
      .map((byte, i) => ("00" + byte.toString(16)).slice(-2) + ([4, 6, 8, 10].includes(i) ? "-" : ""))
      .join("");
  }
}

// ── World parser ──────────────────────────────────────────────────────────────

interface WorldNecessary {
  version: number;
  pointers: number[];
  importants: boolean[];
  width: number;
  height: number;
}

interface Tile {
  blockId?:    number;
  frameX?:     number;
  frameY?:     number;
  blockColor?: number;
  wallId?:     number;
  wallColor?:  number;
  liquidAmount?: number;
  liquidType?: string;
  wireRed?:    boolean;
  wireBlue?:   boolean;
  wireGreen?:  boolean;
  wireYellow?: boolean;
  slope?:      string;
  actuator?:   boolean;
  actuated?:   boolean;
  invisibleBlock?: boolean;
  invisibleWall?:  boolean;
  fullBrightBlock?: boolean;
  fullBrightWall?:  boolean;
}

class TerrariaWorldParser extends TerrariaFileParser {
  world!: WorldNecessary;
  options: any = {};

  parseNecessaryData(): WorldNecessary {
    let version: number, magicNumber: string, fileType: number,
        pointers: number[], importants: boolean[], height: number, width: number;

    this.offset = 0;

    try {
      version    = this.readInt32();
      magicNumber = this.readString(7);
      fileType   = this.readUInt8();
      this.skipBytes(12);
      pointers = [0];
      for (let i = this.readInt16(); i > 0; i--) pointers.push(this.readInt32());
      importants = this.parseBitsByte(this.readInt16());
      this.readString();
      this.readString();
      this.skipBytes(44);
      height = this.readInt32();
      width  = this.readInt32();
    } catch (e) {
      throw new Error("Invalid file type");
    }

    this.offset = 0;

    if (magicNumber! !== "relogic" || fileType! !== 2)
      throw new Error("Invalid file type");
    if (version! < 194)
      throw new Error("Map version is older than 1.3.5.3 and cannot be parsed");

    return { version: version!, pointers: pointers!, importants: importants!, width: width!, height: height! };
  }

  parseHeader(): any {
    const data: any = {};
    data.mapName    = this.readString();
    data.seedText   = this.readString();
    data.worldGeneratorVersion = this.readBytes(8);
    data.guid       = this.readBytes(16);
    data.guidString = this.parseGuid(data.guid);
    data.worldId    = this.readInt32();
    data.leftWorld  = this.readInt32();
    data.rightWorld = this.readInt32();
    data.topWorld   = this.readInt32();
    data.bottomWorld = this.readInt32();
    data.maxTilesY  = this.readInt32();
    data.maxTilesX  = this.readInt32();

    if (this.world.version >= 225) {
      data.gameMode    = this.readInt32();
      data.drunkWorld  = this.readBoolean();
      if (this.world.version >= 227) data.getGoodWorld              = this.readBoolean();
      if (this.world.version >= 238) data.getTenthAnniversaryWorld  = this.readBoolean();
      if (this.world.version >= 239) data.dontStarveWorld           = this.readBoolean();
      if (this.world.version >= 241) data.notTheBeesWorld           = this.readBoolean();
      if (this.world.version >= 249) data.remixWorld                = this.readBoolean();
      if (this.world.version >= 266) data.noTrapsWorld              = this.readBoolean();
      if (this.world.version >= 267) data.zenithWorld               = this.readBoolean();
    } else {
      data.expertMode = this.readBoolean();
    }

    data.creationTime = this.readBytes(8);
    data.moonType     = this.readUInt8();
    data.treeX        = [this.readInt32(), this.readInt32(), this.readInt32()];
    data.treeStyle    = [this.readInt32(), this.readInt32(), this.readInt32(), this.readInt32()];
    data.caveBackX    = [this.readInt32(), this.readInt32(), this.readInt32()];
    data.caveBackStyle = [this.readInt32(), this.readInt32(), this.readInt32(), this.readInt32()];
    data.iceBackStyle    = this.readInt32();
    data.jungleBackStyle = this.readInt32();
    data.hellBackStyle   = this.readInt32();
    data.spawnTileX  = this.readInt32();
    data.spawnTileY  = this.readInt32();
    data.worldSurface = this.readFloat64();
    data.rockLayer    = this.readFloat64();
    data.tempTime     = this.readFloat64();
    data.tempDayTime  = this.readBoolean();
    data.tempMoonPhase = this.readInt32();
    data.tempBloodMoon = this.readBoolean();
    data.tempEclipse   = this.readBoolean();
    data.dungeonX = this.readInt32();
    data.dungeonY = this.readInt32();
    data.crimson  = this.readBoolean();
    data.downedBoss1       = this.readBoolean();
    data.downedBoss2       = this.readBoolean();
    data.downedBoss3       = this.readBoolean();
    data.downedQueenBee    = this.readBoolean();
    data.downedMechBoss1   = this.readBoolean();
    data.downedMechBoss2   = this.readBoolean();
    data.downedMechBoss3   = this.readBoolean();
    data.downedMechBossAny = this.readBoolean();
    data.downedPlantBoss   = this.readBoolean();
    data.downedGolemBoss   = this.readBoolean();
    data.downedSlimeKing   = this.readBoolean();
    data.savedGoblin   = this.readBoolean();
    data.savedWizard   = this.readBoolean();
    data.savedMech     = this.readBoolean();
    data.downedGoblins = this.readBoolean();
    data.downedClown   = this.readBoolean();
    data.downedFrost   = this.readBoolean();
    data.downedPirates = this.readBoolean();
    data.shadowOrbSmashed = this.readBoolean();
    data.spawnMeteor      = this.readBoolean();
    data.shadowOrbCount   = this.readUInt8();
    data.altarCount = this.readInt32();
    data.hardMode   = this.readBoolean();
    data.afterPartyOfDoom = this.world.version >= 257 ? this.readBoolean() : false;
    data.invasionDelay = this.readInt32();
    data.invasionSize  = this.readInt32();
    data.invasionType  = this.readInt32();
    data.invasionX     = this.readFloat64();
    data.slimeRainTime    = this.readFloat64();
    data.sundialCooldown  = this.readUInt8();
    data.tempRaining      = this.readBoolean();
    data.tempRainTime     = this.readInt32();
    data.tempMaxRain      = this.readFloat32();
    data.oreTier1 = this.readInt32();
    data.oreTier2 = this.readInt32();
    data.oreTier3 = this.readInt32();
    data.setBG0 = this.readUInt8(); data.setBG1 = this.readUInt8();
    data.setBG2 = this.readUInt8(); data.setBG3 = this.readUInt8();
    data.setBG4 = this.readUInt8(); data.setBG5 = this.readUInt8();
    data.setBG6 = this.readUInt8(); data.setBG7 = this.readUInt8();
    data.cloudBGActive = this.readInt32();
    data.numClouds     = this.readInt16();
    data.windSpeed     = this.readFloat32();

    data.anglerWhoFinishedToday = [];
    for (let i = this.readInt32(); i > 0; --i)
      data.anglerWhoFinishedToday.push(this.readString());

    data.savedAngler      = this.readBoolean();
    data.anglerQuest      = this.readInt32();
    data.savedStylist     = this.readBoolean();
    data.savedTaxCollector = this.readBoolean();
    if (this.world.version >= 225) data.savedGolfer = this.readBoolean();

    data.invasionSizeStart  = this.readInt32();
    data.tempCultistDelay   = this.readInt32();
    data.killCount = [];
    for (let i = this.readInt16(); i > 0; i--) data.killCount.push(this.readInt32());

    data.fastForwardTimeToDawn  = this.readBoolean();
    data.downedFishron          = this.readBoolean();
    data.downedMartians         = this.readBoolean();
    data.downedAncientCultist   = this.readBoolean();
    data.downedMoonlord         = this.readBoolean();
    data.downedHalloweenKing    = this.readBoolean();
    data.downedHalloweenTree    = this.readBoolean();
    data.downedChristmasIceQueen = this.readBoolean();
    data.downedChristmasSantank  = this.readBoolean();
    data.downedChristmasTree     = this.readBoolean();
    data.downedTowerSolar    = this.readBoolean();
    data.downedTowerVortex   = this.readBoolean();
    data.downedTowerNebula   = this.readBoolean();
    data.downedTowerStardust = this.readBoolean();
    data.TowerActiveSolar    = this.readBoolean();
    data.TowerActiveVortex   = this.readBoolean();
    data.TowerActiveNebula   = this.readBoolean();
    data.TowerActiveStardust = this.readBoolean();
    data.LunarApocalypseIsUp = this.readBoolean();
    data.tempPartyManual     = this.readBoolean();
    data.tempPartyGenuine    = this.readBoolean();
    data.tempPartyCooldown   = this.readInt32();
    data.tempPartyCelebratingNPCs = [];
    for (let i = this.readInt32(); i > 0; i--)
      data.tempPartyCelebratingNPCs.push(this.readInt32());

    data.Temp_Sandstorm_Happening         = this.readBoolean();
    data.Temp_Sandstorm_TimeLeft          = this.readInt32();
    data.Temp_Sandstorm_Severity          = this.readFloat32();
    data.Temp_Sandstorm_IntendedSeverity  = this.readFloat32();
    data.savedBartender          = this.readBoolean();
    data.DD2Event_DownedInvasionT1 = this.readBoolean();
    data.DD2Event_DownedInvasionT2 = this.readBoolean();
    data.DD2Event_DownedInvasionT3 = this.readBoolean();

    if (this.world.version >= 225) {
      data.setBG8  = this.readUInt8(); data.setBG9  = this.readUInt8();
      data.setBG10 = this.readUInt8(); data.setBG11 = this.readUInt8();
      data.setBG12 = this.readUInt8();
      data.combatBookWasUsed          = this.readBoolean();
      data.lanternNightCooldown       = this.readInt32();
      data.lanternNightGenuine        = this.readBoolean();
      data.lanternNightManual         = this.readBoolean();
      data.lanternNightNextNightIsGenuine = this.readBoolean();
      data.treeTopsVariations = [];
      for (let i = this.readInt32(); i > 0; i--)
        data.treeTopsVariations.push(this.readInt32());
      data.forceHalloweenForToday = this.readBoolean();
      data.forceXMasForToday      = this.readBoolean();
      data.savedOreTierCopper = this.readInt32();
      data.savedOreTierIron   = this.readInt32();
      data.savedOreTierSilver = this.readInt32();
      data.savedOreTierGold   = this.readInt32();
      data.boughtCat    = this.readBoolean();
      data.boughtDog    = this.readBoolean();
      data.boughtBunny  = this.readBoolean();
      data.downedEmpressOfLight = this.readBoolean();
      data.downedQueenSlime     = this.readBoolean();
    }
    if (this.world.version >= 240) data.downedDeerclops = this.readBoolean();
    if (this.world.version >= 269) {
      data.unlockedSlimeBlueSpawn     = this.readBoolean();
      data.unlockedMerchantSpawn      = this.readBoolean();
      data.unlockedDemolitionistSpawn = this.readBoolean();
      data.unlockedPartyGirlSpawn     = this.readBoolean();
      data.unlockedDyeTraderSpawn     = this.readBoolean();
      data.unlockedTruffleSpawn       = this.readBoolean();
      data.unlockedArmsDealerSpawn    = this.readBoolean();
      data.unlockedNurseSpawn         = this.readBoolean();
      data.unlockedPrincessSpawn      = this.readBoolean();
      data.combatBookVolumeTwoWasUsed = this.readBoolean();
      data.peddlersSatchelWasUsed     = this.readBoolean();
      data.unlockedSlimeGreenSpawn    = this.readBoolean();
      data.unlockedSlimeOldSpawn      = this.readBoolean();
      data.unlockedSlimePurpleSpawn   = this.readBoolean();
      data.unlockedSlimeRainbowSpawn  = this.readBoolean();
      data.unlockedSlimeRedSpawn      = this.readBoolean();
      data.unlockedSlimeYellowSpawn   = this.readBoolean();
      data.unlockedSlimeCopperSpawn   = this.readBoolean();
      data.fastForwardTimeToDusk      = this.readBoolean();
      data.moondialCooldown           = this.readUInt8();
    }

    return data;
  }

  parseTileData(): Tile {
    const tile: Tile = {};
    const flags1 = this.readUInt8();
    let flags2: number | undefined, flags3: number | undefined, flags4: number | undefined;

    if (flags1 & 1) {
      flags2 = this.readUInt8();
      if (flags2 & 1) {
        flags3 = this.readUInt8();
        if (flags3 & 1) flags4 = this.readUInt8();
      }
    }

    if (flags1 > 1) {
      if (flags1 & 2) {
        tile.blockId = (flags1 & 32) ? this.readUInt16() : this.readUInt8();
        if (this.world.importants[tile.blockId]) {
          tile.frameX = this.readInt16();
          tile.frameY = this.readInt16();
          if (tile.blockId === 144) tile.frameY = 0;
        }
        if (flags3 && (flags3 & 8)) tile.blockColor = this.readUInt8();
      }
      if (flags1 & 4) {
        tile.wallId = this.readUInt8();
        if (flags3 && (flags3 & 16)) tile.wallColor = this.readUInt8();
      }
      const liquidType = (flags1 & 24) >> 3;
      if (liquidType) {
        tile.liquidAmount = this.readUInt8();
        if (flags3 && (flags3 & 128)) {
          tile.liquidType = "shimmer";
        } else {
          switch (liquidType) {
            case 1: tile.liquidType = "water"; break;
            case 2: tile.liquidType = "lava";  break;
            case 3: tile.liquidType = "honey"; break;
          }
        }
      }
    }

    if (flags2) {
      if (flags2 & 2)  tile.wireRed   = true;
      if (flags2 & 4)  tile.wireBlue  = true;
      if (flags2 & 8)  tile.wireGreen = true;
      const slope = (flags2 & 112) >> 4;
      if (slope) switch (slope) {
        case 1: tile.slope = "half"; break;
        case 2: tile.slope = "TR";   break;
        case 3: tile.slope = "TL";   break;
        case 4: tile.slope = "BR";   break;
        case 5: tile.slope = "BL";   break;
      }
      if (flags3) {
        if (flags3 & 2)  tile.actuator  = true;
        if (flags3 & 4)  tile.actuated  = true;
        if (flags3 & 32) tile.wireYellow = true;
        if (flags3 & 64) tile.wallId = (this.readUInt8() << 8) | (tile.wallId ?? 0);
        if (flags4) {
          if (flags4 & 2)  tile.invisibleBlock  = true;
          if (flags4 & 4)  tile.invisibleWall   = true;
          if (flags4 & 8)  tile.fullBrightBlock = true;
          if (flags4 & 16) tile.fullBrightWall  = true;
        }
      }
    }

    switch ((flags1 & 192) >> 6) {
      case 1: this.RLE = this.readUInt8();  break;
      case 2: this.RLE = this.readInt16();  break;
    }

    return tile;
  }

  parseWorldTiles(): Tile[][] {
    this.RLE = 0;
    const data: Tile[][] = new Array(this.world.width);
    for (let x = 0; x < this.world.width; x++) {
      data[x] = new Array(this.world.height);
      for (let y = 0; y < this.world.height; y++) {
        data[x][y] = this.parseTileData();
        while (this.RLE > 0) {
          data[x][y + 1] = data[x][y];
          y++;
          this.RLE--;
        }
      }
    }
    return data;
  }

  parse(options: { sections: string[], progressCallback?: (pct: number) => void }): any {
    this.options = {
      sections: ["fileFormatHeader","header","tiles"],
      progressCallback: undefined,
      ignorePointers: false,
      ...options,
    };
    this.options.sections = this.options.sections.map((s: string) => s.toLowerCase());

    if (this.options.progressCallback) {
      const onePercentSize = Math.floor(this.buffer.byteLength / 100);
      let nextPercentSize = onePercentSize;
      let percent = 0;
      let _offset = this.offset;
      Object.defineProperty(this, "offset", {
        get: () => _offset,
        set: (value: number) => {
          _offset = value;
          if (_offset >= nextPercentSize) {
            percent++;
            nextPercentSize += onePercentSize;
            this.options.progressCallback(percent);
          }
        }
      });
    }

    const data: any = {};
    this.world = this.parseNecessaryData();

    const sectionMap: Record<string, () => any> = {
      header: () => this.parseHeader(),
      tiles:  () => this.parseWorldTiles(),
    };

    for (const [name, fn] of Object.entries(sectionMap)) {
      if (this.options.sections.includes(name)) {
        const idx = Object.keys(sectionMap).indexOf(name) + 1;
        this.offset = this.world.pointers[idx];
        data[name] = fn();
      }
    }

    return data;
  }
}

// ── Color tables (auto-generated from TEdit settings.xml) ────────────────────

const TILE_COLORS: Record<number, [number, number, number]> = {
  0: [151,107,75],
  1: [128,128,128],
  2: [28,216,94],
  3: [27,197,109],
  4: [253,221,3],
  5: [151,107,75],
  6: [140,101,80],
  7: [150,67,22],
  8: [185,164,23],
  9: [185,194,195],
  10: [119,105,79],
  11: [119,105,79],
  12: [174,24,69],
  13: [133,213,247],
  14: [191,142,111],
  15: [191,142,111],
  16: [140,130,116],
  17: [144,148,144],
  18: [191,142,111],
  19: [191,142,111],
  20: [163,116,81],
  21: [233,207,94],
  22: [98,95,167],
  23: [141,137,223],
  24: [122,116,218],
  25: [109,90,128],
  26: [119,101,125],
  27: [226,196,49],
  28: [151,79,80],
  29: [175,105,128],
  30: [170,120,84],
  31: [141,120,168],
  32: [151,135,183],
  33: [253,221,3],
  34: [235,166,135],
  35: [197,216,219],
  36: [230,89,92],
  37: [104,86,84],
  38: [144,144,144],
  39: [181,62,59],
  40: [146,81,68],
  41: [66,84,109],
  42: [251,235,127],
  43: [84,100,63],
  44: [107,68,99],
  45: [185,164,23],
  46: [185,194,195],
  47: [150,67,22],
  48: [128,128,128],
  49: [43,143,255],
  50: [170,48,114],
  51: [192,202,203],
  52: [23,177,76],
  53: [255,218,56],
  54: [200,246,254],
  55: [191,142,111],
  56: [43,40,84],
  57: [68,68,76],
  58: [142,66,66],
  59: [92,68,73],
  60: [143,215,29],
  61: [135,196,26],
  62: [121,176,24],
  63: [110,140,182],
  64: [196,96,114],
  65: [56,150,97],
  66: [160,118,58],
  67: [140,58,166],
  68: [125,191,197],
  69: [190,150,92],
  70: [93,127,255],
  71: [182,175,130],
  72: [182,175,130],
  73: [27,197,109],
  74: [96,197,27],
  75: [36,36,36],
  76: [142,66,66],
  77: [238,85,70],
  78: [121,110,97],
  79: [191,142,111],
  80: [73,120,17],
  81: [245,133,191],
  82: [255,120,0],
  83: [255,120,0],
  84: [255,120,0],
  85: [192,192,192],
  86: [191,142,111],
  87: [191,142,111],
  88: [191,142,111],
  89: [191,142,111],
  90: [144,148,144],
  91: [13,88,130],
  92: [213,229,237],
  93: [253,221,3],
  94: [191,142,111],
  95: [255,162,31],
  96: [144,148,144],
  97: [144,148,144],
  98: [253,221,3],
  99: [144,148,144],
  100: [253,221,3],
  101: [191,142,111],
  102: [229,212,73],
  103: [141,98,77],
  104: [191,142,111],
  105: [144,148,144],
  106: [191,142,111],
  107: [11,80,143],
  108: [91,169,169],
  109: [78,193,227],
  110: [48,186,135],
  111: [128,26,52],
  112: [103,98,122],
  113: [48,208,234],
  114: [191,142,111],
  115: [33,171,207],
  116: [238,225,218],
  117: [181,172,190],
  118: [238,225,218],
  119: [107,92,108],
  120: [92,68,73],
  121: [11,80,143],
  122: [91,169,169],
  123: [106,107,118],
  124: [73,51,36],
  125: [141,175,255],
  126: [159,209,229],
  127: [128,204,230],
  128: [191,142,111],
  129: [255,117,224],
  130: [160,160,160],
  131: [52,52,52],
  132: [144,148,144],
  133: [231,53,56],
  134: [166,187,153],
  135: [253,114,114],
  136: [213,203,204],
  137: [144,148,144],
  138: [96,96,96],
  139: [191,142,111],
  140: [98,95,167],
  141: [192,59,59],
  142: [144,148,144],
  143: [144,148,144],
  144: [144,148,144],
  145: [192,30,30],
  146: [43,192,30],
  147: [211,236,241],
  148: [181,211,210],
  149: [220,50,50],
  150: [128,26,52],
  151: [190,171,94],
  152: [128,133,184],
  153: [239,141,126],
  154: [190,171,94],
  155: [131,162,161],
  156: [170,171,157],
  157: [104,100,126],
  158: [145,81,85],
  159: [148,133,98],
  160: [0,0,200],
  161: [144,195,232],
  162: [184,219,240],
  163: [174,145,214],
  164: [218,182,204],
  165: [100,100,100],
  166: [129,125,93],
  167: [62,82,114],
  168: [132,157,127],
  169: [152,171,198],
  170: [228,219,162],
  171: [33,135,85],
  172: [181,194,217],
  173: [253,221,3],
  174: [253,221,3],
  175: [129,125,93],
  176: [132,157,127],
  177: [152,171,198],
  178: [255,0,255],
  179: [49,134,114],
  180: [126,134,49],
  181: [134,59,49],
  182: [43,86,140],
  183: [121,49,134],
  184: [100,100,100],
  185: [149,149,115],
  186: [255,0,255],
  187: [255,0,255],
  188: [73,120,17],
  189: [223,255,255],
  190: [182,175,130],
  191: [151,107,75],
  192: [26,196,84],
  193: [56,121,255],
  194: [157,157,107],
  195: [134,22,34],
  196: [147,144,178],
  197: [97,200,225],
  198: [62,61,52],
  199: [208,80,80],
  200: [216,152,144],
  201: [203,61,64],
  202: [213,178,28],
  203: [128,44,45],
  204: [125,55,65],
  205: [186,50,52],
  206: [124,175,201],
  207: [144,148,144],
  208: [88,105,118],
  209: [144,148,144],
  210: [192,59,59],
  211: [191,233,115],
  212: [144,148,144],
  213: [137,120,67],
  214: [103,103,103],
  215: [254,121,2],
  216: [191,142,111],
  217: [144,148,144],
  218: [144,148,144],
  219: [144,148,144],
  220: [144,148,144],
  221: [239,90,50],
  222: [231,96,228],
  223: [57,85,101],
  224: [107,132,139],
  225: [227,125,22],
  226: [141,56,0],
  227: [255,255,255],
  228: [144,148,144],
  229: [255,156,12],
  230: [131,79,13],
  231: [224,194,101],
  232: [145,81,85],
  233: [255,0,255],
  234: [53,44,41],
  235: [214,184,46],
  236: [149,232,87],
  237: [255,241,51],
  238: [225,128,206],
  239: [224,194,101],
  240: [99,50,30],
  241: [77,74,72],
  242: [99,50,30],
  243: [140,179,254],
  244: [200,245,253],
  245: [99,50,30],
  246: [99,50,30],
  247: [140,150,150],
  248: [219,71,38],
  249: [249,52,243],
  250: [76,74,83],
  251: [235,150,23],
  252: [153,131,44],
  253: [57,48,97],
  254: [248,158,92],
  255: [107,49,154],
  256: [154,148,49],
  257: [49,49,154],
  258: [49,154,68],
  259: [154,49,77],
  260: [85,89,118],
  261: [154,83,49],
  262: [221,79,255],
  263: [250,255,79],
  264: [79,102,255],
  265: [79,255,89],
  266: [255,79,79],
  267: [240,240,247],
  268: [255,145,79],
  269: [191,142,111],
  270: [122,217,232],
  271: [122,217,232],
  272: [121,119,101],
  273: [128,128,128],
  274: [190,171,94],
  275: [122,217,232],
  276: [122,217,232],
  277: [122,217,232],
  278: [122,217,232],
  279: [122,217,232],
  280: [122,217,232],
  281: [122,217,232],
  282: [122,217,232],
  283: [128,128,128],
  284: [150,67,22],
  285: [122,217,232],
  286: [122,217,232],
  287: [79,128,17],
  288: [122,217,232],
  289: [122,217,232],
  290: [122,217,232],
  291: [122,217,232],
  292: [122,217,232],
  293: [122,217,232],
  294: [122,217,232],
  295: [122,217,232],
  296: [122,217,232],
  297: [122,217,232],
  298: [122,217,232],
  299: [122,217,232],
  300: [144,148,144],
  301: [144,148,144],
  302: [144,148,144],
  303: [144,148,144],
  304: [144,148,144],
  305: [144,148,144],
  306: [144,148,144],
  307: [144,148,144],
  308: [144,148,144],
  309: [122,217,232],
  310: [122,217,232],
  311: [117,61,25],
  312: [204,93,73],
  313: [87,150,154],
  314: [181,164,125],
  315: [235,114,80],
  316: [122,217,232],
  317: [122,217,232],
  318: [122,217,232],
  319: [96,68,48],
  320: [203,185,151],
  321: [96,77,64],
  322: [198,170,104],
  323: [182,141,86],
  324: [228,213,173],
  325: [129,125,93],
  326: [9,61,191],
  327: [253,32,3],
  328: [200,246,254],
  329: [15,15,15],
  330: [226,118,76],
  331: [161,172,173],
  332: [204,181,72],
  333: [190,190,178],
  334: [191,142,111],
  335: [217,174,137],
  336: [253,62,3],
  337: [144,148,144],
  338: [85,255,160],
  339: [122,217,232],
  340: [96,248,2],
  341: [105,74,202],
  342: [29,240,255],
  343: [254,202,80],
  344: [131,252,245],
  345: [255,156,12],
  346: [149,212,89],
  347: [236,74,79],
  348: [44,26,233],
  349: [144,148,144],
  350: [55,97,155],
  351: [31,31,31],
  352: [238,97,94],
  353: [28,216,94],
  354: [141,107,89],
  355: [141,107,89],
  356: [233,203,24],
  357: [168,178,204],
  358: [122,217,232],
  359: [122,217,232],
  360: [122,217,232],
  361: [122,217,232],
  362: [122,217,232],
  363: [122,217,232],
  364: [122,217,232],
  365: [146,136,205],
  366: [223,232,233],
  367: [168,178,204],
  368: [50,46,104],
  369: [50,46,104],
  370: [127,116,194],
  371: [249,101,189],
  372: [252,128,201],
  373: [9,61,191],
  374: [253,32,3],
  375: [255,156,12],
  376: [160,120,92],
  377: [191,142,111],
  378: [160,120,100],
  379: [251,209,240],
  380: [191,142,111],
  381: [254,121,2],
  382: [28,216,94],
  383: [221,136,144],
  384: [131,206,12],
  385: [87,21,144],
  386: [127,92,69],
  387: [127,92,69],
  388: [127,92,69],
  389: [127,92,69],
  390: [253,32,3],
  391: [122,217,232],
  392: [122,217,232],
  393: [122,217,232],
  394: [122,217,232],
  395: [191,142,111],
  396: [198,124,78],
  397: [212,192,100],
  398: [100,82,126],
  399: [77,76,66],
  400: [96,68,117],
  401: [68,60,51],
  402: [174,168,186],
  403: [205,152,186],
  404: [140,84,60],
  405: [140,140,140],
  406: [120,120,120],
  407: [255,227,132],
  408: [85,83,82],
  409: [85,83,82],
  410: [75,139,166],
  411: [227,46,46],
  412: [75,139,166],
  413: [122,217,232],
  414: [122,217,232],
  415: [249,75,7],
  416: [0,160,170],
  417: [160,87,234],
  418: [22,173,254],
  419: [117,125,151],
  420: [255,255,255],
  421: [73,70,70],
  422: [73,70,70],
  423: [255,255,255],
  424: [146,155,187],
  425: [174,195,215],
  426: [77,11,35],
  427: [119,22,52],
  428: [255,255,255],
  429: [63,63,63],
  430: [23,119,79],
  431: [23,54,119],
  432: [119,68,23],
  433: [74,23,119],
  434: [78,82,109],
  435: [39,168,96],
  436: [39,94,168],
  437: [168,121,39],
  438: [111,39,168],
  439: [150,148,174],
  440: [255,255,255],
  441: [255,255,255],
  442: [3,144,201],
  443: [123,123,123],
  444: [191,176,124],
  445: [55,55,73],
  446: [255,66,152],
  447: [179,132,255],
  448: [0,206,180],
  449: [91,186,240],
  450: [92,240,91],
  451: [240,91,147],
  452: [255,150,181],
  453: [255,255,255],
  454: [174,16,176],
  455: [48,255,110],
  456: [179,132,255],
  457: [255,255,255],
  458: [211,198,111],
  459: [190,223,232],
  460: [141,163,181],
  461: [255,222,100],
  462: [231,178,28],
  463: [155,214,240],
  464: [233,183,128],
  465: [51,84,195],
  466: [205,153,73],
  467: [233,207,94],
  468: [255,255,255],
  469: [191,142,111],
  583: [113,113,113],
  584: [113,113,113],
  585: [113,113,113],
  587: [113,113,113],
  588: [113,113,113],
  589: [113,113,113],
  596: [110,91,77],
  616: [133,79,77],
};

const WALL_COLORS: Record<number, [number, number, number]> = {
  0: [0,0,0],
  1: [53,53,53],
  2: [87,60,48],
  3: [47,41,53],
  4: [69,50,37],
  5: [59,59,59],
  6: [76,44,41],
  7: [46,50,67],
  8: [49,61,61],
  9: [75,46,70],
  10: [107,91,34],
  11: [79,85,86],
  12: [101,57,25],
  13: [77,48,43],
  14: [12,12,12],
  15: [49,43,44],
  16: [81,63,54],
  17: [46,50,67],
  18: [49,61,61],
  19: [75,46,70],
  20: [12,12,12],
  21: [54,89,98],
  22: [97,92,94],
  23: [56,44,58],
  24: [49,40,42],
  25: [18,66,98],
  26: [34,64,54],
  27: [58,48,42],
  28: [77,70,81],
  29: [112,58,68],
  30: [56,115,80],
  31: [94,101,108],
  32: [102,20,48],
  33: [48,48,73],
  34: [86,83,57],
  35: [54,59,82],
  36: [124,70,63],
  37: [89,84,55],
  38: [60,90,70],
  39: [89,89,84],
  40: [100,118,129],
  41: [57,55,64],
  42: [62,25,27],
  43: [60,55,44],
  44: [51,51,51],
  45: [65,63,57],
  46: [68,83,69],
  47: [66,70,82],
  48: [78,69,83],
  49: [81,74,63],
  50: [56,66,81],
  51: [50,73,59],
  52: [82,59,64],
  53: [70,79,81],
  54: [46,58,54],
  55: [56,56,46],
  56: [57,49,49],
  57: [45,51,56],
  58: [56,48,59],
  59: [80,63,55],
  60: [0,49,17],
  61: [55,40,28],
  62: [32,28,22],
  63: [25,67,38],
  64: [47,67,25],
  65: [25,67,38],
  66: [25,67,38],
  67: [47,67,25],
  68: [25,67,38],
  69: [36,37,57],
  70: [25,61,67],
  71: [82,108,134],
  72: [45,84,24],
  73: [211,217,219],
  74: [54,60,113],
  75: [61,61,44],
  76: [26,51,111],
  77: [75,18,22],
  78: [58,35,24],
  79: [36,33,65],
  80: [54,60,113],
  81: [101,52,52],
  82: [56,19,0],
  83: [62,44,45],
  84: [78,105,131],
  85: [32,39,45],
  86: [121,80,36],
  87: [28,8,10],
  88: [115,68,124],
  89: [129,114,74],
  90: [62,86,123],
  91: [90,121,94],
  92: [135,62,61],
  93: [100,96,103],
  94: [36,48,57],
  95: [48,46,58],
  96: [71,46,73],
  97: [76,46,64],
  98: [51,63,57],
  99: [49,58,64],
  100: [36,48,57],
  101: [48,46,58],
  102: [71,46,73],
  103: [76,46,64],
  104: [51,63,57],
  105: [49,58,64],
  106: [97,72,51],
  107: [53,53,53],
  108: [121,80,36],
  109: [110,37,19],
  110: [135,57,137],
  111: [33,25,21],
  112: [28,8,10],
  113: [160,75,7],
  114: [54,42,19],
  115: [42,30,53],
  116: [60,34,25],
  117: [91,83,64],
  118: [59,61,54],
  119: [47,39,25],
  120: [80,88,111],
  121: [186,167,138],
  122: [110,119,143],
  123: [138,128,110],
  124: [7,48,30],
  125: [78,103,70],
  126: [109,111,123],
  127: [112,166,226],
  128: [69,56,140],
  129: [72,44,145],
  130: [114,85,121],
  131: [104,119,158],
  132: [74,74,74],
  133: [95,119,191],
  134: [144,79,22],
  135: [62,130,138],
  136: [61,98,169],
  137: [183,84,14],
  138: [61,57,69],
  139: [74,32,34],
  140: [110,100,76],
  141: [66,70,60],
  142: [214,206,187],
  143: [83,106,99],
  144: [89,67,68],
  145: [120,120,120],
  146: [103,55,24],
  147: [77,77,77],
  148: [229,218,161],
  149: [82,70,65],
  150: [81,69,62],
  151: [103,76,36],
  152: [103,76,36],
  153: [255,116,63],
  154: [191,63,255],
  155: [219,219,232],
  156: [63,255,71],
  157: [118,63,37],
  158: [81,37,118],
  159: [64,67,89],
  160: [37,118,52],
  161: [118,37,58],
  162: [37,37,118],
  163: [118,113,37],
  164: [255,63,63],
  165: [63,81,255],
  166: [239,255,63],
  167: [78,77,58],
  168: [84,97,84],
  169: [92,105,90],
  170: [93,68,47],
  171: [84,60,39],
  172: [168,125,0],
  173: [49,105,25],
  174: [69,48,54],
  175: [33,50,188],
  176: [75,128,148],
  177: [72,50,46],
  178: [120,127,143],
  179: [124,131,148],
  180: [15,16,45],
  181: [31,31,74],
  182: [57,55,99],
  183: [120,127,143],
  184: [15,16,45],
  185: [61,61,61],
  186: [55,23,100],
  187: [126,68,43],
  188: [63,47,63],
  189: [65,51,77],
  190: [67,72,59],
  191: [60,38,67],
  192: [123,56,47],
  193: [87,24,26],
  194: [102,64,53],
  195: [122,46,54],
  196: [99,70,55],
  197: [102,73,57],
  198: [92,65,49],
  199: [106,75,58],
  200: [81,33,83],
  201: [96,79,99],
  202: [124,42,104],
  203: [111,54,112],
  204: [75,68,55],
  205: [83,83,59],
  206: [39,67,44],
  207: [77,77,55],
  208: [92,36,28],
  209: [96,48,39],
  210: [108,44,26],
  211: [106,42,38],
  212: [70,69,61],
  213: [57,60,57],
  214: [69,57,59],
  215: [71,60,66],
  216: [148,93,52],
  217: [51,38,65],
  218: [43,24,22],
  219: [78,73,114],
  220: [54,36,68],
  221: [73,18,12],
  222: [58,47,81],
  223: [115,65,34],
  224: [103,112,104],
  225: [76,71,56],
  226: [133,124,66],
  227: [83,101,112],
  228: [139,0,64],
  229: [80,12,162],
  230: [0,93,81],
  231: [81,68,62],
  232: [37,47,57],
  233: [72,53,55],
  234: [103,46,48],
  235: [126,68,43],
  236: [63,35,34],
  237: [57,34,33],
  238: [45,46,54],
  239: [43,52,56],
  240: [62,45,33],
  241: [146,95,53],
  242: [78,69,55],
  243: [23,52,86],
  244: [58,35,24],
  245: [74,74,74],
  246: [47,41,53],
  247: [49,43,44],
  248: [77,70,81],
  249: [100,118,129],
  250: [78,69,83],
  251: [81,74,63],
  252: [56,66,81],
  253: [50,73,59],
  254: [82,59,64],
  255: [70,79,81],
  256: [46,58,54],
  257: [56,56,46],
  258: [57,49,49],
  259: [45,51,56],
  260: [56,48,59],
  261: [80,63,55],
  262: [55,40,28],
  263: [32,28,22],
  264: [36,37,57],
  265: [25,61,67],
  266: [82,108,134],
  267: [36,33,65],
  268: [101,52,52],
  269: [62,44,45],
  270: [93,68,47],
  271: [84,60,39],
  272: [120,127,143],
  273: [15,16,45],
  274: [61,61,61],
  275: [126,68,43],
  276: [63,47,63],
  277: [65,51,77],
  278: [67,72,59],
  279: [60,38,67],
  280: [123,56,47],
  281: [87,24,26],
  282: [102,64,53],
  283: [122,46,54],
  284: [99,70,55],
  285: [102,73,57],
  286: [92,65,49],
  287: [106,75,58],
  288: [81,33,83],
  289: [96,79,99],
  290: [124,42,104],
  291: [111,54,112],
  292: [75,68,55],
  293: [83,83,59],
  294: [39,67,44],
  295: [77,77,55],
  296: [92,36,28],
  297: [96,48,39],
  298: [108,44,26],
  299: [106,42,38],
  300: [70,69,61],
  301: [57,60,57],
  302: [69,57,59],
  303: [71,60,66],
  304: [148,93,52],
  305: [51,38,65],
  306: [43,24,22],
  307: [78,73,114],
  308: [54,36,68],
  309: [73,18,12],
  310: [58,47,81],
  311: [115,65,34],
  312: [36,65,16],
  313: [33,61,19],
  314: [74,58,44],
  315: [114,120,45],
  316: [58,52,64],
  317: [80,70,82],
  318: [6,6,34],
  319: [91,48,82],
  320: [66,39,27],
  321: [62,83,108],
  322: [58,84,115],
  323: [99,94,105],
  324: [80,92,104],
  325: [56,95,124],
  326: [92,94,80],
  327: [62,102,116],
  328: [98,103,105],
  329: [87,92,118],
  330: [84,89,105],
  331: [42,44,81],
  332: [34,66,26],
  333: [64,25,49],
  334: [76,66,32],
  335: [60,65,67],
  336: [76,45,32],
  337: [37,36,59],
  338: [57,34,32],
  339: [19,43,60],
  340: [42,67,60],
  341: [104,23,0],
  342: [91,9,65],
  343: [17,89,43],
  344: [5,65,94],
  345: [58,6,81],
  346: [255,0,255],
  347: [255,0,255],
  348: [255,0,255],
  349: [255,0,255],
  350: [255,0,255],
  351: [255,0,255],
  352: [255,0,255],
  353: [255,0,255],
  354: [255,0,255],
  355: [255,0,255],
  356: [255,0,255],
  357: [255,0,255],
  358: [255,0,255],
  359: [255,0,255],
  360: [255,0,255],
  361: [255,0,255],
  362: [255,0,255],
  363: [255,0,255],
  364: [255,0,255],
  365: [255,0,255],
  366: [255,0,255],
};

const LIQUID_COLORS: Record<string, [number, number, number]> = {
  water:   [9,   61,  191],
  lava:    [200, 60,  10 ],
  honey:   [180, 140, 20 ],
  shimmer: [180, 120, 220],
};

// Depth background colors
const BG_SKY:         [number, number, number] = [91,  172, 255];
const BG_UNDERGROUND: [number, number, number] = [73,  58,  50 ];
const BG_CAVERN:      [number, number, number] = [52,  40,  32 ];
const BG_HELL:        [number, number, number] = [47,  18,  5  ];

// Modded tile placeholder — cycles through distinct muted hues
const MOD_TILE_COLORS: [number, number, number][] = [
  [160, 120, 120], [120, 160, 120], [120, 120, 160], [160, 160, 100],
  [100, 160, 160], [160, 100, 160], [140, 140, 120], [120, 140, 140],
];

// ── Handler ──────────────────────────────────────────────────────────────────

const WldHandler: FormatHandler = {
  name: "WldHandler",
  ready: true,
  init: async () => { WldHandler.ready = true; },

  supportedFormats: [
    {
      name:      "Terraria World",
      format:    "wld",
      extension: "wld",
      mime:      "application/x-terraria-world",
      from:      true,
      to:        false,
      internal:  "wld",
    },
    {
      name:      "Portable Network Graphics (WldHandler)",
      format:    "png",
      extension: "png",
      mime:      "image/png",
      from:      false,
      to:        true,
      internal:  "png",
    },
  ],

  doConvert: async (
    inputFiles: FileData[],
    _inputFormat: FileFormat,
    _outputFormat: FileFormat,
  ): Promise<FileData[]> => {
    const results: FileData[] = [];

    for (const file of inputFiles) {
      window.showPopup("<h2>Parsing world file...</h2><p>This may take a moment for large worlds.</p>");

      const blob   = new Blob([file.bytes], { type: "application/octet-stream" });
      const asFile = new File([blob], file.name);

      const parser = new TerrariaWorldParser();
      await parser.loadFile(asFile);

      const world = parser.parse({
        sections: ["header", "tiles"],
        progressCallback: (pct: number) => {
          window.showPopup(`<h2>Parsing world file...</h2><p>Reading tiles: ${pct}%</p>`);
        },
      });

      const width     = world.header.maxTilesX;
      const height    = world.header.maxTilesY;
      const surface   = Math.floor(world.header.worldSurface);
      const rockLayer = Math.floor(world.header.rockLayer);
      const hellLayer = height - 200;

      window.showPopup(`<h2>Rendering ${width}×${height} world...</h2>`);

      const canvas  = document.createElement("canvas");
      canvas.width  = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      const img = ctx.createImageData(width, height);

      for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
          const tile = world.tiles[x][y];
          const i    = (y * width + x) * 4;

          let color: [number, number, number];

          if (tile.blockId !== undefined) {
            color = tile.blockId > 419
              ? MOD_TILE_COLORS[tile.blockId % MOD_TILE_COLORS.length]
              : (TILE_COLORS[tile.blockId] ?? [255, 0, 255]);
          } else if (tile.liquidType) {
            color = LIQUID_COLORS[tile.liquidType] ?? [9, 61, 191];
          } else if (tile.wallId !== undefined && tile.wallId > 0) {
            color = WALL_COLORS[tile.wallId] ?? [60, 60, 60];
          } else {
            if      (y < surface)   color = BG_SKY;
            else if (y < rockLayer) color = BG_UNDERGROUND;
            else if (y < hellLayer) color = BG_CAVERN;
            else                    color = BG_HELL;
          }

          img.data[i]   = color[0];
          img.data[i+1] = color[1];
          img.data[i+2] = color[2];
          img.data[i+3] = 255;
        }
      }

      ctx.putImageData(img, 0, 0);

      const outBlob  = await new Promise<Blob>((res, rej) =>
        canvas.toBlob(b => b ? res(b) : rej("canvas.toBlob failed"), "image/png")
      );
      const outBytes = new Uint8Array(await outBlob.arrayBuffer());
      const outName  = file.name.replace(/\.wld$/i, ".png");

      results.push({ name: outName, bytes: outBytes });
    }

    return results;
  },
};

export default WldHandler;
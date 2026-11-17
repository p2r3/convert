import { WaveFile } from "wavefile";

export type TypedWaveFile = Omit<WaveFile, "getSamples"> & {
  fmt: {
    sampleRate: number;
    numChannels: number;
    blockAlign: number;
  };
  data: {
    samples: Uint8Array;
  };
  getSamples<T>(interleaved: true, OutputObject: new (length: number) => T): T;
  getSamples<T>(interleaved: boolean, OutputObject: new (length: number) => T): T | T[];
};

/** A WaveFile typed as {@link TypedWaveFile}. */
export function typedWaveFile(bytes?: Uint8Array): TypedWaveFile {
  // wavefile's typings declare fmt and data as bare objects
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return new WaveFile(bytes) as TypedWaveFile;
}

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

import { Decoder, Encoder } from "libflo-audio";

class libFloHandler implements FormatHandler {

  public name: string = "libflo-audio";
  public supportedFormats: FileFormat[] = [
    {
      name: "Waveform Audio File Format",
      format: "wav",
      extension: "wav",
      mime: "audio/wav",
      from: true,
      to: true,
      internal: "wav"
    },
    {
      name: "flo™ Audio",
      format: "flo",
      extension: "flo",
      mime: "audio/flo",
      from: true,
      to: true,
      internal: "flo"
    },
  ];
export default libFloHandler;

import type { FileFormat, FileData, FormatHandler } from "../FormatHandler.js";
import CommonFormats from "src/CommonFormats.js";

// Toggle logging for debugging EXE to BAT conversion
const DEBUG_EXE_TO_BAT = false;

const EXE_MIME = "application/vnd.microsoft.portable-executable";

export default class ExeToBatHandler implements FormatHandler {
  name = "exe2bat";
  supportedFormats: FileFormat[] = [
    {
      name: "Windows Executable",
      format: "exe",
      extension: "exe",
      mime: EXE_MIME,
      from: true,
      to: false,
      internal: "exe",
      category: "application"
    },
    CommonFormats.BATCH.builder("bat").allowTo().markLossless()
  ];

  ready = false;

  async init() {
    if (DEBUG_EXE_TO_BAT) console.log("[exe2bat] Initializing handler...");
    this.ready = true;
    if (DEBUG_EXE_TO_BAT) {
      console.log("[exe2bat] Handler ready:", this.ready);
      console.log("[exe2bat] Supported formats:", this.supportedFormats);
    }
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
    args?: string[]
  ): Promise<FileData[]> {
    if (DEBUG_EXE_TO_BAT) {
      console.log("[exe2bat] Converting:", inputFormat.mime, "→", outputFormat.mime);
      console.log("[exe2bat] Input files:", inputFiles.length);
    }
    
    if (inputFormat.mime !== EXE_MIME || outputFormat.mime !== CommonFormats.BATCH.mime) {
      if (DEBUG_EXE_TO_BAT) console.log("[exe2bat] MIME type mismatch - expected:", EXE_MIME, "→", CommonFormats.BATCH.mime);
      throw new Error("This handler only supports EXE to BAT conversion");
    }

    const results: FileData[] = [];
    
    for (const file of inputFiles) {
      const result = await this.convertExeToBat(file);
      results.push(result);
    }

    return results;
  }

  private async convertExeToBat(file: FileData): Promise<FileData> {
    const exeName = file.name.replace(/\.[^.]*$/, "");
    const batName = `${exeName}.bat`;

    if (DEBUG_EXE_TO_BAT) {
      console.log('[exe2bat] Converting file:', file.name);
      console.log('[exe2bat] File size:', file.bytes.length, 'bytes');
    }

    // Read the EXE file
    const exeBuffer = Buffer.from(file.bytes);
    
    // Encode directly as Base64 (no compression)
    const base64 = exeBuffer.toString('base64');
    
    if (DEBUG_EXE_TO_BAT) {
      console.log('[exe2bat] Base64 length:', base64.length);
    }
    
    // Generate the batch wrapper using certutil
    const batContent = this.generateBatchWrapper(exeName, base64);
    
    if (DEBUG_EXE_TO_BAT) {
      console.log('[exe2bat] Batch content length:', batContent.length);
    }
    
    // Create buffer safely with error handling
    let batBytes: Uint8Array;
    try {
      batBytes = new TextEncoder().encode(batContent);
      if (DEBUG_EXE_TO_BAT) {
        console.log('[exe2bat] Successfully encoded batch content');
      }
    } catch (error) {
      console.error('[exe2bat] Error encoding batch content:', error);
      throw new Error('Failed to encode batch content');
    }
    
    return {
      name: batName,
      bytes: batBytes
    };
  }

  private generateBatchWrapper(exeName: string, payload: string): string {
    return `@echo off
setlocal

:: Auto-generated EXE-embedded batch
:: Reconstructs and runs ${exeName}

set "outExe=%TEMP%\\${exeName}.exe"
set "b64file=%TEMP%\\payload.b64"

echo Extracting payload to %b64file%...

:: Clean up existing files
if exist "%b64file%" del "%b64file%"
if exist "%outExe%" del "%outExe%"

:: Fast extraction using PowerShell
powershell -NoProfile -Command "$lines = Get-Content '%~f0'; $start = $lines.IndexOf('-----BEGIN PAYLOAD-----') + 1; $end = $lines.IndexOf('-----END PAYLOAD-----'); $payload = $lines[$start..($end-1)]; Set-Content -LiteralPath '%b64file%' -Value $payload -Encoding ASCII"

:: Debug: Check if payload was extracted
if exist "%b64file%" (
  echo Payload extracted successfully
  for %%i in ("%b64file%") do echo Payload size: %%~zi bytes
) else (
  echo ERROR: Payload extraction failed
  exit /b 1
)

echo Decoding using certutil...
certutil -decode "%b64file%" "%outExe%"

:: Debug: Check certutil result
if %errorlevel% equ 0 (
  echo Certutil decoding successful
) else (
  echo ERROR: Certutil failed with error code %errorlevel%
  echo Checking payload content...
  type "%b64file%" | find /C "TV" >nul
  if errorlevel 1 (
    echo ERROR: Payload does not appear to be valid base64
  ) else (
    echo Payload appears to be base64 but certutil failed
  )
)

if exist "%outExe%" (
  echo Running %outExe%...
  start "" "%outExe%"
) else (
  echo ERROR: reconstruction failed.
)

exit /b 0

-----BEGIN PAYLOAD-----
${payload}
-----END PAYLOAD-----`;
  }

  supportAnyInput = false;
}

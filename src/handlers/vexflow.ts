import * as vexml from '@stringsync/vexml';
import VexFlow from 'vexflow';
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from 'src/CommonFormats.ts';

class VexFlowHandler implements FormatHandler {

  public name: string = "VexFlow";
  public supportedFormats?: FileFormat[];
  public ready: boolean = false;
  private static fontsLoaded = false;

  async init() {
    this.supportedFormats = [
      CommonFormats.MUSICXML.builder("musicxml").allowFrom(),
      CommonFormats.MXL.builder("mxl").allowFrom(),
      CommonFormats.HTML.builder("html").allowTo()
    ];
    
    // Load VexFlow fonts (required for VexFlow 5)
    if (!VexFlowHandler.fontsLoaded) {
      try {
        await VexFlow.loadFonts('Bravura', 'Academico');
        VexFlowHandler.fontsLoaded = true;
        console.log('VexFlow fonts loaded successfully');
      } catch (e) {
        console.warn('Error loading VexFlow fonts:', e);
        // Try to continue anyway
      }
    }
    
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {
    if (inputFormat.internal !== "musicxml" && inputFormat.internal !== "mxl") {
      throw "Invalid input format. Expected MusicXML or MXL.";
    }
    if (outputFormat.internal !== "html") throw "Invalid output format. Expected HTML.";

    const outputFiles: FileData[] = [];

    for (const inputFile of inputFiles) {
      try {
        // Ensure fonts are loaded before rendering
        if (!VexFlowHandler.fontsLoaded) {
          await VexFlow.loadFonts('Bravura', 'Academico');
          VexFlowHandler.fontsLoaded = true;
        }
        VexFlow.setFonts('Bravura', 'Academico');
        
        // Configure vexml with proper width for multi-line rendering
        const config = {
          ...vexml.DEFAULT_CONFIG,
          WIDTH: 800, // Page width - controls line wrapping
          VIEWPORT_SCALE: 1.0,
          DRAWING_BACKEND: 'canvas' as const, // Use canvas to avoid font loading issues
        };
        
        // Create a temporary div element for vexml to render into
        const div = document.createElement("div");
        div.style.width = "800px";
        div.style.backgroundColor = "white";
        div.style.padding = "20px";
        
        // Render using vexml based on format with configuration
        let score;
        if (inputFormat.internal === "mxl" || inputFile.name.toLowerCase().endsWith('.mxl')) {
          // MXL format (compressed)
          const blob = new Blob([inputFile.bytes as BlobPart]);
          score = await vexml.renderMXL(blob, div, { config });
        } else {
          // Uncompressed MusicXML format
          const xmlString = new TextDecoder().decode(inputFile.bytes);
          score = vexml.renderMusicXML(xmlString, div, { config });
        }
        
        // Wait a bit for rendering to complete
        await new Promise(resolve => setTimeout(resolve, 100));

        // Extract the rendered content (canvas elements with music notation)
        const canvases = div.querySelectorAll('canvas');
        if (canvases.length === 0) {
          throw new Error("Failed to render MusicXML - no canvases generated");
        }
        
        // Convert canvases to base64 images for embedding in HTML
        const imageDataPromises = Array.from(canvases).map(canvas => {
          return new Promise<string>((resolve) => {
            canvas.toBlob((blob) => {
              if (blob) {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              } else {
                resolve(canvas.toDataURL('image/png'));
              }
            }, 'image/png');
          });
        });
        
        const imageDataUrls = await Promise.all(imageDataPromises);
        
        // Create HTML with embedded images
        const imagesHtml = imageDataUrls.map((dataUrl, idx) => 
          `<img src="${dataUrl}" alt="Music notation page ${idx + 1}" style="display: block; width: 100%; margin-bottom: 20px;" />`
        ).join('\n    ');
        
        // Create a complete HTML document with embedded images
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Music Score</title>
  <style>
    body {
      margin: 0;
      padding: 20px;
      background: white;
      font-family: Arial, sans-serif;
    }
    .vexml-container {
      max-width: 900px;
      margin: 0 auto;
      background: white;
      padding: 20px;
    }
    img {
      display: block;
      width: 100%;
      height: auto;
      margin-bottom: 20px;
    }
  </style>
</head>
<body>
  <div class="vexml-container">
    ${imagesHtml}
  </div>
</body>
</html>`;

        // Convert HTML to Uint8Array
        const bytes = new TextEncoder().encode(html);
        const name = inputFile.name.replace(/\.(musicxml|mxl|xml)$/i, ".html");

        outputFiles.push({ bytes, name });
      } catch (error) {
        console.error("Error converting MusicXML to HTML:", error);
        throw error;
      }
    }

    return outputFiles;
  }
}

export default VexFlowHandler;

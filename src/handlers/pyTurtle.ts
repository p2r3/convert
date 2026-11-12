import { DOMParser } from "linkedom/worker";
import { Color, EllipseCurve } from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import Formats from "src/Formats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { changeExt, decode, encode } from "src/common/index.ts";

// hardcoded limits to prevent big SVG crash
const MAX_ELEMENTS = 750;
const MAX_POINTS_PER_PATH = 150;
const MAX_TOTAL_POINTS = 20000;
// note those are good for the browser,and python limits, not your editor/lsp. this might generate a 25,000 line python code :)

function formatColor(col: string) {
  if (!col || col === "none" || col === "transparent") return null;
  const color = new Color(NaN, NaN, NaN).setStyle(col);
  if (![color.r, color.g, color.b].every(Number.isFinite)) return null;
  return "#" + color.getHexString();
}

// safe min/max, that better scale then Math
function safeMin(arr: number[]) {
  let m = Infinity;
  for (const v of arr) if (v < m) m = v;
  return m;
}
function safeMax(arr: number[]) {
  let m = -Infinity;
  for (const v of arr) if (v > m) m = v;
  return m;
}

class pyTurtleHandler implements FormatHandler {
  public readonly name = "pyTurtle";
  public supportedFormats = [Formats.PYTHON.builder("py").to(), Formats.SVG.builder("svg").from()];
  public ready = false;

  async init() {
    this.ready = true;
  }
  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];

    for (const inputFile of inputFiles) {
      const { name, bytes } = inputFile;
      const svg_text = decode(bytes);
      const python_code = pyTurtleHandler.convert_program(svg_text);

      const outputBytes = encode(python_code);
      const newName = changeExt(name, "py");
      outputFiles.push({ name: newName, bytes: outputBytes });
    }

    return outputFiles;
  }
  static convert_program(svg: string) {
    // SVGLoader only needs a DOM parser; geometry is calculated without browser APIs.
    const originalParser = globalThis.DOMParser;
    globalThis.DOMParser = DOMParser as unknown as typeof globalThis.DOMParser;
    let paths;
    try {
      paths = new SVGLoader().parse(svg).paths;
    } finally {
      if (originalParser) globalThis.DOMParser = originalParser;
      else Reflect.deleteProperty(globalThis, "DOMParser");
    }

    const allPoints = [];
    const shapeData = [];
    for (const path of paths.slice(0, MAX_ELEMENTS)) {
      const style = path.userData!.style as { fill: string; stroke: string; strokeWidth: number };
      const fill = formatColor(style.fill);
      const stroke = formatColor(style.stroke);
      const sw = style.strokeWidth;

      for (const subPath of path.subPaths) {
        if (allPoints.length >= MAX_TOTAL_POINTS) break;
        if (!subPath.curves.length) continue;

        const curve = subPath.curves[0];
        if (
          subPath.curves.length === 1 &&
          curve instanceof EllipseCurve &&
          curve.xRadius === curve.yRadius &&
          Math.abs(curve.aEndAngle - curve.aStartAngle) >= Math.PI * 2
        ) {
          const x = curve.aX;
          const y = -curve.aY - curve.yRadius;
          shapeData.push({ type: "circle", x, y, r: curve.xRadius, fill, stroke, sw });
          allPoints.push({ x, y });
        } else {
          const divisions = Math.min(
            MAX_POINTS_PER_PATH,
            Math.max(1, Math.ceil(subPath.getLength() / 0.5)),
            MAX_TOTAL_POINTS - allPoints.length - 1,
          );
          if (divisions < 1) break;
          const pts = subPath.getSpacedPoints(divisions).map((p) => ({ x: p.x, y: -p.y }));
          allPoints.push(...pts);
          shapeData.push({ type: "path", points: pts, fill, stroke, sw });
        }
      }
    }

    const xs = allPoints.map((p) => p.x);
    const ys = allPoints.map((p) => p.y);
    const minX = safeMin(xs);
    const maxX = safeMax(xs);
    const minY = safeMin(ys);
    const maxY = safeMax(ys);
    const padding = Math.max(maxX - minX, maxY - minY) * 0.1;

    // build python program. this is inefficient (just like svg), and ignore options like loops
    let py = "import turtle\n\n";
    py += "s = turtle.Screen()\nt = turtle.Turtle()\nt.speed(0)\nturtle.tracer(0, 0)\n";
    if (isFinite(padding) && isFinite(minX) && isFinite(minY) && isFinite(maxY))
      py += `s.setworldcoordinates(${minX - padding}, ${minY - padding}, ${maxX + padding}, ${maxY + padding})\n\n`;

    for (const shape of shapeData) {
      if (!shape) continue;

      py += `t.penup()\nt.pensize(${shape.sw})\nt.pencolor("${shape.stroke || "black"}")\n`;
      if (shape.fill) py += `t.fillcolor("${shape.fill}")\n`;

      if (shape.type === "circle" && shape.x !== undefined) {
        py += `t.goto(${shape.x.toFixed(2)}, ${shape.y.toFixed(2)})\nt.setheading(0)\n`;
        if (shape.fill) py += "t.begin_fill()\n";
        py += `t.circle(${shape.r.toFixed(2)})\n`;
        if (shape.fill) py += "t.end_fill()\n";
      } else {
        if (shape.points == null) continue; //no such case, just for TS

        if (shape.fill) py += "t.begin_fill()\n";

        py += `t.goto(${shape.points[0].x.toFixed(2)}, ${shape.points[0].y.toFixed(2)})\nt.pendown()\n`;
        for (let i = 1; i < shape.points.length; i++) {
          py += `t.goto(${shape.points[i].x.toFixed(2)}, ${shape.points[i].y.toFixed(2)})\n`;
        }
        // close after each shape, to prevent fill colliding
        py += `t.goto(${shape.points[0].x.toFixed(2)}, ${shape.points[0].y.toFixed(2)})\n`;
        if (shape.fill) py += "t.end_fill()\n";
      }
      py += "t.penup()\n\n";
    }

    py += "t.hideturtle()\nturtle.update()\nturtle.done()";
    return py;
  }
}

export default pyTurtleHandler;

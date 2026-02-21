import CommonFormats from "src/CommonFormats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

// hardcoded limits to prevent big SVG crash
const MAX_ELEMENTS = 750;
const MAX_POINTS_PER_PATH = 150;
const MAX_TOTAL_POINTS = 20000;
// note those are good for the browser,and python limits, not your editor/lsp. this might generate a 25,000 line python code :)

function createContainer(svg:string){
    // stolen from svg Foreign object convert. we need the browser to render the svg:
    const dummy = document.createElement("div");
    dummy.style.all = "initial";
    dummy.style.visibility = "hidden";
    dummy.style.position = "fixed";
    document.body.appendChild(dummy);

    // Add a DOM shadow to the dummy to "sterilize" it.
    const shadow = dummy.attachShadow({ mode: "closed" });

    // Create a div within the shadow DOM to act as
    // a container for our HTML payload.
    const container = document.createElement("div");
    container.innerHTML = svg;
    shadow.appendChild(container);
    return container
}


class pyTurtleHandler implements FormatHandler {
  public name: string = "pyturtle";
  public supportedFormats?: FileFormat[];
  public ready: boolean = false;

  async init () {
    this.supportedFormats = [
      CommonFormats.PYTHON.supported("py", false, true, false),
      CommonFormats.SVG.builder("svg").allowFrom()
    ];
    this.ready = true;
  }
  createContainer(svg:string){
    // stolen from svg Foreign object convert. we need the browser to render the svg:

    const dummy = document.createElement("div");
    dummy.style.all = "initial";
    dummy.style.visibility = "hidden";
    dummy.style.position = "fixed";
    document.body.appendChild(dummy);

    // Add a DOM shadow to the dummy to "sterilize" it.
    const shadow = dummy.attachShadow({ mode: "closed" });

    // Create a div within the shadow DOM to act as
    // a container for our HTML payload.
    const container = document.createElement("div");
    container.innerHTML = svg;
    shadow.appendChild(container);
    return container
}

  async doConvert (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {

    if (inputFormat.internal !== "svg") throw "Invalid input format.";
    if (outputFormat.internal !== "pyTurtle") throw "Invalid output format.";

    const outputFiles: FileData[] = [];

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    for (const inputFile of inputFiles) {
      const { name, bytes } = inputFile;
      const svg_text = decoder.decode(bytes);
          const displayArea = createContainer(svg_text)
    const svgEl = displayArea.querySelector('svg')!;
    const python_code = pyTurtleHandler.convert_program(svgEl)


      const outputBytes = encoder.encode(python_code);
      const newName = name.split(".")[0] + ".py";
      outputFiles.push({ name: newName, bytes: outputBytes });
    }

    return outputFiles;

  }
  static convert_program(svgEl:SVGSVGElement){

    let elements:SVGGeometryElement[] = Array.from(svgEl.querySelectorAll('path, circle, rect, ellipse, line, polyline, polygon'));
    if (elements.length > MAX_ELEMENTS) {
        elements = elements.slice(0, MAX_ELEMENTS);
    }
    const pt = svgEl.createSVGPoint(); // this API is deprecated

    const formatColor = (col:string) => {
        if (!col || col === 'none' || col === 'transparent') return null;
        if (col.startsWith('rgb')) {
            const rgb = col.match(/\d+/g);
            return "#" + (rgb!).slice(0, 3).map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
        }
        return col;
    };

    let allPoints = [];
    let shapeData = [];
    // safe min/max, that better scale then Math
    const safeMin = (arr:number[]) => { let m = Infinity;  for (const v of arr) if (v < m) m = v; return m; };
    const safeMax = (arr:number[]) => { let m = -Infinity; for (const v of arr) if (v > m) m = v; return m; };

    for (const el of elements) {

        if (allPoints.length >= MAX_TOTAL_POINTS) {
            break;
        }

        const style = window.getComputedStyle(el);
        const fill = formatColor(el.getAttribute('fill') || style.fill);
        const stroke = formatColor(el.getAttribute('stroke') || style.stroke);
        const sw = parseFloat(el.getAttribute('stroke-width') || style.strokeWidth || '1');
        const ctm = el.getScreenCTM();
        if (!ctm) continue;

        const tagName = el.tagName.toLowerCase();

        if (tagName === 'circle' || tagName === 'ellipse') {
            // native circle support
            const b = el.getBBox();
            const rx = b.width / 2;
            const ry = b.height / 2;
            const cx = b.x + rx;
            const cy = b.y + ry;

            // Move to the bottom of the circle for Turtle's .circle()
            pt.x = cx; pt.y = cy + ry;
            const startTrans = pt.matrixTransform(ctm);

            shapeData.push({
                type: 'circle',
                x: startTrans.x,
                y: -startTrans.y,
                r: rx,
                fill, stroke, sw
            });

            allPoints.push({x: startTrans.x, y: -startTrans.y});
        } else {
            // all other, convert to goto calls
            let subPaths = [];
            if (tagName === 'path') {
                const d = el.getAttribute('d');
                if (d ===null) continue
                subPaths = d.split(/(?=[Mm])/).filter(s => s.trim());
            } else {
                subPaths = [el];
            }

            for (const seg of subPaths) {
                if (allPoints.length >= MAX_TOTAL_POINTS) break;

                let pts = [];
                const tempP = (tagName === 'path') ? document.createElementNS("http://www.w3.org/2000/svg", "path") : el;
                if (tagName === 'path') tempP.setAttribute("d", seg.toString());

                if (tagName === 'path' || tagName === 'polyline' || tagName === 'polygon') {
                    document.body.appendChild(tempP);
                    const len = tempP.getTotalLength();
                    const step = Math.max(len / MAX_POINTS_PER_PATH, 0.5);
                    for (let i = 0; i <= len; i += step) {
                        const pos = tempP.getPointAtLength(i);
                        pt.x = pos.x; pt.y = pos.y;
                        const trans = pt.matrixTransform(ctm);
                        pts.push({ x: trans.x, y: -trans.y });
                    }
                    if (tagName === 'path') document.body.removeChild(tempP);
                } else {
                    const b = el.getBBox();
                    const corners = [{x:b.x, y:b.y}, {x:b.x+b.width, y:b.y}, {x:b.x+b.width, y:b.y+b.height}, {x:b.x, y:b.y+b.height}];
                    corners.forEach(c => {
                        pt.x = c.x; pt.y = c.y;
                        const trans = pt.matrixTransform(ctm);
                        pts.push({ x: trans.x, y: -trans.y });
                    });
                }

                if (pts.length > 0) {
                    allPoints.push(...pts);
                    shapeData.push({ type: 'path', points: pts, fill, stroke, sw });
                }
            }
        }
    }

    const xs = allPoints.map(p => p.x);
    const ys = allPoints.map(p => p.y);
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
        if (!(shape)) continue

        py += `t.penup()\nt.pensize(${shape.sw})\nt.pencolor("${shape.stroke || 'black'}")\n`;
        if (shape.fill) py += `t.fillcolor("${shape.fill}")\n`;

        if (shape.type === 'circle'&& shape.x) {
            py += `t.goto(${shape.x.toFixed(2)}, ${shape.y.toFixed(2)})\nt.setheading(0)\n`;
            if (shape.fill) py += "t.begin_fill()\n";
            py += `t.circle(${shape.r.toFixed(2)})\n`;
            if (shape.fill) py += "t.end_fill()\n";
        } else {
          if (shape.points==null) continue //no such case, just for TS

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
    return py
}


}

export default pyTurtleHandler;

import { expect, test } from "bun:test";

import bbmodelHandler, { bbmodelToObj } from "../../src/handlers/bbmodel.ts";

test("bbmodel cube exports to obj geometry", async () => {
  const handler = new bbmodelHandler();
  await handler.init();

  const inputFormat = handler.supportedFormats.find(format => format.internal === "bbmodel");
  const outputFormat = handler.supportedFormats.find(format => format.internal === "obj");

  const input = {
    meta: {
      format_version: "5.0",
      model_format: "free",
    },
    elements: [
      {
        uuid: "cube",
        name: "Cube",
        from: [0, 0, 0],
        to: [2, 2, 2],
      }
    ],
    outliner: ["cube"]
  };

  const [output] = await handler.doConvert(
    [{
      name: "cube.bbmodel",
      bytes: new TextEncoder().encode(JSON.stringify(input))
    }],
    inputFormat!,
    outputFormat!
  );

  const text = new TextDecoder().decode(output.bytes);
  expect(output.name).toBe("cube.obj");
  expect(text.match(/^v /gm)?.length).toBe(24);
  expect(text.match(/^f /gm)?.length).toBe(12);
});

test("bbmodel mesh exports to obj geometry", async () => {
  const handler = new bbmodelHandler();
  await handler.init();

  const inputFormat = handler.supportedFormats.find(format => format.internal === "bbmodel");
  const outputFormat = handler.supportedFormats.find(format => format.internal === "obj");

  const input = {
    meta: {
      format_version: "5.0",
      model_format: "free",
    },
    elements: [
      {
        uuid: "mesh",
        name: "Triangle",
        vertices: {
          a: [0, 0, 0],
          b: [1, 0, 0],
          c: [0, 1, 0],
        },
        faces: {
          triangle: {
            vertices: ["a", "b", "c"]
          }
        }
      }
    ],
    outliner: ["mesh"]
  };

  const [output] = await handler.doConvert(
    [{
      name: "mesh.bbmodel",
      bytes: new TextEncoder().encode(JSON.stringify(input))
    }],
    inputFormat!,
    outputFormat!
  );

  const text = new TextDecoder().decode(output.bytes);
  expect(output.name).toBe("mesh.obj");
  expect(text.match(/^v /gm)?.length).toBe(3);
  expect(text.match(/^f /gm)?.length).toBe(1);
});

test("bbmodel mesh rotates local vertices before translating by its origin", () => {
  const obj = bbmodelToObj({elements: [{
    origin: [10, 20, 30], rotation: [0, 0, 90],
    vertices: {a: [0, 0, 0], b: [1, 0, 0], c: [0, 1, 0]},
    faces: {triangle: {vertices: ["a", "b", "c"]}}
  }]});
  expect(obj.split("\n").filter(line => line.startsWith("v "))).toEqual([
    "v 10 20 30", "v 10 21 30", "v 9 20 30"
  ]);
});

test("bbmodel cube uses ZYX rotation around its pivot", () => {
  const obj = bbmodelToObj({elements: [{
    from: [1, 2, 3], to: [3, 4, 5], origin: [1, 2, 3], rotation: [90, 90, 0]
  }]});
  expect(obj.split("\n").find(line => line.startsWith("v "))).toBe("v 3 0 1");
});

test("bbmodel cube omits faces with a null texture", () => {
  const obj = bbmodelToObj({elements: [{
    from: [0, 0, 0], to: [2, 2, 2], faces: {north: {texture: null}}
  }]});
  expect(obj.match(/^f /gm)?.length).toBe(10);
});

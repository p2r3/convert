# The convert build system

The build system is based on **recipes**. Each recipe declares its `requirements.config.ts`, in which it lists all the **requirements** used to **assemble** it.

## Simple usage

```bash
bun run build:add <requirement_name> <source_url>
```

The source url should be a plain file, .tar.gz (.tgz, .xz, .zst, .bz2), or .zip. It's either unpacked or put directly into the `built/<requirement_name>` folder.

Examples:

```bash
# A commit-pinned github tarball:
bun run build:add word-parser https://github.com/p2r3/envelope/archive/2d8bc87d948ccfc391e86724bb0a5d7b1689d5c6.tar.gz
# Or some other source:
bun run build:add bash https://ftp.gnu.org/gnu/bash/bash-5.3.tar.gz
```

To assemble the `built` folder, run `bun run build:assemble --all`. However, this is usually done for you when you run `bun run build` or `bun run dev`.

## Advanced usage

Each requirement is declared in a `requirements.config.ts`. Requirements can have a source, assemble, and prebuild part. All paths to files are relative to the **subrecipe folder**, which is `recipe/<name>`.

### Source

A **source** contains a url, hash, optional patches, and optional copies.

```ts
{
  name: "my-cool-parser",
  url: "https://github.com/me/my-cool-parser/archive/2eb03bd5dc18e3b7b1318190bef8e14274123778.tar.gz",
  hash: ["sha256", "3bb10d2d3cf90496ddca29b523da85a901040d707ac03751de40edd35c8d61ce"],
  patches: ["add-coolness.patch"], // optional, relative to `recipe/<name>`
  copy: {
    "cool-types.d.ts": "cool-types.d.ts",
  }, // optional, relative to `recipe/<name>` and the `built/<name>` folder respectively.
},
```

The result after fetching and applying patches to this example is extracted into `built/my-cool-parser`.

### Assemble script

An **assemble** script is a JS/TS script that runs on the sources and generates the output for the final assembled requirement.

```ts
{
  name: "cat-census",
  url: "https://github.com/SMBC-NZP/dc_cats/archive/074ed257058af1643414849c8c89c7cd0499b3b0.tar.gz",
  hash: ["sha256", "d067963410bbb4da12d234c0df0b31290fccef35266e24d8bbe2d538ac072eba"],
  assemble: "assemble.ts", // again, relative to `recipe/<name>`
},
```

The source part is optional. The script looks something like this:

```ts
// recipe/cat-census/assemble.ts
import { join } from "path";

const OUT_DIR = process.env.OUT_DIR!;
let csv = await Bun.file("data/transect_detections.csv").text();
csv = csv.replaceAll("dog", "cat"); // dogs are cats
await Bun.write(join(OUT_DIR, "cats.csv"), csv);
```

The script should produce the output in the `process.env.OUT_DIR` folder. You can access the subrecipe folder using `import.meta.dir`. The working directory is the extracted source from the requirement.

### Prebuild script

A **prebuild** script is a shell script that runs on the sources and generates the output (usually a binary) in a docker container deterministically, after which the output is checked into the git repo under `prebuilt/*.tar.gz`.

```ts
{
  name: "linux-kernel",
  url: "https://git.kernel.org/torvalds/t/linux-7.3-rc5.tar.gz",
  hash: ["sha256", "9273b88b67973cc69e54d748ab1b749399d6d07695f1c37d0c59f88b4106074f"],
  prebuild: "build.sh", // still relative to `recipe/<name>` that one didnt change
  image: "emscripten/emsdk:6.0.10@sha256:e077d54e2b8970575ebc4f185ac1de0b95c05f2b266134d4ba27449af7aebf65",
  // should be pinned to a sha256
},
```

The source is again, optional. The script looks something like this:

```sh
# build.sh
emmake make -j"$(nproc)" # this takes a lotta time!
cp arch/wasm/boot/bzImage $OUT_DIR
```

The script should produce the output in the `$OUT_DIR` folder. You can access the subrecipe folder in `/recipe`. Once again, the working directory is the extracted source from the requirement.

Prebuilt artifacts require building manually:

```bash
bun run build:prebuild <name or --all>
```

The resulting `prebuilt/name-<hash>.tar.gz` file needs to be comitted into git.

## Subrecipes

If your prebuild or assemble script requires multiple source urls, you can add a new `requirements.config.ts` under `recipe/<name>/requirements.config.ts`.

```ts
// recipe/requirements.config.ts
{
  name: "chromium",
  url: "...",
  hash: ["sha256", "..."],
  prebuild: "build.sh",
  image: "..."
},
```

```ts
// recipe/chromium/requirements.config.ts

import type { RequirementsConfig } from "scripts/build/types";

export default [
  {
    name: "bash",
    url: "https://ftp.gnu.org/gnu/bash/bash-5.3.tar.gz",
    hash: ["sha256", "0d5cd86965f869a26cf64f4b71be7b96f90a3ba8b3d74e27e8e9d9d5550f31ba"],
  },
  // lots of others
] satisfies RequirementsConfig;
```

Then your assemble or prebuild script can use it inside of `$REQUIREMENTS_DIR`, which is read only:

```sh
# build.sh
cp -r "$REQUIREMENTS_DIR/bash" ./bash
cd bash
# lets compile bash
emmake make -j"$(nproc)"
cd ..
# lets compile chromium
emmake make -j"$(nproc)"
cp build/chromium $OUT_DIR
```

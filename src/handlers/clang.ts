import type { FileData, FileFormat, FormatDefinition, FormatHandler } from "../FormatHandler.ts";
import Formats from "src/Formats.ts";
import { parseTar } from "nanotar";
import createLLVM, { type MainModule as LLVMModule } from "built/clang/llvm.js";
import wasmUrl from "built/clang/llvm.wasm.gz?url";
import resourcesUrl from "built/clang/resources.tar.gz?url";
import { changeExt } from "src/common/index.ts";
import { fetchGzip } from "src/common/gzip.ts";

const sysrootUrls = import.meta.glob<string>("/built/clang/sysroots/*.tar.gz", {
  query: "?url",
  import: "default",
  eager: true,
});

// where the tools pretend to live, clang finds its headers relative to this
const BIN_DIR = "/usr/bin";
const RESOURCE_DIR = "/usr/lib/clang/resources";
const SYSROOT_DIR = "/sysroot";

type Target = {
  triple: string;
  exe: FormatDefinition;
  asm: FormatDefinition;
};

const TARGETS: Record<string, Target> = {
  wasm: { triple: "wasm32-unknown-wasip1", exe: Formats.WASM, asm: Formats.ASM_WASM },
  "x86-64-linux": {
    triple: "x86_64-unknown-linux-musl",
    exe: Formats.ELF,
    asm: Formats.ASM_X86_64_LINUX,
  },
  "x86-linux": {
    triple: "i686-unknown-linux-musl",
    exe: Formats.ELF_X86,
    asm: Formats.ASM_X86_LINUX,
  },
  "arm64-linux": {
    triple: "aarch64-unknown-linux-musl",
    exe: Formats.ELF_ARM64,
    asm: Formats.ASM_ARM64_LINUX,
  },
  "arm-linux": {
    triple: "armv7-unknown-linux-musleabihf",
    exe: Formats.ELF_ARM,
    asm: Formats.ASM_ARM_LINUX,
  },
  "riscv64-linux": {
    triple: "riscv64-unknown-linux-musl",
    exe: Formats.ELF_RISCV64,
    asm: Formats.ASM_RISCV64_LINUX,
  },
  "x86-64-windows": {
    triple: "x86_64-w64-windows-gnu",
    exe: Formats.EXE,
    asm: Formats.ASM_X86_64_WINDOWS,
  },
  "x86-windows": {
    triple: "i686-w64-windows-gnu",
    exe: Formats.EXE_X86,
    asm: Formats.ASM_X86_WINDOWS,
  },
  "arm64-windows": {
    triple: "aarch64-w64-windows-gnu",
    exe: Formats.EXE_ARM64,
    asm: Formats.ASM_ARM64_WINDOWS,
  },
  "arm-windows": {
    triple: "armv7-w64-windows-gnu",
    exe: Formats.EXE_ARM,
    asm: Formats.ASM_ARM_WINDOWS,
  },
};

type Files = Map<string, Uint8Array>;

async function fetchTar(url: string): Promise<Files> {
  const files: Files = new Map();
  for (const item of parseTar(await (await fetchGzip(url)).arrayBuffer())) {
    if (item.type !== "file") continue;
    files.set(item.name.replace(/^\.?\//, ""), item.data ?? new Uint8Array());
  }
  return files;
}

// roots maps the first path component to where it goes instead
function writeFiles(
  llvm: LLVMModule,
  root: string,
  files: Files,
  roots: Record<string, string> = {},
) {
  for (const [path, data] of files) {
    const slash = path.indexOf("/");
    const mapped = slash !== -1 ? roots[path.slice(0, slash)] : undefined;
    const full = mapped !== undefined ? mapped + path.slice(slash) : `${root}/${path}`;
    llvm.FS.mkdirTree(full.slice(0, full.lastIndexOf("/")), 0o777);
    llvm.FS.writeFile(full, data);
  }
}

// the arguments of each command printed by `clang -###`
function parseJobs(output: string): string[][] {
  return output
    .split("\n")
    .filter((line) => line.startsWith(' "'))
    .map((line) =>
      [...line.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(([, arg]) => arg.replace(/\\(.)/g, "$1")),
    );
}

class clangHandler implements FormatHandler {
  public readonly name = "clang";
  public supportedFormats = [
    Formats.C.builder("c").from(),
    Formats.CPP.builder("cpp").from(),
    ...Object.entries(TARGETS).flatMap(([key, target]) => [
      target.asm.builder(`${key}:asm`).fromTo(),
      target.exe.builder(`${key}:exe`).to(),
    ]),
  ];
  public ready = false;

  #module?: Promise<WebAssembly.Module>;
  #resources?: Promise<Files>;
  #sysroots = new Map<string, Promise<Files>>();

  async init() {
    this.ready = true;
  }

  #cached<T>(promise: Promise<T>, clear: () => void) {
    promise.catch(clear);
    return promise;
  }

  #sysroot(triple: string) {
    let sysroot = this.#sysroots.get(triple);
    if (!sysroot) {
      const url = sysrootUrls[`/built/clang/sysroots/${triple}.tar.gz`];
      if (!url) throw new Error(`No sysroot for ${triple}.`);
      sysroot = this.#cached(fetchTar(url), () => this.#sysroots.delete(triple));
      this.#sysroots.set(triple, sysroot);
    }
    return sysroot;
  }

  async #run(args: string[], files: Files, sysroot?: Files) {
    this.#module ??= this.#cached(
      WebAssembly.compileStreaming(fetchGzip(wasmUrl, "application/wasm")),
      () => (this.#module = undefined),
    );
    this.#resources ??= this.#cached(fetchTar(resourcesUrl), () => {
      this.#resources = undefined;
    });
    const [mod, resources] = await Promise.all([this.#module, this.#resources]);

    let output = "";
    const llvm = await createLLVM({
      thisProgram: `${BIN_DIR}/llvm`,
      instantiateWasm(
        imports: WebAssembly.Imports,
        ok: (instance: WebAssembly.Instance, mod: WebAssembly.Module) => void,
      ) {
        WebAssembly.instantiate(mod, imports).then((instance) => ok(instance, mod));
        return {};
      },
      print: (line: string) => (output += line + "\n"),
      printErr: (line: string) => (output += line + "\n"),
    });

    // clang only picks a linker it could execute, these are never actually run
    llvm.FS.mkdirTree(BIN_DIR, 0o777);
    for (const tool of ["llvm", "clang", "clang++", "ld.lld", "wasm-ld", "lld-link"]) {
      llvm.FS.writeFile(`${BIN_DIR}/${tool}`, "");
      llvm.FS.chmod(`${BIN_DIR}/${tool}`, 0o755, false);
    }
    writeFiles(llvm, RESOURCE_DIR, resources);
    // sysroot/ is the target's libc and libc++, resource/ its compiler-rt
    if (sysroot) writeFiles(llvm, "", sysroot, { sysroot: SYSROOT_DIR, resource: RESOURCE_DIR });
    llvm.FS.mkdirTree("/work", 0o777);
    llvm.FS.chdir("/work");
    writeFiles(llvm, "/work", files);

    let status: number;
    try {
      status = llvm.callMain(args);
    } catch (error) {
      // exit() and aborts end up here
      status = (error as { status?: number }).status ?? 1;
      if (status === 0) status = 1;
      output += String(error);
    }

    const read = (path: string) => llvm.FS.readFile(`/work/${path}`) as Uint8Array;
    return { status, output, read };
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    const [key, kind] = outputFormat.internal.split(":");
    const target = TARGETS[key];
    const [inputKey, inputKind] = inputFormat.internal.split(":");
    if (inputKind === "asm" && inputKey !== key) {
      throw new Error(`Can't build ${inputFormat.name} for ${key}.`);
    }
    const isCpp = inputFormat.internal === "cpp";
    const clang = `${BIN_DIR}/${isCpp ? "clang++" : "clang"}`;
    // the file name might not have the extension clang expects
    const language = inputKind === "asm" ? "assembler" : isCpp ? "c++" : "c";
    const outputDefinition = kind === "asm" ? target.asm : target.exe;

    const sysroot = await this.#sysroot(target.triple);
    const args = [
      // there's no /proc/self/exe, this makes clang find itself (and the linker) through argv[0]
      "-no-canonical-prefixes",
      `--target=${target.triple}`,
      `-resource-dir=${RESOURCE_DIR}`,
      `--sysroot=${SYSROOT_DIR}`,
      "-O2",
    ];
    if (target.triple.startsWith("wasm")) {
      if (isCpp) args.push("-fwasm-exceptions");
    } else {
      args.push("-rtlib=compiler-rt", "-unwindlib=libunwind", "-fuse-ld=lld");
      if (isCpp) args.push("-stdlib=libc++");
    }
    if (kind === "exe") args.push("-static");

    const outputFiles: FileData[] = [];
    for (const inputFile of inputFiles) {
      const files: Files = new Map([[inputFile.name, inputFile.bytes]]);
      const outputName = `out.${outputDefinition.extension}`;

      if (kind === "asm") {
        const { status, output, read } = await this.#run(
          [clang, "-x", language, inputFile.name, "-S", "-o", outputName, ...args],
          files,
          sysroot,
        );
        if (status !== 0) throw new Error(`clang failed:\n${output}`);
        outputFiles.push({
          name: changeExt(inputFile.name, outputDefinition.extension),
          bytes: read(outputName),
        });
        continue;
      }

      // compiling runs in-process, but the driver can't start the linker, so that's its own run
      const compile = await this.#run(
        [clang, "-x", language, inputFile.name, "-c", "-o", "out.o", ...args],
        files,
        sysroot,
      );
      if (compile.status !== 0) throw new Error(`clang failed:\n${compile.output}`);

      const objects: Files = new Map([["out.o", compile.read("out.o")]]);
      const plan = await this.#run(
        [clang, "-###", "out.o", "-o", outputName, ...args],
        objects,
        sysroot,
      );
      if (plan.status !== 0) throw new Error(`clang failed:\n${plan.output}`);
      const jobs = parseJobs(plan.output);
      if (jobs.length !== 1) throw new Error(`Expected a single link job:\n${plan.output}`);
      const [linker, ...linkArgs] = jobs[0];

      const link = await this.#run([linker, ...linkArgs], objects, sysroot);
      if (link.status !== 0) throw new Error(`Linking failed:\n${link.output}`);
      outputFiles.push({
        name: changeExt(inputFile.name, outputDefinition.extension),
        bytes: link.read(outputName),
      });
    }
    return outputFiles;
  }
}

export default clangHandler;

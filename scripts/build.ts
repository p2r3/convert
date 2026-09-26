import { join, relative } from "path";
import { defineCommand, runMain, type ArgsDef, type ParsedArgs } from "citty";
import { mkdir, readdir, rm, rename, stat } from "fs/promises";
import { $ } from "bun";

export type SourceRequirement = {
  name: string;
  url: `https://${string}.tar.gz`; // only tar gz for now
  hash: [Bun.SupportedCryptoAlgorithms, string];
  patches?: string[];
};

export type SubrecipeRequirement = {
  name: string;
  assemble: string;
};

export type Requirement = SourceRequirement | SubrecipeRequirement;

export type RequirementsConfig = Requirement[];

const OUT_DIR = join(import.meta.dir, "../built");
const CACHE_DIR = join(import.meta.dir, "../.cache/convert-build");
const TARBALLS_DIR = join(CACHE_DIR, "tarballs");
const RECIPE_DIR = join(import.meta.dir, "../recipe");

await mkdir(OUT_DIR, { recursive: true });
await mkdir(TARBALLS_DIR, { recursive: true });

type Scope = {
  recipeDir: string;
  outDir: string;
  stateDir: string;
};

const ROOT_SCOPE: Scope = { recipeDir: RECIPE_DIR, outDir: OUT_DIR, stateDir: CACHE_DIR };

function subrecipeScope(scope: Scope, name: string): Scope {
  const stateDir = join(scope.stateDir, "subrecipes", name);
  return {
    recipeDir: join(scope.recipeDir, name),
    outDir: join(stateDir, "requirements"),
    stateDir,
  };
}

function isSubrecipe(requirement: Requirement): requirement is SubrecipeRequirement {
  return "assemble" in requirement;
}

async function loadRequirements(recipeDir: string): Promise<RequirementsConfig> {
  const configPath = join(recipeDir, "requirements.config.ts");
  if (!(await Bun.file(configPath).exists())) return [];
  return (await import(configPath)).default;
}

async function fetchFile(path: string, url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch: ${res.status} ${res.statusText}`);
  const file = await res.bytes();
  await Bun.write(path, file);
  return file;
}

async function extractTarball(outPath: string, tarball: Uint8Array) {
  const tmp = join(CACHE_DIR, `tmp-${crypto.randomUUID()}`);
  await mkdir(tmp, { recursive: true });
  await rm(outPath, { recursive: true, force: true });

  const archive = new Bun.Archive(tarball);
  await archive.extract(tmp);

  const [inner] = await readdir(tmp);
  await rename(join(tmp, inner), outPath);
  await rm(tmp, { recursive: true });
}

function hashFile(alg: Bun.SupportedCryptoAlgorithms, bytes: Uint8Array) {
  return new Bun.CryptoHasher(alg).update(bytes).digest("hex");
}

async function listFiles(dir: string) {
  try {
    const entries = await readdir(dir, { recursive: true, withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
      .toSorted();
  } catch {
    return [];
  }
}

async function assembleSource(requirement: SourceRequirement, scope: Scope, args: AssembleArgs) {
  const tarballPath = join(TARBALLS_DIR, `${requirement.hash[1]}.tar.gz`);

  let tarball;
  if (!args.refetch) {
    try {
      tarball = await Bun.file(tarballPath).bytes();
      const hash = hashFile(requirement.hash[0], tarball);
      if (hash !== requirement.hash[1]) {
        console.warn(`Bad hash for cached ${requirement.name} tarball, refetching.`);
        tarball = undefined;
      }
    } catch {
      tarball = undefined;
    }
  }

  if (tarball && args.verbose) console.log(`Using cached tarball for ${requirement.name}.`);
  if (!tarball) {
    console.log(`Fetching file ${requirement.url}...`);
    tarball = await fetchFile(tarballPath, requirement.url);
    console.log(`Got sources for ${requirement.name}.`);
  }

  const hash = hashFile(requirement.hash[0], tarball);
  if (hash !== requirement.hash[1]) {
    throw new Error(
      `Requirement claimed a ${requirement.hash[0]} hash of ${requirement.hash[1]}, but the source hashes to ${hash}!`,
    );
  }

  const outPath = join(scope.outDir, requirement.name);
  await extractTarball(outPath, tarball);

  const recipePath = join(scope.recipeDir, requirement.name);
  for (const patch of requirement.patches || []) {
    await $`patch -p1 -i ${join(recipePath, patch)}`.cwd(outPath);
  }
}

/** Expects the subrecipe's own requirements to already be assembled. */
async function assembleSubrecipe(requirement: SubrecipeRequirement, scope: Scope) {
  const sub = subrecipeScope(scope, requirement.name);
  const outPath = join(scope.outDir, requirement.name);
  await rm(outPath, { recursive: true, force: true });
  await mkdir(outPath, { recursive: true });

  await $`bun run ${join(sub.recipeDir, requirement.assemble)}`
    .cwd(sub.outDir)
    .env({ ...process.env, OUT_DIR: outPath });
}

function hashPath(requirement: Requirement, scope: Scope) {
  return join(scope.stateDir, "out-hashes", requirement.name);
}

async function hashRequirement(requirement: Requirement, scope: Scope) {
  const hash = new Bun.CryptoHasher("sha256");

  hash.update(JSON.stringify(requirement));
  hash.update("\0");

  const recipePath = join(scope.recipeDir, requirement.name);
  for (const path of await listFiles(recipePath)) {
    hash.update(path);
    hash.update("\0");
    hash.update(await Bun.file(join(recipePath, path)).bytes());
    hash.update("\0");
  }

  if (isSubrecipe(requirement)) {
    const sub = subrecipeScope(scope, requirement.name);
    for (const subrequirement of await loadRequirements(sub.recipeDir)) {
      hash.update(await Bun.file(hashPath(subrequirement, sub)).text());
      hash.update("\0");
    }
  }

  const outPath = join(scope.outDir, requirement.name);
  for (const path of await listFiles(outPath)) {
    const s = await stat(join(outPath, path));
    hash.update(path);
    hash.update("\0");
    hash.update(String(s.size));
    hash.update("\0");
    hash.update(String(s.mtimeMs));
    hash.update("\0");
  }

  return hash.digest("hex");
}

async function writeHash(requirement: Requirement, scope: Scope) {
  await Bun.write(hashPath(requirement, scope), await hashRequirement(requirement, scope));
}

async function checkHash(requirement: Requirement, scope: Scope): Promise<boolean> {
  try {
    const outHash = (await Bun.file(hashPath(requirement, scope)).text()).trim();
    return outHash === (await hashRequirement(requirement, scope));
  } catch {
    return false;
  }
}

const assembleArgs = {
  verbose: { type: "boolean", description: "Be louder" },
  force: { type: "boolean", description: "Reassemble, even if it looks the same" },
  refetch: { type: "boolean", description: "Redownload everything" },
} as const satisfies ArgsDef;

type AssembleArgs = ParsedArgs<typeof assembleArgs>;

async function assembleRequirementChecked(
  requirement: Requirement,
  scope: Scope,
  args: AssembleArgs,
) {
  if (isSubrecipe(requirement)) {
    const sub = subrecipeScope(scope, requirement.name);
    await assembleAll(await loadRequirements(sub.recipeDir), sub, args);
  }

  if (!args.force && !args.refetch && (await checkHash(requirement, scope))) {
    if (args.verbose) console.log(`${requirement.name} is up to date.`);
    return;
  }

  if (isSubrecipe(requirement)) await assembleSubrecipe(requirement, scope);
  else await assembleSource(requirement, scope, args);

  await writeHash(requirement, scope);
  if (args.verbose) console.log(`Assembled ${requirement.name}.`);
}

async function assembleAll(requirements: RequirementsConfig, scope: Scope, args: AssembleArgs) {
  await mkdir(scope.outDir, { recursive: true });

  const results = await Promise.allSettled(
    requirements.map((requirement) => assembleRequirementChecked(requirement, scope, args)),
  );

  const failures = results.flatMap((result, i) =>
    result.status === "rejected" ? [{ name: requirements[i].name, reason: result.reason }] : [],
  );
  for (const { name, reason } of failures) {
    console.error(`Failed to assemble ${name}:`, reason);
  }
  if (failures.length) {
    throw new Error(`${failures.length} of ${results.length} requirements failed to assemble.`);
  }
}

const assemble = defineCommand({
  meta: { name: "assemble", description: "Prepare all requirements for use" },
  args: assembleArgs,
  async run({ args }) {
    const start = performance.now();
    await assembleAll(await loadRequirements(ROOT_SCOPE.recipeDir), ROOT_SCOPE, args);
    const end = performance.now();
    console.log(`Assembled in ${(end - start).toFixed(2)} ms.`);
  },
});

const main = defineCommand({
  meta: { name: "convert-build", description: "The convert build system" },
  subCommands: { assemble },
});

await runMain(main);

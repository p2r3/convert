import { join } from "path";
import requirementsConfig from "../recipe/requirements.config";
import { defineCommand, runMain, type ArgsDef, type ParsedArgs } from "citty";
import { mkdir, readdir, rm, rename, stat } from "fs/promises";
import { $ } from "bun";

export type Requirement = {
  name: string;
  url: `https://${string}.tar.gz`; // only tar gz for now
  hash: [Bun.SupportedCryptoAlgorithms, string];
  patches?: string[];
};

export type RequirementsConfig = Requirement[];

const OUT_DIR = join(import.meta.dir, "../built");
const CACHE_DIR = join(import.meta.dir, "../.cache/convert-build");
const TARBALLS_DIR = join(CACHE_DIR, "tarballs");
const OUT_HASHES_DIR = join(CACHE_DIR, "out-hashes");

await mkdir(OUT_DIR, { recursive: true });
await mkdir(CACHE_DIR, { recursive: true });
await mkdir(TARBALLS_DIR, { recursive: true });
await mkdir(OUT_HASHES_DIR, { recursive: true });

const RECIPE_DIR = join(import.meta.dir, "../recipe");

async function fetchFile(path: string, url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch: ${res.status} ${res.statusText}`);
  const file = await res.bytes();
  await Bun.write(path, file);
  return file;
}

function outPathOf(requirement: Requirement) {
  return join(OUT_DIR, requirement.name);
}

async function extractTarball(requirement: Requirement, tarball: Uint8Array) {
  const outPath = outPathOf(requirement);
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

async function assembleRequirement(requirement: Requirement, args: AssembleArgs) {
  const tarballPath = join(TARBALLS_DIR, `${requirement.name}.tar.gz`);

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

  await extractTarball(requirement, tarball);

  const subrecipePath = join(RECIPE_DIR, requirement.name);
  const outPath = outPathOf(requirement);
  for (const patch of requirement.patches || []) {
    await $`patch -p1 -i ${join(subrecipePath, patch)}`.cwd(outPath);
  }
}

async function hashRequirement(requirement: Requirement) {
  const hash = new Bun.CryptoHasher("sha256");

  hash.update(JSON.stringify(requirement));
  hash.update("\0");

  const subrecipePath = join(RECIPE_DIR, requirement.name);
  for (const patch of requirement.patches || []) {
    hash.update(patch);
    hash.update("\0");
    hash.update(await Bun.file(join(subrecipePath, patch)).bytes());
    hash.update("\0");
  }

  const outPath = outPathOf(requirement);
  const paths = await readdir(outPath, { recursive: true });
  paths.sort();

  for (const path of paths) {
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

async function writeHash(requirement: Requirement) {
  const outHashPath = join(OUT_HASHES_DIR, requirement.name);
  const actualHash = await hashRequirement(requirement);
  await Bun.write(outHashPath, actualHash);
}

async function checkHash(requirement: Requirement): Promise<boolean> {
  const outHashPath = join(OUT_HASHES_DIR, requirement.name);

  try {
    const outHash = (await Bun.file(outHashPath).text()).trim();
    const actualHash = await hashRequirement(requirement);
    return outHash === actualHash;
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

async function assembleRequirementChecked(requirement: Requirement, args: AssembleArgs) {
  if (!args.force && !args.refetch && (await checkHash(requirement))) {
    if (args.verbose) console.log(`${requirement.name} is up to date.`);
    return;
  }
  await assembleRequirement(requirement, args);
  await writeHash(requirement);
  if (args.verbose) console.log(`Assembled ${requirement.name}.`);
}

const assemble = defineCommand({
  meta: { name: "assemble", description: "Prepare all requirements for use" },
  args: assembleArgs,
  async run({ args }) {
    const start = performance.now();
    const results = await Promise.allSettled(
      requirementsConfig.map((requirement) => assembleRequirementChecked(requirement, args)),
    );
    const end = performance.now();

    const failures = results.flatMap((result, i) =>
      result.status === "rejected"
        ? [{ name: requirementsConfig[i].name, reason: result.reason }]
        : [],
    );
    for (const { name, reason } of failures) {
      console.error(`Failed to assemble ${name}:`, reason);
    }
    if (failures.length) {
      throw new Error(`${failures.length} of ${results.length} requirements failed to assemble.`);
    }

    console.log(`Assembled in ${(end - start).toFixed(2)} ms.`);
  },
});

const main = defineCommand({
  meta: { name: "convert-build", description: "The convert build system" },
  subCommands: { assemble },
});

await runMain(main);

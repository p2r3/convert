import { basename, join, relative, sep } from "path";
import { cp, mkdir, rm, stat } from "fs/promises";
import { $ } from "bun";
import type { ArgsDef } from "citty";
import {
  DOWNLOADS_DIR,
  extractTarball,
  extractTarballNative,
  extractZip,
  findPrebuilts,
  loadRequirements,
  subrecipeScope,
  type Scope,
} from "./common";
import { hashFile, hashInputs, listFiles, updateHash } from "./hash";
import {
  hasSource,
  isAssembled,
  isPrebuilt,
  type AssembleRequirement,
  type PrebuildRequirement,
  type Requirement,
  type RequirementsConfig,
  type SourceRequirement,
} from "./types";

const ROOT_DIR = join(import.meta.dir, "../..");

async function fetchFile(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch: ${res.status} ${res.statusText}`);
  return await res.bytes();
}

export const assembleArgs = {
  verbose: { type: "boolean", description: "Be louder" },
  force: { type: "boolean", description: "Reassemble, even if it looks the same" },
  refetch: { type: "boolean", description: "Redownload everything" },
} as const satisfies ArgsDef;

export type AssembleArgs = { verbose?: boolean; force?: boolean; refetch?: boolean };

function hashPath(requirement: Requirement, scope: Scope) {
  return join(scope.stateDir, "out-hashes", requirement.name);
}

async function findCurrentPrebuilt(requirement: PrebuildRequirement, scope: Scope) {
  const inputs = await hashInputs(requirement, scope);
  return (await findPrebuilts(requirement, scope)).find((prebuilt) => prebuilt.inputs === inputs);
}

async function hashRequirement(requirement: Requirement, scope: Scope) {
  const hash = new Bun.CryptoHasher("sha256");

  updateHash(hash, await hashInputs(requirement, scope));

  if (isPrebuilt(requirement)) {
    const prebuilt = await findCurrentPrebuilt(requirement, scope);
    if (prebuilt) updateHash(hash, await Bun.file(prebuilt.path).bytes());
  } else if (isAssembled(requirement)) {
    const sub = subrecipeScope(scope, requirement.name);
    for (const subrequirement of await loadRequirements(sub.recipeDir)) {
      updateHash(hash, await Bun.file(hashPath(subrequirement, sub)).text());
    }
  }

  const outPath = join(scope.outDir, requirement.name);
  for (const path of await listFiles(outPath)) {
    const s = await stat(join(outPath, path));
    updateHash(hash, path, String(s.size), String(s.mtimeMs));
  }

  return hash.digest("hex");
}

async function writeHash(requirement: Requirement, scope: Scope) {
  await Bun.write(hashPath(requirement, scope), await hashRequirement(requirement, scope));
}

async function checkHash(requirement: Requirement, scope: Scope): Promise<boolean> {
  const file = Bun.file(hashPath(requirement, scope));
  if (!(await file.exists())) return false;
  return (await file.text()).trim() === (await hashRequirement(requirement, scope));
}

async function readCachedDownload(requirement: SourceRequirement, path: string) {
  const file = Bun.file(path);
  if (!(await file.exists())) return undefined;
  const bytes = await file.bytes();
  if (hashFile(requirement.hash[0], bytes) === requirement.hash[1]) return bytes;
  console.warn(`Bad hash for cached ${requirement.name} download, refetching.`);
  return undefined;
}

async function fetchDownload(requirement: SourceRequirement, path: string) {
  console.log(`Fetching file ${requirement.url}...`);
  const bytes = await fetchFile(requirement.url);
  const hash = hashFile(requirement.hash[0], bytes);
  if (hash !== requirement.hash[1]) {
    throw new Error(
      `Requirement claimed a ${requirement.hash[0]} hash of ${requirement.hash[1]}, but the source hashes to ${hash}!`,
    );
  }
  await mkdir(DOWNLOADS_DIR, { recursive: true });
  await Bun.write(path, bytes);
  console.log(`Got sources for ${requirement.name}.`);
  return bytes;
}

export async function fetchSource(requirement: SourceRequirement, args: AssembleArgs) {
  const downloadPath = join(DOWNLOADS_DIR, requirement.hash[1]);

  const bytes = args.refetch ? undefined : await readCachedDownload(requirement, downloadPath);
  if (!bytes) return await fetchDownload(requirement, downloadPath);
  if (args.verbose) console.log(`Using cached download for ${requirement.name}.`);
  return bytes;
}

export async function extractSource(
  requirement: SourceRequirement,
  bytes: Uint8Array,
  outPath: string,
) {
  const urlPath = new URL(requirement.url).pathname;
  // ".tgz" is what npm-style package archives are called
  if (urlPath.endsWith(".tar.gz") || urlPath.endsWith(".tgz")) {
    await extractTarball(outPath, bytes);
  } else if (urlPath.endsWith(".zip")) {
    await extractZip(outPath, bytes);
  } else if (
    urlPath.endsWith(".tar.xz") ||
    urlPath.endsWith(".tar.bz2") ||
    urlPath.endsWith(".tar.zst")
  ) {
    await extractTarballNative(outPath, bytes); // this might not work on windows
  } else {
    await rm(outPath, { recursive: true, force: true });
    await Bun.write(join(outPath, decodeURIComponent(basename(urlPath))), bytes);
  }
}

// fetches, extracts and patches the source of a requirement in scope
export async function prepareSource(
  requirement: SourceRequirement,
  scope: Scope,
  outPath: string,
  args: AssembleArgs,
) {
  await extractSource(requirement, await fetchSource(requirement, args), outPath);

  const recipePath = join(scope.recipeDir, requirement.name);

  for (const [from, to] of Object.entries(requirement.copy || {})) {
    await cp(join(recipePath, from), join(outPath, to), { recursive: true });
  }

  for (const patch of requirement.patches || []) {
    const directory = relative(ROOT_DIR, outPath).split(sep).join("/");
    await $`git apply -p1 --ignore-whitespace ${`--directory=${directory}`} ${join(recipePath, patch)}`.cwd(
      ROOT_DIR,
    );
  }
}

async function assembleSubrecipe(
  requirement: AssembleRequirement,
  scope: Scope,
  args: AssembleArgs,
) {
  const sub = subrecipeScope(scope, requirement.name);
  const outPath = join(scope.outDir, requirement.name);
  await rm(outPath, { recursive: true, force: true });
  await mkdir(outPath, { recursive: true });

  // a fresh copy every time, so the script can't see leftovers from an earlier run
  const cwd = join(sub.stateDir, "source");
  if (hasSource(requirement)) {
    await prepareSource(requirement, scope, cwd, args);
  } else {
    await rm(cwd, { recursive: true, force: true });
    await mkdir(cwd, { recursive: true });
  }

  await $`bun run ${join(sub.recipeDir, requirement.assemble)}`
    .cwd(cwd)
    .env({ ...process.env, OUT_DIR: outPath, REQUIREMENTS_DIR: sub.outDir });
}

async function assemblePrebuilt(requirement: PrebuildRequirement, scope: Scope) {
  const prebuilt = await findCurrentPrebuilt(requirement, scope);
  if (!prebuilt) {
    throw new Error(
      `Prebuilt ${requirement.name} is missing or stale, run \`bun run build:prebuild ${requirement.name}\` to update it.`,
    );
  }

  await extractTarball(join(scope.outDir, requirement.name), await Bun.file(prebuilt.path).bytes());
}

async function assembleRequirementChecked(
  requirement: Requirement,
  scope: Scope,
  args: AssembleArgs,
) {
  // our hash covers the subrecipe's own requirements, so they must be current before the check
  if (isAssembled(requirement)) {
    const sub = subrecipeScope(scope, requirement.name);
    await assembleAll(await loadRequirements(sub.recipeDir), sub, args);
  }

  if (!args.force && !args.refetch && (await checkHash(requirement, scope))) {
    if (args.verbose) console.log(`${requirement.name} is up to date.`);
    return;
  }

  // a failure partway through must not leave the old hash vouching for a half-assembled output
  await rm(hashPath(requirement, scope), { force: true });

  if (isPrebuilt(requirement)) await assemblePrebuilt(requirement, scope);
  else if (isAssembled(requirement)) await assembleSubrecipe(requirement, scope, args);
  else if (hasSource(requirement))
    await prepareSource(requirement, scope, join(scope.outDir, requirement.name), args);

  await writeHash(requirement, scope);
  if (args.verbose) console.log(`Assembled ${requirement.name}.`);
}

export async function assembleAll(
  requirements: RequirementsConfig,
  scope: Scope,
  args: AssembleArgs,
) {
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

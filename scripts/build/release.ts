import { basename, join, relative } from "path";
import { mkdir, readdir, rename, rm } from "fs/promises";
import { $ } from "bun";
import { CACHE_DIR, ROOT_SCOPE, ask, inlinePath, readPointer, type Pointer } from "./common";
import { hashFile } from "./hash";
import type { PrebuildRequirement } from "./types";

// prebuilt tarballs live in github release assets, git only tracks a small pointer to them.
// assets are named by their content hash, so a new build never replaces one something still uses
export const REPO = process.env.PREBUILT_REPO ?? "p2r3/convert";
export const TAG = process.env.PREBUILT_TAG ?? "prebuilts";

export const PREBUILT_CACHE = join(CACHE_DIR, "prebuilts");

// smaller tarballs are committed to git, a release asset isn't worth it for them
const INLINE_LIMIT = 1024 * 1024;

export type ReleasePointer = Pointer & { url: string };

const isReleasePointer = (pointer: Pointer): pointer is ReleasePointer => Boolean(pointer.url);

export async function writePointer(path: string, pointer: Pointer) {
  await Bun.write(path, JSON.stringify(pointer, null, 2) + "\n");
}

function releaseUrl(repo: string, asset: string) {
  return `https://github.com/${repo}/releases/download/${TAG}/${asset}`;
}

function cachePath(pointer: ReleasePointer) {
  return join(PREBUILT_CACHE, basename(new URL(pointer.url).pathname));
}

async function cacheTarball(path: string, tarball: Uint8Array) {
  // assembles run in parallel, so never leave a half-written tarball where another one looks
  const tmp = `${path}.${crypto.randomUUID()}.tmp`;
  await mkdir(PREBUILT_CACHE, { recursive: true });
  await Bun.write(tmp, tarball);
  await rename(tmp, path);
}

// for a tarball that was verified against its pointer, so it can be uploaded
export async function cachePrebuilt(pointer: Pointer, tarball: Uint8Array) {
  if (isReleasePointer(pointer)) await cacheTarball(cachePath(pointer), tarball);
}

// writes the pointer, and the tarball next to it if it's small. otherwise the tarball is cached
// locally and still needs to be uploaded
export async function writePrebuilt(
  requirement: PrebuildRequirement,
  pointerPath: string,
  inputs: string,
  tarball: Uint8Array,
) {
  const sha256 = hashFile("sha256", tarball);
  const size = tarball.length;
  let pointer: Pointer;
  if (size <= INLINE_LIMIT) {
    pointer = { inputs, sha256, size };
    await Bun.write(inlinePath(pointerPath), tarball);
  } else {
    const url = releaseUrl(REPO, `${requirement.name}-${sha256}.tar.gz`);
    pointer = { inputs, url, sha256, size };
    await cacheTarball(cachePath({ ...pointer, url }), tarball);
    await rm(inlinePath(pointerPath), { force: true });
  }
  await writePointer(pointerPath, pointer);
  return pointer;
}

export async function readCached(pointer: ReleasePointer) {
  const file = Bun.file(cachePath(pointer));
  if (!(await file.exists())) return undefined;
  const bytes = await file.bytes();
  if (hashFile("sha256", bytes) === pointer.sha256) return bytes;
  console.warn(`Bad hash for cached ${basename(cachePath(pointer))}, refetching.`);
  return undefined;
}

export async function fetchPrebuilt(pointer: Pointer, pointerPath: string) {
  if (!isReleasePointer(pointer)) {
    const bytes = await Bun.file(inlinePath(pointerPath)).bytes();
    const sha256 = hashFile("sha256", bytes);
    if (sha256 !== pointer.sha256) {
      throw new Error(
        `${inlinePath(pointerPath)} hashes to ${sha256}, expected ${pointer.sha256}!`,
      );
    }
    return bytes;
  }
  return await downloadPrebuilt(pointer);
}

export async function downloadPrebuilt(pointer: ReleasePointer) {
  const cached = await readCached(pointer);
  if (cached) return cached;

  const mb = (pointer.size / 1024 / 1024).toFixed(1);
  console.log(`Fetching prebuilt ${pointer.url} (${mb} MB)...`);
  const res = await fetch(pointer.url);
  if (!res.ok) {
    throw new Error(
      `Could not fetch prebuilt ${pointer.url}: ${res.status} ${res.statusText}. If it was just built, run \`bun run build:upload\`.`,
    );
  }
  const bytes = await res.bytes();
  const sha256 = hashFile("sha256", bytes);
  if (sha256 !== pointer.sha256) {
    throw new Error(`Prebuilt ${pointer.url} hashes to ${sha256}, expected ${pointer.sha256}!`);
  }
  await cacheTarball(cachePath(pointer), bytes);
  return bytes;
}

// every pointer under prebuilt/ whose tarball lives in a release
export async function findReleasePointers() {
  let entries;
  try {
    entries = await readdir(ROOT_SCOPE.prebuiltDir, { recursive: true, withFileTypes: true });
  } catch {
    return [];
  }
  const paths = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => join(entry.parentPath, entry.name))
    .toSorted();

  const found: { path: string; name: string; pointer: ReleasePointer }[] = [];
  for (const path of paths) {
    const pointer = await readPointer(path);
    const name = relative(ROOT_SCOPE.prebuiltDir, path);
    if (isReleasePointer(pointer)) found.push({ path, name, pointer });
  }
  return found;
}

export function parseReleaseUrl(url: string) {
  const match =
    /^https:\/\/github\.com\/([^/]+\/[^/]+)\/releases\/download\/([^/]+)\/([^/]+)$/.exec(url);
  if (!match) throw new Error(`Prebuilt url ${url} is not a github release asset.`);
  const [, repo, tag, asset] = match;
  return { repo, tag, asset };
}

// staged means uploaded somewhere else, usually a contributor's fork, and not adopted yet
export function isStaged(pointer: ReleasePointer) {
  const { repo, tag } = parseReleaseUrl(pointer.url);
  return repo.toLowerCase() !== REPO.toLowerCase() || tag !== TAG;
}

// release assets by repo, fetched once per run
const releases = new Map<string, Promise<Set<string> | undefined>>();

function listAssets(repo: string, tag: string) {
  const key = `${repo}@${tag}`;
  let assets = releases.get(key);
  if (!assets) {
    assets = (async () => {
      const view = await $`gh release view ${tag} -R ${repo} --json assets`.quiet().nothrow();
      if (view.exitCode !== 0) return undefined;
      const release: unknown = JSON.parse(view.stdout.toString());
      if (typeof release !== "object" || !release || !("assets" in release)) return undefined;
      if (!Array.isArray(release.assets)) return undefined;
      return new Set(
        release.assets.flatMap((asset: unknown) =>
          typeof asset === "object" && asset && "name" in asset && typeof asset.name === "string"
            ? [asset.name]
            : [],
        ),
      );
    })();
    releases.set(key, assets);
  }
  return assets;
}

export async function isUploaded(pointer: ReleasePointer) {
  const { repo, tag, asset } = parseReleaseUrl(pointer.url);
  return (await listAssets(repo, tag))?.has(asset) ?? false;
}

async function canPush(repo: string) {
  const res = await $`gh api repos/${repo} --jq .permissions.push`.quiet().nothrow();
  return res.stdout.toString().trim() === "true";
}

// uploads the cached tarball to the release of repo, and returns the pointer pointing there
export async function uploadPrebuilt(
  pointer: ReleasePointer,
  repo: string,
): Promise<ReleasePointer> {
  const { asset } = parseReleaseUrl(pointer.url);
  const moved = { ...pointer, url: releaseUrl(repo, asset) };
  const assets = await listAssets(repo, TAG);
  if (assets?.has(asset)) return moved;

  if (!(await readCached(pointer))) {
    throw new Error(
      `Tarball ${asset} isn't in the local cache, rebuild it with \`bun run build:prebuild --force <name>\` first.`,
    );
  }
  if (!(await canPush(repo))) {
    throw new Error(`You can't upload to ${repo}.`);
  }
  if (!assets) {
    console.log(`Creating release ${TAG} on ${repo}...`);
    await $`gh release create ${TAG} -R ${repo} --prerelease --latest=false --title ${"Prebuilt artifacts"} --notes ${"Build artifacts referenced by prebuilt/*.json, managed by `bun run build:upload`. Do not delete, old commits need them."}`.quiet();
    releases.set(`${repo}@${TAG}`, Promise.resolve(new Set()));
  }

  const mb = (pointer.size / 1024 / 1024).toFixed(1);
  console.log(`Uploading ${asset} (${mb} MB) to ${repo}...`);
  // the cached file is already named like the asset
  await $`gh release upload ${TAG} -R ${repo} ${cachePath(pointer)}`;
  (await listAssets(repo, TAG))!.add(asset);
  return moved;
}

// the fork to stage on when we can't push to REPO, offering to create one
async function chooseFork(): Promise<string | undefined> {
  const login = (await $`gh api user --jq .login`.text()).trim();
  const fork = `${login}/${REPO.split("/")[1]}`;
  const parent = await $`gh api repos/${fork} --jq .parent.full_name`.quiet().nothrow();
  const isFork = parent.stdout.toString().trim().toLowerCase() === REPO.toLowerCase();

  console.log(`You can't upload to ${REPO}, so the prebuilts get staged on your fork instead.`);
  if (!isFork) {
    if (ask(`Fork ${REPO} to ${fork}?`, ["y", "n"], "y") === "n") return undefined;
    await $`gh repo fork ${REPO} --clone=false --remote=false`;
  }
  return fork;
}

// uploads every tarball a pointer refers to that isn't on its release yet. pointers that
// aren't uploaded anywhere are moved to repo first, which is how contributors stage on a fork
export async function uploadAll(repo?: string) {
  const pending = [];
  for (const item of await findReleasePointers()) {
    if (!(await isUploaded(item.pointer))) pending.push(item);
  }
  if (!pending.length) {
    console.log("All prebuilts are uploaded.");
    return;
  }

  repo ??= (await canPush(REPO)) ? REPO : await chooseFork();
  if (!repo) return;

  const mb = pending.reduce((total, { pointer }) => total + pointer.size, 0) / 1024 / 1024;
  console.log(`Not uploaded yet: ${pending.map(({ name }) => name).join(", ")}`);
  if (ask(`Upload them (${mb.toFixed(1)} MB) to ${repo}?`, ["y", "n"], "y") === "n") return;

  for (const { path, pointer } of pending) {
    await writePointer(path, await uploadPrebuilt(pointer, repo));
  }
  console.log(`Uploaded ${pending.length} prebuilts.`);
  if (repo.toLowerCase() !== REPO.toLowerCase()) {
    console.log(`Commit prebuilt/ and open your PR, a maintainer moves them to ${REPO}.`);
  }
}

// for ci, fails unless every pointer is uploaded and adopted
export async function checkUploads() {
  const problems: string[] = [];
  for (const { name, pointer } of await findReleasePointers()) {
    if (!(await isUploaded(pointer))) problems.push(`${name} is not uploaded to ${pointer.url}`);
    else if (isStaged(pointer))
      problems.push(`${name} is staged on ${parseReleaseUrl(pointer.url).repo}, not adopted`);
  }
  for (const problem of problems) console.error(problem);
  if (problems.length) {
    throw new Error(
      `${problems.length} prebuilts need attention. Run \`bun run build:upload\`, or \`bun run build:upload --adopt\` for prebuilts staged on a fork.`,
    );
  }
  console.log("All prebuilts are uploaded and adopted.");
}

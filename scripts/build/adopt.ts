import { $ } from "bun";
import {
  ROOT_SCOPE,
  ask,
  findPrebuilt,
  loadRequirements,
  prebuiltPath,
  subrecipeScope,
  type Scope,
} from "./common";
import { hashInputs } from "./hash";
import { prebuild, type PrebuildArgs } from "./prebuild";
import {
  REPO,
  TAG,
  downloadPrebuilt,
  findReleasePointers,
  isStaged,
  isUploaded,
  parseReleaseUrl,
  uploadPrebuilt,
  writePointer,
  type ReleasePointer,
} from "./release";
import { isPrebuilt, isSubrecipe, type PrebuildRequirement } from "./types";

type Staged = {
  path: string;
  name: string;
  pointer: ReleasePointer;
  repo: string;
  // only known when the pointer is the current one for its requirement, otherwise it can't be rebuilt
  requirement?: { requirement: PrebuildRequirement; scope: Scope };
};

async function currentPointers(scope: Scope, found = new Map<string, Staged["requirement"]>()) {
  for (const requirement of await loadRequirements(scope.recipeDir)) {
    if (!isSubrecipe(requirement)) continue;
    await currentPointers(subrecipeScope(scope, requirement.name), found);
    if (
      isPrebuilt(requirement) &&
      (await findPrebuilt(requirement, scope, await hashInputs(requirement, scope)))
    ) {
      found.set(prebuiltPath(requirement, scope), { requirement, scope });
    }
  }
  return found;
}

async function findStaged(): Promise<Staged[]> {
  const current = await currentPointers(ROOT_SCOPE);
  const staged: Staged[] = [];
  for (const { path, name, pointer } of await findReleasePointers()) {
    if (!isStaged(pointer)) continue;
    staged.push({
      path,
      name,
      pointer,
      repo: parseReleaseUrl(pointer.url).repo,
      requirement: current.get(path),
    });
  }
  return staged;
}

// returns whether the tarball is now in the local cache and can be trusted
async function verify(item: Staged): Promise<boolean> {
  const mb = (item.pointer.size / 1024 / 1024).toFixed(1);
  console.log(`\n${item.name}: ${mb} MB, staged on ${item.repo}`);

  if (!(await isUploaded(item.pointer))) {
    console.log("  The tarball isn't on that release, ask the contributor to upload it. Skipping.");
    return false;
  }

  const choices = item.requirement ? (["r", "t", "s"] as const) : (["t", "s"] as const);
  if (!item.requirement)
    console.log("  It doesn't match the current recipe, so it can't be rebuilt.");
  const answer = ask(
    item.requirement
      ? "  [r]ebuild and compare (slow, safe), [t]rust the download, or [s]kip?"
      : "  [t]rust the download, or [s]kip?",
    [...choices],
    item.requirement ? "r" : "s",
  );

  try {
    if (answer === "r") {
      const { requirement, scope } = item.requirement!;
      // --check rebuilds, fails unless it matches the pointer and caches the verified tarball
      const args: PrebuildArgs = {
        _: [],
        check: true,
        verbose: false,
        force: false,
        "keep-tmp": false,
      };
      await prebuild(requirement, scope, args);
    } else if (answer === "t") {
      await downloadPrebuilt(item.pointer);
    } else return false;
  } catch (error) {
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
    console.log("  Not adopting it.");
    return false;
  }
  return true;
}

// moves prebuilts that contributors staged on their forks into our release, asking along the way
export async function adoptAll() {
  if (!process.stdin.isTTY) throw new Error("Adopting asks questions, run it in a terminal.");

  const staged = await findStaged();
  if (!staged.length) {
    console.log(`Nothing to adopt, every prebuilt points to ${REPO}.`);
    return;
  }

  console.log(`Prebuilts staged outside ${REPO}:`);
  for (const { name, repo } of staged) console.log(`  ${name} from ${repo}`);

  const verified: Staged[] = [];
  for (const item of staged) if (await verify(item)) verified.push(item);
  if (!verified.length) {
    console.log("\nNothing was verified, nothing to adopt.");
    return;
  }

  console.log(`\nVerified: ${verified.map(({ name }) => name).join(", ")}`);
  if (ask(`Upload them to ${REPO}@${TAG} and update the pointers?`, ["y", "n"], "y") === "n")
    return;
  for (const item of verified)
    await writePointer(item.path, await uploadPrebuilt(item.pointer, REPO));

  const paths = verified.map(({ path }) => path);
  if (ask("Commit the updated pointers?", ["y", "n"], "y") === "n") return;
  const names = verified.map(({ name }) => name.replace(/\.json$/, ""));
  // only the pointers, whatever else is staged stays staged
  await $`git commit -m ${`adopt prebuilts: ${names.join(", ")}`} -- ${paths}`;

  if (ask("Push it?", ["y", "n"], "n") === "y") await $`git push`;
}

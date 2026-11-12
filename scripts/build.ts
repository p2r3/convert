import { $ } from "bun";
import { defineCommand, runMain } from "citty";
import { addSource } from "./build/add";
import { assembleAll, assembleArgs } from "./build/assemble";
import {
  ROOT_SCOPE,
  findPrebuilt,
  loadRequirements,
  selectArgs,
  selectRequirements,
  subrecipeScope,
  type Scope,
} from "./build/common";
import { hashInputs } from "./build/hash";
import { editPatch, finishPatch, patchStatus, savePatch } from "./build/patch";
import { prebuildAll, prebuildArgs } from "./build/prebuild";
import { adoptAll } from "./build/adopt";
import { checkUploads, uploadAll } from "./build/release";
import { isPrebuilt, isSubrecipe, type RequirementsConfig } from "./build/types";

// a failed command already streamed its own stderr, so skip the ShellError dump of the buffered output
async function quietShellErrors(run: () => Promise<void>) {
  try {
    await run();
  } catch (error) {
    if (!(error instanceof $.ShellError)) throw error;
    console.error(`error: ${error.message}`);
    process.exit(error.exitCode || 1);
  }
}

const assemble = defineCommand({
  meta: {
    name: "assemble",
    description: "Prepare requirements for use, all but the optional ones by default",
  },
  args: { ...selectArgs, ...assembleArgs },
  run: ({ args }) =>
    quietShellErrors(async () => {
      await import("./remove-old");
      const start = performance.now();
      const config = await loadRequirements(ROOT_SCOPE.recipeDir);
      const requirements =
        args._.length || args.all
          ? selectRequirements(config, args._, args.all)
          : config.filter((requirement) => !requirement.optional);
      await assembleAll(requirements, ROOT_SCOPE, args);
      const end = performance.now();
      console.log(`Assembled in ${(end - start).toFixed(2)} ms.`);
    }),
});

const prebuild = defineCommand({
  meta: { name: "prebuild", description: "Build prebuilt subrecipes in docker" },
  args: { ...selectArgs, ...prebuildArgs },
  run: ({ args }) =>
    quietShellErrors(async () => {
      const start = performance.now();
      const requirements = selectRequirements(
        await loadRequirements(ROOT_SCOPE.recipeDir),
        args._,
        args.all,
      );
      const nothing = requirements.filter((requirement) => !isSubrecipe(requirement));
      if (!args.all && nothing.length) {
        throw new Error(`Nothing to prebuild in ${nothing.map(({ name }) => name).join(", ")}.`);
      }
      await prebuildAll(requirements, ROOT_SCOPE, args, args.all ?? false);
      const end = performance.now();
      console.log(`Prebuilt in ${(end - start).toFixed(2)} ms.`);
    }),
});

async function checkAll(requirements: RequirementsConfig, scope: Scope) {
  for (const requirement of requirements) {
    if (isPrebuilt(requirement)) {
      const inputs = await hashInputs(requirement, scope);
      if (!(await findPrebuilt(requirement, scope, inputs))) {
        throw new Error(
          `Prebuilt ${requirement.name} is missing or stale, run \`bun run build:prebuild ${requirement.name}\`.`,
        );
      }
    } else if (isSubrecipe(requirement)) {
      const sub = subrecipeScope(scope, requirement.name);
      await checkAll(await loadRequirements(sub.recipeDir), sub);
    }
  }
}

const check = defineCommand({
  meta: { name: "check", description: "Verify everything is up to date" },
  async run() {
    await checkAll(await loadRequirements(ROOT_SCOPE.recipeDir), ROOT_SCOPE);
    console.log("Up to date.");
  },
});

const upload = defineCommand({
  meta: { name: "upload", description: "Upload new prebuilts to the github release" },
  args: {
    repo: {
      type: "string",
      description: "Upload to the release of this repo without asking, like your fork",
    },
    check: {
      type: "boolean",
      description: "Fail unless every prebuilt is uploaded and adopted",
    },
    adopt: {
      type: "boolean",
      description: "Verify prebuilts staged on forks and move them to our release",
    },
  },
  run: ({ args }) =>
    quietShellErrors(async () => {
      if (args.check) await checkUploads();
      else if (args.adopt) await adoptAll();
      else await uploadAll(args.repo);
    }),
});

const nameArg = {
  name: {
    type: "positional",
    required: true,
    description: "Requirement to patch, as subrecipe/name for ones inside a subrecipe",
  },
} as const;

const algorithmArg = {
  algorithm: {
    type: "string",
    description: "git diff algorithm: myers, minimal, patience or histogram",
  },
} as const;

const patch = defineCommand({
  meta: { name: "patch", description: "Create or edit a patch for a requirement" },
  subCommands: {
    edit: defineCommand({
      meta: { name: "edit", description: "Set up a workspace for editing a patch" },
      args: {
        ...nameArg,
        patch: {
          type: "positional",
          required: true,
          description: "Patch file name, created if it doesn't exist",
        },
        reset: { type: "boolean", description: "Throw away an existing workspace and start over" },
      },
      run: ({ args }) => editPatch(args.name, args.patch, args.reset ?? false),
    }),
    save: defineCommand({
      meta: { name: "save", description: "Write the workspace changes to the patch" },
      args: { ...nameArg, ...algorithmArg },
      run: ({ args }) => savePatch(args.name, args.algorithm),
    }),
    status: defineCommand({
      meta: { name: "status", description: "Show the workspace and what changed in it" },
      args: nameArg,
      run: ({ args }) => patchStatus(args.name),
    }),
    finish: defineCommand({
      meta: { name: "finish", description: "Delete the workspace, without saving" },
      args: nameArg,
      run: ({ args }) => finishPatch(args.name),
    }),
  },
});

const add = defineCommand({
  meta: { name: "add", description: "Download and add a source with its SHA-256 hash" },
  args: {
    name: {
      type: "positional",
      required: true,
      description: "Requirement name, or subrecipe/name for a subrecipe dependency",
    },
    url: { type: "positional", required: true, description: "HTTPS source URL" },
  },
  run: ({ args }) => addSource(args.name, args.url),
});

const main = defineCommand({
  meta: { name: "convert-build", description: "The convert build system" },
  subCommands: { assemble, prebuild, check, upload, patch, add },
});

await runMain(main);

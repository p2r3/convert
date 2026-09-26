import { join } from "path";
import requirementsConfig from "../recipe/requirements.config";
import { defineCommand, runMain } from "citty";
import { mkdir, readdir, rm, rename } from "fs/promises";

export type RequirementsConfig = Record<
  string,
  {
    url: `https://${string}.tar.gz`; // only tar gz for now
    hash: [Bun.SupportedCryptoAlgorithms, string];
  }
>;

const OUT_DIR = join(import.meta.dir, "../built");
const CACHE_DIR = join(import.meta.dir, "../.cache/convert-build");
const TARBALLS_DIR = join(CACHE_DIR, "tarballs");

await mkdir(OUT_DIR, { recursive: true });
await mkdir(CACHE_DIR, { recursive: true });
await mkdir(TARBALLS_DIR, { recursive: true });

const assemble = defineCommand({
  meta: { name: "assemble", description: "Prepare all requirements for use" },
  args: {},
  async run() {
    for (const [name, requirement] of Object.entries(requirementsConfig)) {
      console.log(`Moving onto ${name}...`);
      const fileName = join(TARBALLS_DIR, `${name}.tar.gz`);

      if (!(await Bun.file(fileName).exists())) {
        console.log(`Fetching file ${requirement.url}...`);
        const res = await fetch(requirement.url);
        if (!res.ok) throw new Error(`Could not fetch: ${res.status} ${res.statusText}`);
        await Bun.write(fileName, res);
      }
      const tarball = await Bun.file(fileName).bytes();

      const hash = new Bun.CryptoHasher(requirement.hash[0]).update(tarball).digest("hex");

      if (hash !== requirement.hash[1]) {
        throw new Error(
          `Requirement claimed a ${requirement.hash[0]} hash of ${requirement.hash[1]}, but the source hashes to ${hash}!`,
        );
      }

      const tmp = join(CACHE_DIR, "tmp");
      const out = join(OUT_DIR, name);
      await mkdir(tmp, { recursive: true });
      await rm(out, { recursive: true, force: true });

      const archive = new Bun.Archive(tarball);
      await archive.extract(tmp);

      const [inner] = await readdir(tmp);
      await rename(join(tmp, inner), out);
      await rm(tmp, { recursive: true });

      console.log(`Assembled ${name}.`);
    }
    console.log("All done.");
  },
});

const main = defineCommand({
  meta: { name: "convert-build", description: "The convert build system" },
  subCommands: { assemble },
});

await runMain(main);

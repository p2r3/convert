import type { FileData, FileFormat, FormatHandler } from "src/FormatHandler";
import CommonFormats from "src/CommonFormats";
import JSZip from "jszip";

class mcModpackHandler implements FormatHandler {
    public name: string = "mcModpack";
    public supportedFormats?: FileFormat[];
    public ready: boolean = false;

    async init() {
        this.supportedFormats = [
            CommonFormats.MRPACK.supported("mrpack", true, true, true),
            CommonFormats.ZIP.supported("zip", true, true, true) // Only handles generic .zip modpacks when routed appropriately
        ];
        this.ready = true;
    }

    async doConvert(
        inputFiles: FileData[],
        inputFormat: FileFormat,
        outputFormat: FileFormat
    ): Promise<FileData[]> {
        const outputFiles: FileData[] = [];

        for (const file of inputFiles) {
            const zip = new JSZip();
            const outZip = new JSZip();
            await zip.loadAsync(file.bytes);

            if (inputFormat.internal === "mrpack" && outputFormat.internal === "zip") {
                const indexFile = zip.file("modrinth.index.json");
                if (!indexFile) throw new Error("Invalid Modrinth modpack: missing modrinth.index.json");
                const index = JSON.parse(await indexFile.async("text"));

                const overridePromises: Promise<void>[] = [];
                zip.forEach((relativePath, zipEntry) => {
                    if (!zipEntry.dir && relativePath.startsWith("overrides/")) {
                        overridePromises.push(zipEntry.async("uint8array").then(data => {
                            outZip.file(relativePath, data);
                        }));
                    }
                });
                await Promise.all(overridePromises);

                // Download mods
                for (const modFile of index.files || []) {
                    const downloadUrl = modFile.downloads[0];
                    if (downloadUrl) {
                        try {
                            const res = await fetch(downloadUrl);
                            if (res.ok) {
                                const buffer = await res.arrayBuffer();
                                // The path in Modrinth is usually 'mods/somemod.jar' etc.
                                // It should go into 'overrides/' inside the CF zip.
                                outZip.file(`overrides/${modFile.path}`, new Uint8Array(buffer));
                            } else {
                                console.warn(`Failed to download ${downloadUrl} (status ${res.status})`);
                            }
                        } catch (e) {
                            console.error(`Error downloading ${downloadUrl}`, e);
                        }
                    }
                }

                // Construct CF manifest.json
                const modLoaders = [];
                for (const [loader, version] of Object.entries(index.dependencies || {})) {
                    if (loader !== "minecraft") {
                        let cfLoaderId = `${loader}-${version}`;
                        if (loader === "fabric-loader") cfLoaderId = `fabric-${version}`;
                        modLoaders.push({
                            id: cfLoaderId,
                            primary: true
                        });
                    }
                }

                const manifest = {
                    minecraft: {
                        version: index.dependencies?.minecraft || "1.20.1",
                        modLoaders: modLoaders
                    },
                    manifestType: "minecraftModpack",
                    manifestVersion: 1,
                    name: index.name || "Converted Modpack",
                    version: index.versionId || "1.0.0",
                    author: "Converted",
                    files: [],
                    overrides: "overrides"
                };

                outZip.file("manifest.json", JSON.stringify(manifest, null, 2));

            } else if ((inputFormat.internal === "zip" || file.name.endsWith(".zip")) && outputFormat.internal === "mrpack") {
                const manifestFile = zip.file("manifest.json");
                if (!manifestFile) throw new Error("Invalid CurseForge modpack: missing manifest.json inside zip.");
                const manifest = JSON.parse(await manifestFile.async("text"));

                // We only convert minecraftModpacks
                if (manifest.manifestType !== "minecraftModpack") {
                    throw new Error(`Unsupported manifest type: ${manifest.manifestType}`);
                }

                const overridesStr = manifest.overrides || "overrides";
                const overridePromises: Promise<void>[] = [];
                zip.forEach((relativePath, zipEntry) => {
                    if (!zipEntry.dir && relativePath.startsWith(overridesStr + "/")) {
                        overridePromises.push(zipEntry.async("uint8array").then(data => {
                            const modrinthPath = relativePath.replace(overridesStr + "/", "overrides/");
                            outZip.file(modrinthPath, data);
                        }));
                    }
                });
                await Promise.all(overridePromises);

                // Download CurseForge mods
                for (const modFile of manifest.files || []) {
                    try {
                        const fileDir = await fetch(`https://www.curseforge.com/api/v1/mods/${modFile.projectID}/files/${modFile.fileID}`);
                        if (fileDir.ok) {
                            const fileJson = await fileDir.json();
                            const fileName = fileJson.data.fileName;

                            const fileWeb = await fetch(`https://www.curseforge.com/api/v1/mods/${modFile.projectID}/files/${modFile.fileID}/download`);
                            if (fileWeb.ok) {
                                const buffer = await fileWeb.arrayBuffer();
                                outZip.file(`overrides/mods/${fileName}`, new Uint8Array(buffer));
                            } else {
                                console.warn(`Failed to download CF file ${modFile.fileID}`);
                            }
                        } else {
                            console.warn(`Failed to fetch CF mod info for ${modFile.projectID}:${modFile.fileID}`);
                        }
                    } catch (e) {
                        console.error(`Error downloading CF mod ${modFile.projectID}:${modFile.fileID}`, e);
                    }
                }

                // Construct Modrinth modrinth.index.json
                const modloader = manifest.minecraft?.modLoaders?.[0]?.id || "forge";
                const loaderParts = modloader.split("-");
                let loaderName = loaderParts[0].toLowerCase();
                if (loaderName === "fabric") loaderName = "fabric-loader";
                const loaderVersion = loaderParts.slice(1).join("-") || "*";

                const index = {
                    formatVersion: 1,
                    game: "minecraft",
                    versionId: manifest.version || "1.0.0",
                    name: manifest.name || "Converted Modpack",
                    summary: manifest.author ? `Author: ${manifest.author}` : "Converted Modpack",
                    files: [],
                    dependencies: {
                        minecraft: manifest.minecraft?.version || "1.20.1",
                        [loaderName]: loaderVersion
                    }
                };

                outZip.file("modrinth.index.json", JSON.stringify(index, null, 2));

            } else {
                throw new Error(`Unsupported conversion route: ${inputFormat.internal} -> ${outputFormat.internal}`);
            }

            const outBytes = await outZip.generateAsync({ type: "uint8array" });
            outputFiles.push({
                name: file.name.split(".").slice(0, -1).join(".") + "." + outputFormat.extension,
                bytes: outBytes
            });
        }

        return outputFiles;
    }
}

export default mcModpackHandler;

import { expect, describe, it } from 'bun:test';
import * as csv from '../../src/handlers/csv.js';
import CommonFormats from 'src/CommonFormats.js';

describe('csv', () => {
    describe.each([
        [['a', 'b'], 'a.b'],
        [['a.b'], 'a\\.b'],
        [['contains.dot', 'doesnt'], 'contains\\.dot.doesnt'],
        [['a\\', 'b'], 'a\\\\.b'],
        [['a\\.b'], 'a\\\\\\.b'],
        [[`a\\\\`, 'b'], 'a\\\\\\\\.b'],
        [['a\\\\.b'], 'a\\\\\\\\\\.b'],
        [['a..b'], 'a\\.\\.b'],
        [['', ''], '.'],
        [['.'], '\\.'],
        [['', '.'], '.\\.'],
        [['.', '', '\\'], '\\...\\'],
        [['.', '\\', '.'], '\\..\\\\.\\.'],
        [['', '\\', ''], '.\\\\.'],
        [['in\\the', 'mid\\le', 'yeah'], 'in\\the.mid\\le.yeah'],
        [[''], ''],
        [[], null],
    ])('path %# %j', (expectDecoded, expectEncoded) => {
        const encoded = csv.encodePath(expectDecoded);
        const decoded = csv.decodePath(encoded);
        it('encodes as expected', () => expect(encoded).toBe(expectEncoded));
        it('roundtrips', () => expect(decoded).toStrictEqual(expectDecoded));
    });

    it('throws on cycles', () =>
        expect(() => {
            const cyclicObject: any = { normal: 1 };
            cyclicObject.here = cyclicObject;
            cyclicObject.there = cyclicObject;
            csv.flatten(cyclicObject);
        }).toThrow());

    const handler = new csv.default();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    it.each(samples())('flattens sample %s', async (name, value, flattened, expectedCsv) => {
        // direct conversion
        const actual = csv.flatten(value);
        expect(actual).toStrictEqual(flattened);

        if (expectedCsv === null) return;

        // call handler
        const [output] = await handler.doConvert(
            [
                {
                    name: name + '.json',
                    bytes: encoder.encode(JSON.stringify(value)),
                },
            ],
            CommonFormats.JSON.builder('json').allowFrom(),
            CommonFormats.CSV.builder('csv').allowTo(),
        );

        const actualCsv = decoder.decode(output.bytes);
        expect(actualCsv).toBe(expectedCsv);
        expect(output.name).toBe(name + '.csv')
    });
});
type Sample = [string, unknown, csv.Flat, string | null];
function samples(): Sample[] {
    return [
        [
            'pkg',
            {
                name: 'p2r3-convert',
                productName: 'Convert to it!',
                author: 'PortalRunner',
                description: 'Truly universal browser-based file converter',
                private: true,
                version: '0.0.0',
                type: 'module',
                main: 'src/electron.cjs',
                scripts: {
                    dev: 'vite',
                    build: 'tsc && vite build',
                    'cache:build': 'bun run buildCache.js dist/cache.json --minify',
                    'cache:build:dev': 'bun run buildCache.js dist/cache.json',
                    preview: 'vite preview',
                    docker: 'bun run docker:build && bun run docker:up',
                    'docker:build':
                        'docker compose -f docker/docker-compose.yml -f docker/docker-compose.override.yml build --build-arg VITE_COMMIT_SHA=$(git rev-parse HEAD)',
                    'docker:up':
                        'docker compose -f docker/docker-compose.yml -f docker/docker-compose.override.yml up -d',
                    'desktop:build': 'tsc && IS_DESKTOP=true vite build && bun run cache:build',
                    'desktop:preview': 'electron .',
                    'desktop:start': 'bun run desktop:build && bun run desktop:preview',
                    'desktop:dist:win': 'bun run desktop:build && electron-builder --win --publish never',
                    'desktop:dist:mac': 'bun run desktop:build && electron-builder --mac --publish never',
                    'desktop:dist:linux': 'bun run desktop:build && electron-builder --linux --publish never',
                },
                build: {
                    appId: 'com.p2r3.convert',
                    directories: {
                        output: 'release',
                    },
                    files: ['dist/**/*', 'src/electron.cjs'],
                    win: {
                        target: 'nsis',
                    },
                    mac: {
                        target: 'dmg',
                    },
                    linux: {
                        target: 'AppImage',
                    },
                },
                devDependencies: {
                    '@types/hjson': '^2.4.6',
                    '@types/jszip': '^3.4.0',
                    '@types/msgpack': '^0.0.34',
                    '@types/opentype.js': '^1.3.9',
                    electron: '^40.6.0',
                    'electron-builder': '^26.8.1',
                    puppeteer: '^24.36.0',
                    typescript: '~5.9.3',
                    vite: '^7.2.4',
                    'vite-tsconfig-paths': '^6.0.5',
                },
                dependencies: {
                    '@ably/msgpack-js': '^0.4.1',
                    '@bjorn3/browser_wasi_shim': '^0.4.2',
                    '@bokuweb/zstd-wasm': '^0.0.27',
                    '@ffmpeg/core': '^0.12.10',
                    '@ffmpeg/ffmpeg': '^0.12.15',
                    '@ffmpeg/util': '^0.12.2',
                    '@flo-audio/reflo': '^0.1.2',
                    '@imagemagick/magick-wasm': '^0.0.37',
                    '@shelacek/ubjson': '^1.1.1',
                    '@sqlite.org/sqlite-wasm': '^3.51.2-build6',
                    '@stringsync/vexml': '^0.1.8',
                    '@toon-format/toon': '^2.1.0',
                    '@types/bun': '^1.3.9',
                    '@types/meyda': '^5.3.0',
                    '@types/pako': '^2.0.4',
                    '@types/papaparse': '^5.5.2',
                    '@types/three': '^0.182.0',
                    bson: '^7.2.0',
                    cbor: '^10.0.12',
                    hjson: '^3.2.2',
                    imagetracer: '^0.2.2',
                    'js-synthesizer': '^1.11.0',
                    json6: '^1.0.3',
                    'jsonl-parse-stringify': '^1.0.3',
                    jszip: '^3.10.1',
                    meyda: '^5.6.3',
                    mime: '^4.1.0',
                    nanotar: '^0.3.0',
                    nbtify: '^2.2.0',
                    'opentype.js': '^1.3.4',
                    pako: '^2.1.0',
                    papaparse: '^5.5.3',
                    'pdf-parse': '^2.4.5',
                    'pdftoimg-js': '^0.2.5',
                    'pe-library': '^2.0.1',
                    'svg-pathdata': '^8.0.0',
                    three: '^0.182.0',
                    'three-bvh-csg': '^0.0.17',
                    'three-mesh-bvh': '^0.9.8',
                    'tiny-jsonc': '^1.0.2',
                    'ts-flp': '^1.0.3',
                    verovio: '^6.0.1',
                    vexflow: '^5.0.0',
                    'vite-plugin-static-copy': '^3.1.6',
                    wavefile: '^11.0.0',
                    'woff2-encoder': '^2.0.0',
                    xml2js: '^0.6.2',
                    'xz-decompress': '^0.2.3',
                    yaml: '^2.8.2',
                },
            },
            {
                header: ['key', 'value'],
                data: [
                    ['name', 'p2r3-convert'],
                    ['productName', 'Convert to it!'],
                    ['author', 'PortalRunner'],
                    ['description', 'Truly universal browser-based file converter'],
                    ['private', 'true'],
                    ['version', '0.0.0'],
                    ['type', 'module'],
                    ['main', 'src/electron.cjs'],
                    ['scripts.dev', 'vite'],
                    ['scripts.build', 'tsc && vite build'],
                    ['scripts.cache:build', 'bun run buildCache.js dist/cache.json --minify'],
                    ['scripts.cache:build:dev', 'bun run buildCache.js dist/cache.json'],
                    ['scripts.preview', 'vite preview'],
                    ['scripts.docker', 'bun run docker:build && bun run docker:up'],
                    [
                        'scripts.docker:build',
                        'docker compose -f docker/docker-compose.yml -f docker/docker-compose.override.yml build --build-arg VITE_COMMIT_SHA=$(git rev-parse HEAD)',
                    ],
                    [
                        'scripts.docker:up',
                        'docker compose -f docker/docker-compose.yml -f docker/docker-compose.override.yml up -d',
                    ],
                    ['scripts.desktop:build', 'tsc && IS_DESKTOP=true vite build && bun run cache:build'],
                    ['scripts.desktop:preview', 'electron .'],
                    ['scripts.desktop:start', 'bun run desktop:build && bun run desktop:preview'],
                    ['scripts.desktop:dist:win', 'bun run desktop:build && electron-builder --win --publish never'],
                    ['scripts.desktop:dist:mac', 'bun run desktop:build && electron-builder --mac --publish never'],
                    ['scripts.desktop:dist:linux', 'bun run desktop:build && electron-builder --linux --publish never'],
                    ['build.appId', 'com.p2r3.convert'],
                    ['build.directories.output', 'release'],
                    ['build.files.0', 'dist/**/*'],
                    ['build.files.1', 'src/electron.cjs'],
                    ['build.win.target', 'nsis'],
                    ['build.mac.target', 'dmg'],
                    ['build.linux.target', 'AppImage'],
                    ['devDependencies.@types/hjson', '^2.4.6'],
                    ['devDependencies.@types/jszip', '^3.4.0'],
                    ['devDependencies.@types/msgpack', '^0.0.34'],
                    ['devDependencies.@types/opentype\\.js', '^1.3.9'],
                    ['devDependencies.electron', '^40.6.0'],
                    ['devDependencies.electron-builder', '^26.8.1'],
                    ['devDependencies.puppeteer', '^24.36.0'],
                    ['devDependencies.typescript', '~5.9.3'],
                    ['devDependencies.vite', '^7.2.4'],
                    ['devDependencies.vite-tsconfig-paths', '^6.0.5'],
                    ['dependencies.@ably/msgpack-js', '^0.4.1'],
                    ['dependencies.@bjorn3/browser_wasi_shim', '^0.4.2'],
                    ['dependencies.@bokuweb/zstd-wasm', '^0.0.27'],
                    ['dependencies.@ffmpeg/core', '^0.12.10'],
                    ['dependencies.@ffmpeg/ffmpeg', '^0.12.15'],
                    ['dependencies.@ffmpeg/util', '^0.12.2'],
                    ['dependencies.@flo-audio/reflo', '^0.1.2'],
                    ['dependencies.@imagemagick/magick-wasm', '^0.0.37'],
                    ['dependencies.@shelacek/ubjson', '^1.1.1'],
                    ['dependencies.@sqlite\\.org/sqlite-wasm', '^3.51.2-build6'],
                    ['dependencies.@stringsync/vexml', '^0.1.8'],
                    ['dependencies.@toon-format/toon', '^2.1.0'],
                    ['dependencies.@types/bun', '^1.3.9'],
                    ['dependencies.@types/meyda', '^5.3.0'],
                    ['dependencies.@types/pako', '^2.0.4'],
                    ['dependencies.@types/papaparse', '^5.5.2'],
                    ['dependencies.@types/three', '^0.182.0'],
                    ['dependencies.bson', '^7.2.0'],
                    ['dependencies.cbor', '^10.0.12'],
                    ['dependencies.hjson', '^3.2.2'],
                    ['dependencies.imagetracer', '^0.2.2'],
                    ['dependencies.js-synthesizer', '^1.11.0'],
                    ['dependencies.json6', '^1.0.3'],
                    ['dependencies.jsonl-parse-stringify', '^1.0.3'],
                    ['dependencies.jszip', '^3.10.1'],
                    ['dependencies.meyda', '^5.6.3'],
                    ['dependencies.mime', '^4.1.0'],
                    ['dependencies.nanotar', '^0.3.0'],
                    ['dependencies.nbtify', '^2.2.0'],
                    ['dependencies.opentype\\.js', '^1.3.4'],
                    ['dependencies.pako', '^2.1.0'],
                    ['dependencies.papaparse', '^5.5.3'],
                    ['dependencies.pdf-parse', '^2.4.5'],
                    ['dependencies.pdftoimg-js', '^0.2.5'],
                    ['dependencies.pe-library', '^2.0.1'],
                    ['dependencies.svg-pathdata', '^8.0.0'],
                    ['dependencies.three', '^0.182.0'],
                    ['dependencies.three-bvh-csg', '^0.0.17'],
                    ['dependencies.three-mesh-bvh', '^0.9.8'],
                    ['dependencies.tiny-jsonc', '^1.0.2'],
                    ['dependencies.ts-flp', '^1.0.3'],
                    ['dependencies.verovio', '^6.0.1'],
                    ['dependencies.vexflow', '^5.0.0'],
                    ['dependencies.vite-plugin-static-copy', '^3.1.6'],
                    ['dependencies.wavefile', '^11.0.0'],
                    ['dependencies.woff2-encoder', '^2.0.0'],
                    ['dependencies.xml2js', '^0.6.2'],
                    ['dependencies.xz-decompress', '^0.2.3'],
                    ['dependencies.yaml', '^2.8.2'],
                ],
            },
            `key,value
name,p2r3-convert
productName,Convert to it!
author,PortalRunner
description,Truly universal browser-based file converter
private,true
version,0.0.0
type,module
main,src/electron.cjs
scripts.dev,vite
scripts.build,tsc && vite build
scripts.cache:build,bun run buildCache.js dist/cache.json --minify
scripts.cache:build:dev,bun run buildCache.js dist/cache.json
scripts.preview,vite preview
scripts.docker,bun run docker:build && bun run docker:up
scripts.docker:build,docker compose -f docker/docker-compose.yml -f docker/docker-compose.override.yml build --build-arg VITE_COMMIT_SHA=$(git rev-parse HEAD)
scripts.docker:up,docker compose -f docker/docker-compose.yml -f docker/docker-compose.override.yml up -d
scripts.desktop:build,tsc && IS_DESKTOP=true vite build && bun run cache:build
scripts.desktop:preview,electron .
scripts.desktop:start,bun run desktop:build && bun run desktop:preview
scripts.desktop:dist:win,bun run desktop:build && electron-builder --win --publish never
scripts.desktop:dist:mac,bun run desktop:build && electron-builder --mac --publish never
scripts.desktop:dist:linux,bun run desktop:build && electron-builder --linux --publish never
build.appId,com.p2r3.convert
build.directories.output,release
build.files.0,dist/**/*
build.files.1,src/electron.cjs
build.win.target,nsis
build.mac.target,dmg
build.linux.target,AppImage
devDependencies.@types/hjson,^2.4.6
devDependencies.@types/jszip,^3.4.0
devDependencies.@types/msgpack,^0.0.34
devDependencies.@types/opentype\\.js,^1.3.9
devDependencies.electron,^40.6.0
devDependencies.electron-builder,^26.8.1
devDependencies.puppeteer,^24.36.0
devDependencies.typescript,~5.9.3
devDependencies.vite,^7.2.4
devDependencies.vite-tsconfig-paths,^6.0.5
dependencies.@ably/msgpack-js,^0.4.1
dependencies.@bjorn3/browser_wasi_shim,^0.4.2
dependencies.@bokuweb/zstd-wasm,^0.0.27
dependencies.@ffmpeg/core,^0.12.10
dependencies.@ffmpeg/ffmpeg,^0.12.15
dependencies.@ffmpeg/util,^0.12.2
dependencies.@flo-audio/reflo,^0.1.2
dependencies.@imagemagick/magick-wasm,^0.0.37
dependencies.@shelacek/ubjson,^1.1.1
dependencies.@sqlite\\.org/sqlite-wasm,^3.51.2-build6
dependencies.@stringsync/vexml,^0.1.8
dependencies.@toon-format/toon,^2.1.0
dependencies.@types/bun,^1.3.9
dependencies.@types/meyda,^5.3.0
dependencies.@types/pako,^2.0.4
dependencies.@types/papaparse,^5.5.2
dependencies.@types/three,^0.182.0
dependencies.bson,^7.2.0
dependencies.cbor,^10.0.12
dependencies.hjson,^3.2.2
dependencies.imagetracer,^0.2.2
dependencies.js-synthesizer,^1.11.0
dependencies.json6,^1.0.3
dependencies.jsonl-parse-stringify,^1.0.3
dependencies.jszip,^3.10.1
dependencies.meyda,^5.6.3
dependencies.mime,^4.1.0
dependencies.nanotar,^0.3.0
dependencies.nbtify,^2.2.0
dependencies.opentype\\.js,^1.3.4
dependencies.pako,^2.1.0
dependencies.papaparse,^5.5.3
dependencies.pdf-parse,^2.4.5
dependencies.pdftoimg-js,^0.2.5
dependencies.pe-library,^2.0.1
dependencies.svg-pathdata,^8.0.0
dependencies.three,^0.182.0
dependencies.three-bvh-csg,^0.0.17
dependencies.three-mesh-bvh,^0.9.8
dependencies.tiny-jsonc,^1.0.2
dependencies.ts-flp,^1.0.3
dependencies.verovio,^6.0.1
dependencies.vexflow,^5.0.0
dependencies.vite-plugin-static-copy,^3.1.6
dependencies.wavefile,^11.0.0
dependencies.woff2-encoder,^2.0.0
dependencies.xml2js,^0.6.2
dependencies.xz-decompress,^0.2.3
dependencies.yaml,^2.8.2`,
        ],
        [
            'pkglock',
            {
                name: 'laravel',
                lockfileVersion: 3,
                requires: true,
                packages: {
                    '': {
                        dependencies: {
                            '@tailwindcss/vite': '^4.1.18',
                            tailwindcss: '^4.1.18',
                        },
                    },
                    'node_modules/@esbuild/aix-ppc64': {
                        version: '0.27.2',
                        resolved: 'https://registry.npmjs.org/@esbuild/aix-ppc64/-/aix-ppc64-0.27.2.tgz',
                        integrity:
                            'sha512-GZMB+a0mOMZs4MpDbj8RJp4cw+w1WV5NYD6xzgvzUJ5Ek2jerwfO2eADyI6ExDSUED+1X8aMbegahsJi+8mgpw==',
                        cpu: ['ppc64'],
                        license: 'MIT',
                        optional: true,
                        os: ['aix'],
                        peer: true,
                        engines: {
                            node: '>=18',
                        },
                    },
                    'node_modules/@esbuild/android-arm': {
                        version: '0.27.2',
                        resolved: 'https://registry.npmjs.org/@esbuild/android-arm/-/android-arm-0.27.2.tgz',
                        integrity:
                            'sha512-DVNI8jlPa7Ujbr1yjU2PfUSRtAUZPG9I1RwW4F4xFB1Imiu2on0ADiI/c3td+KmDtVKNbi+nffGDQMfcIMkwIA==',
                        cpu: ['arm'],
                        license: 'MIT',
                        optional: true,
                        os: ['android'],
                        peer: true,
                        engines: {
                            node: '>=18',
                        },
                    },
                    'node_modules/@esbuild/android-arm64': {
                        version: '0.27.2',
                        resolved: 'https://registry.npmjs.org/@esbuild/android-arm64/-/android-arm64-0.27.2.tgz',
                        integrity:
                            'sha512-pvz8ZZ7ot/RBphf8fv60ljmaoydPU12VuXHImtAs0XhLLw+EXBi2BLe3OYSBslR4rryHvweW5gmkKFwTiFy6KA==',
                        cpu: ['arm64'],
                        license: 'MIT',
                        optional: true,
                        os: ['android'],
                        peer: true,
                        engines: {
                            node: '>=18',
                        },
                    },
                    'node_modules/@esbuild/android-x64': {
                        version: '0.27.2',
                        resolved: 'https://registry.npmjs.org/@esbuild/android-x64/-/android-x64-0.27.2.tgz',
                        integrity:
                            'sha512-z8Ank4Byh4TJJOh4wpz8g2vDy75zFL0TlZlkUkEwYXuPSgX8yzep596n6mT7905kA9uHZsf/o2OJZubl2l3M7A==',
                        cpu: ['x64'],
                        license: 'MIT',
                        optional: true,
                        os: ['android'],
                        peer: true,
                        engines: {
                            node: '>=18',
                        },
                    },
                },
            },
            {
                header: [
                    'key',
                    'name',
                    'lockfileVersion',
                    'requires',
                    'dependencies.@tailwindcss/vite',
                    'dependencies.tailwindcss',
                    'version',
                    'resolved',
                    'integrity',
                    'cpu.0',
                    'license',
                    'optional',
                    'os.0',
                    'peer',
                    'engines.node',
                ],
                data: [
                    ['', 'laravel', '3', 'true', '', '', '', '', '', '', '', '', '', '', ''],
                    ['packages.', '', '', '', '^4.1.18', '^4.1.18', '', '', '', '', '', '', '', '', ''],
                    [
                        'packages.node_modules/@esbuild/aix-ppc64',
                        '',
                        '',
                        '',
                        '',
                        '',
                        '0.27.2',
                        'https://registry.npmjs.org/@esbuild/aix-ppc64/-/aix-ppc64-0.27.2.tgz',
                        'sha512-GZMB+a0mOMZs4MpDbj8RJp4cw+w1WV5NYD6xzgvzUJ5Ek2jerwfO2eADyI6ExDSUED+1X8aMbegahsJi+8mgpw==',
                        'ppc64',
                        'MIT',
                        'true',
                        'aix',
                        'true',
                        '>=18',
                    ],
                    [
                        'packages.node_modules/@esbuild/android-arm',
                        '',
                        '',
                        '',
                        '',
                        '',
                        '0.27.2',
                        'https://registry.npmjs.org/@esbuild/android-arm/-/android-arm-0.27.2.tgz',
                        'sha512-DVNI8jlPa7Ujbr1yjU2PfUSRtAUZPG9I1RwW4F4xFB1Imiu2on0ADiI/c3td+KmDtVKNbi+nffGDQMfcIMkwIA==',
                        'arm',
                        'MIT',
                        'true',
                        'android',
                        'true',
                        '>=18',
                    ],
                    [
                        'packages.node_modules/@esbuild/android-arm64',
                        '',
                        '',
                        '',
                        '',
                        '',
                        '0.27.2',
                        'https://registry.npmjs.org/@esbuild/android-arm64/-/android-arm64-0.27.2.tgz',
                        'sha512-pvz8ZZ7ot/RBphf8fv60ljmaoydPU12VuXHImtAs0XhLLw+EXBi2BLe3OYSBslR4rryHvweW5gmkKFwTiFy6KA==',
                        'arm64',
                        'MIT',
                        'true',
                        'android',
                        'true',
                        '>=18',
                    ],
                    [
                        'packages.node_modules/@esbuild/android-x64',
                        '',
                        '',
                        '',
                        '',
                        '',
                        '0.27.2',
                        'https://registry.npmjs.org/@esbuild/android-x64/-/android-x64-0.27.2.tgz',
                        'sha512-z8Ank4Byh4TJJOh4wpz8g2vDy75zFL0TlZlkUkEwYXuPSgX8yzep596n6mT7905kA9uHZsf/o2OJZubl2l3M7A==',
                        'x64',
                        'MIT',
                        'true',
                        'android',
                        'true',
                        '>=18',
                    ],
                ],
            },
            `key,name,lockfileVersion,requires,dependencies.@tailwindcss/vite,dependencies.tailwindcss,version,resolved,integrity,cpu.0,license,optional,os.0,peer,engines.node
,laravel,3,true,,,,,,,,,,,
packages.,,,,^4.1.18,^4.1.18,,,,,,,,,
packages.node_modules/@esbuild/aix-ppc64,,,,,,0.27.2,https://registry.npmjs.org/@esbuild/aix-ppc64/-/aix-ppc64-0.27.2.tgz,sha512-GZMB+a0mOMZs4MpDbj8RJp4cw+w1WV5NYD6xzgvzUJ5Ek2jerwfO2eADyI6ExDSUED+1X8aMbegahsJi+8mgpw==,ppc64,MIT,true,aix,true,>=18
packages.node_modules/@esbuild/android-arm,,,,,,0.27.2,https://registry.npmjs.org/@esbuild/android-arm/-/android-arm-0.27.2.tgz,sha512-DVNI8jlPa7Ujbr1yjU2PfUSRtAUZPG9I1RwW4F4xFB1Imiu2on0ADiI/c3td+KmDtVKNbi+nffGDQMfcIMkwIA==,arm,MIT,true,android,true,>=18
packages.node_modules/@esbuild/android-arm64,,,,,,0.27.2,https://registry.npmjs.org/@esbuild/android-arm64/-/android-arm64-0.27.2.tgz,sha512-pvz8ZZ7ot/RBphf8fv60ljmaoydPU12VuXHImtAs0XhLLw+EXBi2BLe3OYSBslR4rryHvweW5gmkKFwTiFy6KA==,arm64,MIT,true,android,true,>=18
packages.node_modules/@esbuild/android-x64,,,,,,0.27.2,https://registry.npmjs.org/@esbuild/android-x64/-/android-x64-0.27.2.tgz,sha512-z8Ank4Byh4TJJOh4wpz8g2vDy75zFL0TlZlkUkEwYXuPSgX8yzep596n6mT7905kA9uHZsf/o2OJZubl2l3M7A==,x64,MIT,true,android,true,>=18`,
        ],
        [
            '{}',
            {},
            {
                header: ['value'],
                data: [['{}']],
            },
            `value
{}`,
        ],
        [
            '[]',
            [],
            {
                header: ['value'],
                data: [['[]']],
            },
            `value
[]`,
        ],
        [
            '1',
            undefined,
            {
                header: ['value'],
                data: [['']],
            },
            null,
        ],
        [
            '2',
            '',
            {
                header: ['value'],
                data: [['']],
            },
            `value
`,
        ],
        [
            '3',
            'hello world',
            {
                header: ['value'],
                data: [['hello world']],
            },
            `value
hello world`,
        ],
        [
            '4',
            { a: 1, b: 2 },
            {
                header: ['key', 'value'],
                data: [
                    ['a', '1'],
                    ['b', '2'],
                ],
            },
            `key,value
a,1
b,2`,
        ],
        [
            '4.1',
            [{ a: 1, b: 2 }],
            {
                header: ['key', 'value'],
                data: [
                    ['0.a', '1'],
                    ['0.b', '2'],
                ],
            },
            `key,value
0.a,1
0.b,2`,
        ],
        [
            '4.2',
            [
                { a: 1, b: 2 },
                { a: 1, b: 2 },
            ],
            {
                header: ['key', 'a', 'b'],
                data: [
                    ['0', '1', '2'],
                    ['1', '1', '2'],
                ],
            },
            `key,a,b
0,1,2
1,1,2`,
        ],
        [
            '5',
            { a: { x: 1 }, b: { x: 2 }, c: 1 },
            {
                header: ['key', 'value'],
                data: [
                    ['a.x', '1'],
                    ['b.x', '2'],
                    ['c', '1'],
                ],
            },
            `key,value
a.x,1
b.x,2
c,1`,
        ],
        [
            '6',
            { a: [{}], b: [[]], c: [[{}]] },
            {
                header: ['key', '0'],
                data: [
                    ['a', '{}'],
                    ['b', '[]'],
                    ['c.0', '{}'],
                ],
            },
            `key,0
a,{}
b,[]
c.0,{}`,
        ],
        [
            '7',
            {
                C: { A: { x: { a: 1, b: 2 } } },
                B: { x: { a: 1, b: 2 } },
            },
            {
                header: ['key', 'a', 'b'],
                data: [
                    ['C.A.x', '1', '2'],
                    ['B.x', '1', '2'],
                ],
            },
            `key,a,b
C.A.x,1,2
B.x,1,2`,
        ],
        [
            '8',
            [
                { a: 'A', b: 'B' },
                { a: 'A', b: 'B', c: {} },
                { a: 'A', b: 'B', c: [] },
                { a: 'A', b: 'B', c: 'C' },
            ],
            {
                header: ['key', 'a', 'b', 'c'],
                data: [
                    ['0', 'A', 'B', ''],
                    ['1', 'A', 'B', '{}'],
                    ['2', 'A', 'B', '[]'],
                    ['3', 'A', 'B', 'C'],
                ],
            },
            `key,a,b,c
0,A,B,
1,A,B,{}
2,A,B,[]
3,A,B,C`,
        ],
        [
            '9',
            {
                a: 1,
                b: {
                    a: 2,
                    c: 3,
                    b: {
                        c: 4,
                    },
                },
            },
            {
                header: ['key', 'value'],
                data: [
                    ['a', '1'],
                    ['b.a', '2'],
                    ['b.c', '3'],
                    ['b.b.c', '4'],
                ],
            },
            `key,value
a,1
b.a,2
b.c,3
b.b.c,4`,
        ],
        [
            '10',
            {
                a: {
                    p: {
                        q1: 1,
                    },
                    r: {
                        q2: 2,
                    },
                },
                b: {
                    c: {
                        s1: 3,
                        s2: 4,
                    },
                    d: {
                        s1: 5,
                        s2: 6,
                    },
                },
            },
            {
                header: ['key', 'value'],
                data: [
                    ['a.p.q1', '1'],
                    ['a.r.q2', '2'],
                    ['b.c.s1', '3'],
                    ['b.c.s2', '4'],
                    ['b.d.s1', '5'],
                    ['b.d.s2', '6'],
                ],
            },
            `key,value
a.p.q1,1
a.r.q2,2
b.c.s1,3
b.c.s2,4
b.d.s1,5
b.d.s2,6`,
        ],
        [
            '11',
            {
                emp_001: {
                    profile: {
                        name: 'Alice Wong',
                        department: 'Engineering',
                        level: 4,
                    },
                    location: {
                        office: 'NYC',
                        desk: '5A-12',
                    },
                    compensation: {
                        salary: 145000,
                        bonusPct: 0.12,
                    },
                    status: 'active',
                },
                emp_002: {
                    profile: {
                        name: 'Bruno Silva',
                        department: 'Engineering',
                        level: 3,
                    },
                    location: {
                        office: 'NYC',
                        desk: '5A-18',
                    },
                    compensation: {
                        salary: 118000,
                        bonusPct: 0.08,
                    },
                    status: 'leave',
                },
                emp_003: {
                    profile: {
                        name: 'Carla Mendes',
                        department: 'Design',
                        level: 3,
                    },
                    location: {
                        office: 'Remote',
                        timezone: 'UTC-3',
                    },
                    compensation: {
                        salary: 99000,
                        bonusPct: 0.07,
                    },
                    status: 'active',
                },
                emp_004: {
                    profile: {
                        name: 'Dae Kim',
                        department: 'Engineering',
                        level: 5,
                    },
                    location: {
                        office: 'SF',
                        desk: '2C-04',
                    },
                    compensation: {
                        salary: 172000,
                        bonusPct: 0.15,
                        stockGrant: 40000,
                    },
                    status: 'active',
                },
                emp_005: {
                    profile: {
                        name: 'Elena Rossi',
                        department: 'Finance',
                        level: 2,
                    },
                    location: {
                        office: 'London',
                        desk: '1F-03',
                    },
                    compensation: {
                        salary: 87000,
                        bonusPct: 0.05,
                    },
                    status: 'contractor',
                    manager: {
                        id: 'emp_010',
                        name: 'Victor Hale',
                    },
                },
            },
            {
                header: [
                    'key',
                    'profile.name',
                    'profile.department',
                    'profile.level',
                    'location.office',
                    'location.desk',
                    'compensation.salary',
                    'compensation.bonusPct',
                    'status',
                    'location.timezone',
                    'compensation.stockGrant',
                    'manager.id',
                    'manager.name',
                ],
                data: [
                    [
                        'emp_001',
                        'Alice Wong',
                        'Engineering',
                        '4',
                        'NYC',
                        '5A-12',
                        '145000',
                        '0.12',
                        'active',
                        '',
                        '',
                        '',
                        '',
                    ],
                    [
                        'emp_002',
                        'Bruno Silva',
                        'Engineering',
                        '3',
                        'NYC',
                        '5A-18',
                        '118000',
                        '0.08',
                        'leave',
                        '',
                        '',
                        '',
                        '',
                    ],
                    [
                        'emp_003',
                        'Carla Mendes',
                        'Design',
                        '3',
                        'Remote',
                        '',
                        '99000',
                        '0.07',
                        'active',
                        'UTC-3',
                        '',
                        '',
                        '',
                    ],
                    [
                        'emp_004',
                        'Dae Kim',
                        'Engineering',
                        '5',
                        'SF',
                        '2C-04',
                        '172000',
                        '0.15',
                        'active',
                        '',
                        '40000',
                        '',
                        '',
                    ],
                    [
                        'emp_005',
                        'Elena Rossi',
                        'Finance',
                        '2',
                        'London',
                        '1F-03',
                        '87000',
                        '0.05',
                        'contractor',
                        '',
                        '',
                        'emp_010',
                        'Victor Hale',
                    ],
                ],
            },
            `key,profile.name,profile.department,profile.level,location.office,location.desk,compensation.salary,compensation.bonusPct,status,location.timezone,compensation.stockGrant,manager.id,manager.name
emp_001,Alice Wong,Engineering,4,NYC,5A-12,145000,0.12,active,,,,
emp_002,Bruno Silva,Engineering,3,NYC,5A-18,118000,0.08,leave,,,,
emp_003,Carla Mendes,Design,3,Remote,,99000,0.07,active,UTC-3,,,
emp_004,Dae Kim,Engineering,5,SF,2C-04,172000,0.15,active,,40000,,
emp_005,Elena Rossi,Finance,2,London,1F-03,87000,0.05,contractor,,,emp_010,Victor Hale`,
        ],
        [
            '12',
            {
                order_1001: {
                    customer: {
                        name: 'Iris Market',
                        tier: 'gold',
                    },
                    shipping: {
                        city: 'Berlin',
                        country: 'DE',
                    },
                    totals: {
                        subtotal: 120.5,
                        tax: 22.9,
                        grand: 143.4,
                    },
                    state: 'paid',
                },
                order_1002: {
                    customer: {
                        name: 'Northwind Labs',
                        tier: 'silver',
                    },
                    shipping: {
                        city: 'Paris',
                        country: 'FR',
                    },
                    totals: {
                        subtotal: 80,
                        tax: 16,
                        grand: 96,
                    },
                    state: 'paid',
                },
                order_1003: {
                    customer: {
                        name: 'Sun Harbor',
                        tier: 'gold',
                    },
                    pickup: {
                        store: 'AMS-04',
                        window: '10:00-12:00',
                    },
                    totals: {
                        subtotal: 48,
                        tax: 0,
                        grand: 48,
                    },
                    state: 'pickup',
                },
            },
            {
                header: [
                    'key',
                    'customer.name',
                    'customer.tier',
                    'shipping.city',
                    'shipping.country',
                    'totals.subtotal',
                    'totals.tax',
                    'totals.grand',
                    'state',
                    'pickup.store',
                    'pickup.window',
                ],
                data: [
                    ['order_1001', 'Iris Market', 'gold', 'Berlin', 'DE', '120.5', '22.9', '143.4', 'paid', '', ''],
                    ['order_1002', 'Northwind Labs', 'silver', 'Paris', 'FR', '80', '16', '96', 'paid', '', ''],
                    ['order_1003', 'Sun Harbor', 'gold', '', '', '48', '0', '48', 'pickup', 'AMS-04', '10:00-12:00'],
                ],
            },
            `key,customer.name,customer.tier,shipping.city,shipping.country,totals.subtotal,totals.tax,totals.grand,state,pickup.store,pickup.window
order_1001,Iris Market,gold,Berlin,DE,120.5,22.9,143.4,paid,,
order_1002,Northwind Labs,silver,Paris,FR,80,16,96,paid,,
order_1003,Sun Harbor,gold,,,48,0,48,pickup,AMS-04,10:00-12:00`,
        ],
        [
            '13',
            {
                emp_001: {
                    profile: {
                        name: 'Elena Rossi',
                        department: 'Finance',
                        level: 2,
                    },
                    location: {
                        office: 'Remote',
                        timezone: 'UTC-3',
                    },
                },
                emp_002: {
                    profile: {
                        name: 'Dae Kim',
                        department: 'Engineering',
                        level: 5,
                    },
                    location: {
                        office: 'NYC',
                        desk: '5A-12',
                    },
                },
                emp_003: { audit: { createdAt: '...', updatedAt: '...' } },
                emp_004: { audit: { createdAt: '...', updatedAt: '...' } },
                emp_005: { audit: { createdAt: '...', updatedAt: '...' } },
                emp_006: { audit: { createdAt: '...', updatedAt: '...' } },
                emp_007: { audit: { createdAt: '...', updatedAt: '...' } },
            },
            {
                header: [
                    'key',
                    'profile.name',
                    'profile.department',
                    'profile.level',
                    'location.office',
                    'location.timezone',
                    'location.desk',
                    'audit.createdAt',
                    'audit.updatedAt',
                ],
                data: [
                    ['emp_001', 'Elena Rossi', 'Finance', '2', 'Remote', 'UTC-3', '', '', ''],
                    ['emp_002', 'Dae Kim', 'Engineering', '5', 'NYC', '', '5A-12', '', ''],
                    ['emp_003', '', '', '', '', '', '', '...', '...'],
                    ['emp_004', '', '', '', '', '', '', '...', '...'],
                    ['emp_005', '', '', '', '', '', '', '...', '...'],
                    ['emp_006', '', '', '', '', '', '', '...', '...'],
                    ['emp_007', '', '', '', '', '', '', '...', '...'],
                ],
            },
            `key,profile.name,profile.department,profile.level,location.office,location.timezone,location.desk,audit.createdAt,audit.updatedAt
emp_001,Elena Rossi,Finance,2,Remote,UTC-3,,,
emp_002,Dae Kim,Engineering,5,NYC,,5A-12,,
emp_003,,,,,,,...,...
emp_004,,,,,,,...,...
emp_005,,,,,,,...,...
emp_006,,,,,,,...,...
emp_007,,,,,,,...,...`,
        ],
        [
            'tie1',
            {
                a: { p: { q: 1 }, r: { q: 1 } },
                b: { s: { q: 1 } },
            },
            {
                header: ['key', 'q'],
                data: [
                    ['a.p', '1'],
                    ['a.r', '1'],
                    ['b.s', '1'],
                ],
            },
            `key,q
a.p,1
a.r,1
b.s,1`,
        ],
        [
            'tie2',
            {
                a: { p: { q: 1 }, r: { q: 1 } },
                b: { s: { t: 1 }, u: { t: 1 } },
            },
            {
                header: ['key', 'value'],
                data: [
                    ['a.p.q', '1'],
                    ['a.r.q', '1'],
                    ['b.s.t', '1'],
                    ['b.u.t', '1'],
                ],
            },
            `key,value
a.p.q,1
a.r.q,1
b.s.t,1
b.u.t,1`,
        ],
        [
            't',
            { A: { B: { a: 1, b: 1 }, C: { a: 1, b: 1 } }, a: 1, b: 1 },
            {
                header: ['key', 'a', 'b'],
                data: [
                    ['A.B', '1', '1'],
                    ['A.C', '1', '1'],
                    ['', '1', '1'],
                ],
            },
            `key,a,b
A.B,1,1
A.C,1,1
,1,1`,
        ],
        [
            'empty path',
            {
                a: 1,
                '': { a: 1 },
            },
            {
                header: ['key', 'a'],
                data: [
                    ['', '1'],
                    ['', '1'],
                ],
            },
            `key,a
,1
,1`,
        ],
        [
            'csv escaping comma',
            {
                plain: 'alpha',
                comma: 'hello,world',
                nested: {
                    value: 'a,b',
                },
            },
            {
                header: ['key', 'value'],
                data: [
                    ['plain', 'alpha'],
                    ['comma', 'hello,world'],
                    ['nested.value', 'a,b'],
                ],
            },
            `key,value
plain,alpha
comma,"hello,world"
nested.value,"a,b"`,
        ],
        [
            'csv escaping quotes',
            {
                quote: 'say "hi"',
                both: 'x, "y"',
            },
            {
                header: ['key', 'value'],
                data: [
                    ['quote', 'say "hi"'],
                    ['both', 'x, "y"'],
                ],
            },
            `key,value
quote,"say ""hi"""
both,"x, ""y"""`,
        ],
    ];
}

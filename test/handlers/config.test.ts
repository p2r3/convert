import { expect, test } from 'bun:test';
import CommonFormats from '../../src/CommonFormats.js';
import { FormatDefinition } from '../../src/FormatHandler.js';
import configHandler from '../../src/handlers/config.ts';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const json5Format = new FormatDefinition(
    'JSON5',
    'json5',
    'json5',
    'application/json5',
    'data'
).supported('json5', true, true, true);

test('config handler parses JSON5 input and writes JSON output', async () => {
    const handler = new configHandler();
    const [output] = await handler.doConvert(
        [
            {
                name: 'config.json5',
                bytes: encoder.encode(`{
        // comment
        unquoted: 'value',
        trailing: [1, 2,],
      }`),
            },
        ],
        json5Format,
        CommonFormats.JSON.supported('json', true, true, true)
    );

    expect(output.name).toBe('config.json');
    expect(JSON.parse(decoder.decode(output.bytes))).toEqual({
        unquoted: 'value',
        trailing: [1, 2],
    });
});

test('config handler writes JSON5 output that round-trips through the parser', async () => {
    const handler = new configHandler();
    const [output] = await handler.doConvert(
        [
            {
                name: 'config.json',
                bytes: encoder.encode(
                    JSON.stringify({
                        enabled: true,
                        nested: { value: 3 },
                    })
                ),
            },
        ],
        CommonFormats.JSON.supported('json', true, true, true),
        json5Format
    );

    expect(output.name).toBe('config.json5');
    const outputText = decoder.decode(output.bytes);
    expect(outputText).toContain('enabled:true');
    expect(outputText).toContain('nested:');

    const reparsed = await handler.doConvert(
        [{ name: output.name, bytes: output.bytes }],
        json5Format,
        CommonFormats.JSON.supported('json', true, true, true)
    );

    expect(JSON.parse(decoder.decode(reparsed[0].bytes))).toEqual({
        enabled: true,
        nested: { value: 3 },
    });
});

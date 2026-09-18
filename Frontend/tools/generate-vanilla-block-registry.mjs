import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const [inputArgument, outputArgument] = process.argv.slice(2);
if (!inputArgument || !outputArgument) throw new Error('Usage: node tools/generate-vanilla-block-registry.mjs <reports/blocks.json> <output.json>');

const input = resolve(inputArgument);
const output = resolve(outputArgument);
const report = JSON.parse(await readFile(input, 'utf8'));
const blocks = Object.entries(report).sort(([left], [right]) => left.localeCompare(right)).map(([id, value]) => {
  if (!value || typeof value !== 'object' || !Array.isArray(value.states)) throw new Error(`Malformed block report entry: ${id}`);
  const defaults = value.states.filter((state) => state?.default === true);
  if (defaults.length !== 1) throw new Error(`${id} must have exactly one default state; found ${defaults.length}`);
  const properties = Object.entries(value.properties ?? {}).sort(([left], [right]) => left.localeCompare(right)).map(([name, values]) => {
    if (!Array.isArray(values) || !values.length || values.some((option) => typeof option !== 'string')) throw new Error(`Invalid property ${id}.${name}`);
    return { name, values };
  });
  const defaultState = defaults[0].properties ?? {};
  for (const property of properties) {
    if (typeof defaultState[property.name] !== 'string' || !property.values.includes(defaultState[property.name])) throw new Error(`Invalid default value for ${id}.${property.name}`);
  }
  return { id, properties, defaultState };
});

const normalized = { schemaVersion: 1, minecraftVersion: '1.21.1', source: 'Minecraft data generator reports/blocks.json', blocks };
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(normalized)}\n`, 'utf8');
console.log(`Wrote ${blocks.length} authoritative block entries to ${output}`);

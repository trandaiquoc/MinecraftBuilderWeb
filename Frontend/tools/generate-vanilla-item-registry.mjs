import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const [inputArgument, outputArgument] = process.argv.slice(2);
if (!inputArgument || !outputArgument) throw new Error('Usage: node tools/generate-vanilla-item-registry.mjs <reports/items.json> <output.json>');

const report = JSON.parse(await readFile(resolve(inputArgument), 'utf8'));
if (!report || typeof report !== 'object' || Array.isArray(report)) throw new Error('Malformed item report');
const items = Object.entries(report).sort(([left], [right]) => left.localeCompare(right)).map(([id, value]) => {
  if (!/^minecraft:[a-z0-9_./-]+$/.test(id)) throw new Error(`Invalid item ID: ${id}`);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Malformed item report entry: ${id}`);
  const components = value.components;
  return { id, ...(components && typeof components === 'object' ? { defaultComponents: components } : {}) };
});
const normalized = { schemaVersion: 1, minecraftVersion: '1.21.1', source: 'Minecraft data generator reports/items.json', items };
const output = resolve(outputArgument);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(normalized)}\n`, 'utf8');
console.log(`Wrote ${items.length} authoritative item entries to ${output}`);

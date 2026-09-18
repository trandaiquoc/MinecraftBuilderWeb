/* Development-only: creates a gitignored browser bundle from a user-owned Minecraft JAR. */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const [jarPath, output = 'public/local-assets/vanilla/1.21.1'] = process.argv.slice(2);
if (!jarPath || !existsSync(jarPath)) throw new Error('Usage: node tools/build-local-vanilla-bundle.mjs <minecraft-1.21.1.jar> [output-directory]');
const temp = '.minecraft-assets/vanilla-bundle-tmp';
rmSync(temp, { recursive: true, force: true }); mkdirSync(temp, { recursive: true });
const extract = spawnSync('tar', ['-xf', jarPath, '-C', temp], { stdio: 'inherit' });
if (extract.status !== 0) throw new Error('Unable to extract Minecraft resources with tar');
const files = walk(temp).filter((path) => /^(assets\/[^/]+\/(?:blockstates\/.*\.json|models\/.*\.json|textures\/.*\.png|lang\/en_us\.json)|data\/[^/]+\/tags\/block\/.*\.json)$/.test(path));
const json = {}; const binaryBase64 = [];
for (const path of files) {
  const data = readFileSync(join(temp, path));
  if (path.endsWith('.json')) json[path] = JSON.parse(data.toString('utf8'));
  else binaryBase64.push({ path, data: data.toString('base64') });
}
const manifest = { id: 'vanilla-1.21.1-local', type: 'vanilla', version: '1.21.1', namespaces: ['minecraft'], manifest: { format: 'minecraft-builder-asset-bundle', version: 1 }, schemaVersion: 2, minecraftVersion: '1.21.1', sourceName: 'local Minecraft 1.21.1 bundle', json, binaryBase64 };
mkdirSync(output, { recursive: true }); writeFileSync(join(output, 'asset-bundle.json'), JSON.stringify(manifest));
rmSync(temp, { recursive: true, force: true });
console.log(`Wrote ${files.length} normalized resources to ${join(output, 'asset-bundle.json')}`);
function walk(directory) { return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(join(directory, entry.name)) : [relative(temp, join(directory, entry.name)).replaceAll('\\', '/')]); }

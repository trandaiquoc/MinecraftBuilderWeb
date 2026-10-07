import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [rootArgument, version = '26.3'] = process.argv.slice(2);
if (!rootArgument) throw new Error('Usage: node tools/audit-vanilla-assets.mjs <extracted-client-root> [minecraft-version]');
const root = resolve(rootArgument);
if (!existsSync(join(root, 'assets'))) throw new Error(`Extracted client root has no assets directory: ${root}`);

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(frontendRoot, '..');
const artifactRoot = resolve(repoRoot, '.artifacts/vanilla-asset-coverage');
const tempRoot = resolve(repoRoot, '.artifacts/vanilla-asset-audit');
const testPath = resolve(tempRoot, '.tmp-vanilla-audit.spec.ts');
mkdirSync(artifactRoot, { recursive: true });
mkdirSync(tempRoot, { recursive: true });
const literalRoot = JSON.stringify(root.replaceAll('\\', '/'));
const literalVersion = JSON.stringify(version);
const reportJsonPath = JSON.stringify(resolve(artifactRoot, `vanilla-asset-coverage-${version}.json`).replaceAll('\\', '/'));
const reportMarkdownPath = JSON.stringify(resolve(artifactRoot, `vanilla-asset-coverage-${version}.md`).replaceAll('\\', '/'));
const providerModule = moduleSpecifier(dirname(testPath), resolve(frontendRoot, 'src/app/core/assets/vanilla/vanilla-asset-provider'));
const auditModule = moduleSpecifier(dirname(testPath), resolve(frontendRoot, 'src/app/core/assets/vanilla/vanilla-asset-audit'));
try {
  writeFileSync(testPath, `
import { describe, it } from 'vitest';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { VanillaAssetProvider } from '${providerModule}';
import { auditVanillaAssets, coverageReportMarkdown } from '${auditModule}';
describe('vanilla coverage command', () => it('writes the report', async () => {
  const root = ${literalRoot}; const version = ${literalVersion};
  const json = {}; const binary = new Map();
  const visit = (directory) => { for (const entry of readdirSync(directory, { withFileTypes: true })) { const full = join(directory, entry.name); if (entry.isDirectory()) { visit(full); continue; } const path = relative(root, full).replaceAll('\\\\', '/'); if (!path.startsWith('assets/')) continue; if (path.endsWith('.json')) json[path] = JSON.parse(readFileSync(full, 'utf8')); else if (path.endsWith('.png')) binary.set(path, new Uint8Array(readFileSync(full))); } };
  visit(root); Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => 'blob:audit' }); Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => undefined });
  const report = await auditVanillaAssets(new VanillaAssetProvider('Mojang official Java ' + version + ' client.jar', version, json, binary), { decodeTexture: async () => true, batchSize: 32 });
  writeFileSync(${reportJsonPath}, JSON.stringify(report, null, 2) + '\\n');
  writeFileSync(${reportMarkdownPath}, coverageReportMarkdown(report) + '\\n');
}, 120000));
`, 'utf8');
  const npm = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(npm, ['vitest', 'run', '--root', repoRoot, relative(repoRoot, testPath)], { stdio: 'inherit', cwd: frontendRoot, shell: process.platform === 'win32' });
  if (result.status !== 0) throw new Error(`Vanilla audit command failed with exit code ${result.status ?? 1}`);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

function moduleSpecifier(from, to) {
  const value = relative(from, to).replaceAll('\\', '/');
  return value.startsWith('.') ? value : `./${value}`;
}

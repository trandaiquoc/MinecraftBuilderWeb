import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const outputDirectory = join(root, 'public', 'local-assets', 'vanilla', '1.21.1');
const downloadDirectory = join(root, '.minecraft-assets');
const downloadedJar = join(downloadDirectory, 'vercel-vanilla-1.21.1.jar');
const generator = join(root, 'tools', 'build-local-vanilla-bundle.mjs');
const maxJarBytes = 512 * 1024 * 1024;

let downloaded = false;
try {
  const jarPath = process.env.VANILLA_JAR_PATH?.trim();
  const jarUrl = process.env.VANILLA_JAR_URL?.trim();
  let sourcePath;

  if (jarPath) {
    sourcePath = resolve(process.cwd(), jarPath);
    if (!isFile(sourcePath)) throw new Error(`VANILLA_JAR_PATH does not point to a file: ${sourcePath}`);
  } else if (jarUrl) {
    downloaded = true;
    sourcePath = await downloadJar(jarUrl, process.env.VANILLA_JAR_TOKEN?.trim());
  } else {
    throw new Error('VANILLA_JAR_PATH or VANILLA_JAR_URL is required for the Vercel Vanilla asset build.');
  }

  rmSync(outputDirectory, { recursive: true, force: true });
  const result = spawnSync(process.execPath, [generator, sourcePath, outputDirectory], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Vanilla bundle generator exited with status ${result.status ?? 'unknown'}.`);

  validateBundle(join(outputDirectory, 'asset-bundle.json'));
  console.log('Validated Minecraft Java 1.21.1 Vanilla asset bundle for deployment.');
} finally {
  if (downloaded) rmSync(downloadedJar, { force: true });
  rmSync(join(downloadDirectory, 'vanilla-bundle-tmp'), { recursive: true, force: true });
}

function isFile(path) {
  try { return statSync(path).isFile(); } catch { return false; }
}

async function downloadJar(urlValue, token) {
  let url;
  try { url = new URL(urlValue); } catch { throw new Error('VANILLA_JAR_URL must be a valid http(s) URL.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('VANILLA_JAR_URL must use http or https.');

  mkdirSync(downloadDirectory, { recursive: true });
  rmSync(downloadedJar, { force: true });
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  const response = await fetch(url, { headers });
  if (!response.ok || !response.body) throw new Error(`Vanilla JAR download failed with HTTP ${response.status}.`);
  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (declaredLength > maxJarBytes) throw new Error('Vanilla JAR exceeds the 512 MB build-time limit.');

  const file = await open(downloadedJar, 'w');
  let total = 0;
  try {
    const reader = response.body.getReader();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > maxJarBytes) throw new Error('Vanilla JAR exceeds the 512 MB build-time limit.');
      await file.write(chunk.value);
    }
  } finally {
    await file.close();
  }
  return downloadedJar;
}

function validateBundle(path) {
  if (!isFile(path)) throw new Error(`Expected generated bundle was not found: ${path}`);
  let bundle;
  try { bundle = JSON.parse(readFileSync(path, 'utf8')); } catch (error) { throw new Error(`Generated Vanilla bundle is not valid JSON: ${error.message}`); }
  if (bundle.type !== 'vanilla' || bundle.version !== '1.21.1' || bundle.minecraftVersion !== '1.21.1') throw new Error('Generated bundle is not Minecraft Java 1.21.1 Vanilla data.');
  if (bundle.manifest?.format !== 'minecraft-builder-asset-bundle' || bundle.manifest?.version !== 1) throw new Error('Generated bundle manifest is incompatible.');
  if (bundle.schemaVersion !== 2 || !bundle.json || !Array.isArray(bundle.binaryBase64)) throw new Error('Generated bundle is missing the expected normalized asset payload.');
}

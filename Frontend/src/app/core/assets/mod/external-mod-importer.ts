import { ZipArchive } from '../archive/zip-archive';
import { ExternalModProvider, ModImportDiagnostic, SupportedModLoader } from './external-mod-provider';

const MOD_RESOURCE_PATH = /^assets\/[^/]+\/(?:blockstates|models|textures|lang)\/.*\.(?:json|png|png\.mcmeta)$/;
const MAX_RETAINED_BYTES = 256 * 1024 * 1024;

export async function importFabricModJar(file: File, minecraftVersion = '1.21.1'): Promise<ExternalModProvider> {
  const archive = await ZipArchive.open(file);
  const metadataEntry = archive.entries.find((entry) => entry.name === 'fabric.mod.json');
  if (!metadataEntry) {
    const loader = detectModLoader(archive.entries.map((entry) => entry.name));
    if (loader === 'forge' || loader === 'neoforge' || loader === 'quilt') throw new UnsupportedModLoaderError(loader);
    throw new Error('Could not detect a supported mod loader. Only Fabric resource import is supported.');
  }
  let metadata: unknown;
  try { metadata = JSON.parse(new TextDecoder().decode(await metadataEntry.read())); }
  catch { throw new Error('fabric.mod.json is malformed'); }
  const entries = archive.entries.filter((entry) => MOD_RESOURCE_PATH.test(entry.name));
  const totalSize = entries.reduce((total, entry) => total + entry.uncompressedSize, 0);
  if (totalSize > MAX_RETAINED_BYTES) throw new Error('The mod resource payload is too large to retain locally');
  const json = new Map<string, unknown>(); const binary = new Map<string, Uint8Array>(); const diagnostics: ModImportDiagnostic[] = [];
  for (let offset = 0; offset < entries.length; offset += 32) {
    const batch = entries.slice(offset, offset + 32);
    const decoded = await Promise.all(batch.map(async (entry) => ({ entry, bytes: await entry.read() })));
    for (const { entry, bytes } of decoded) {
      if (entry.name.endsWith('.json') || entry.name.endsWith('.png.mcmeta')) {
        try { json.set(entry.name, JSON.parse(new TextDecoder().decode(bytes))); }
        catch { diagnostics.push({ severity: 'warning', code: 'malformed-json', message: 'Skipped malformed JSON resource', path: entry.name }); }
      } else binary.set(entry.name, bytes);
    }
  }
  const nestedJar = archive.entries.some((entry) => entry.name.endsWith('.jar'));
  if (nestedJar) diagnostics.push({ severity: 'info', code: 'nested-jar-skipped', message: 'Nested JARs were ignored; runtime dependencies are not executed.' });
  return ExternalModProvider.create({ metadata, json, resources: binary, diagnostics, minecraftVersion });
}

export class UnsupportedModLoaderError extends Error {
  constructor(readonly loader: Exclude<SupportedModLoader, 'fabric' | 'unknown'>) { super(`Detected ${loaderLabel(loader)} mod. ${loaderLabel(loader)} JAR import is not supported yet.`); }
}

export function detectModLoader(paths: readonly string[]): SupportedModLoader {
  if (paths.includes('fabric.mod.json')) return 'fabric';
  if (paths.includes('quilt.mod.json')) return 'quilt';
  if (paths.includes('META-INF/neoforge.mods.toml')) return 'neoforge';
  if (paths.includes('META-INF/mods.toml')) return 'forge';
  return 'unknown';
}
function loaderLabel(loader: Exclude<SupportedModLoader, 'fabric' | 'unknown'>): string { return loader[0].toUpperCase() + loader.slice(1); }

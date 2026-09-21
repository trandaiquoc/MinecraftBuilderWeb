import { ZipArchive } from '../archive/zip-archive';
import { ExternalModProvider, ModImportDiagnostic } from './external-mod-provider';

const MOD_RESOURCE_PATH = /^assets\/[^/]+\/(?:blockstates|models|textures|lang)\/.*\.(?:json|png|png\.mcmeta)$/;
const MAX_RETAINED_BYTES = 256 * 1024 * 1024;

export async function importFabricModJar(file: File): Promise<ExternalModProvider> {
  const archive = await ZipArchive.open(file);
  const metadataEntry = archive.entries.find((entry) => entry.name === 'fabric.mod.json');
  if (!metadataEntry) {
    if (archive.entries.some((entry) => entry.name === 'META-INF/mods.toml')) throw new Error('Forge/NeoForge metadata is not supported; import a Fabric mod JAR');
    throw new Error('fabric.mod.json was not found; only Fabric metadata is supported');
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
  return ExternalModProvider.create({ metadata, json, resources: binary, diagnostics });
}

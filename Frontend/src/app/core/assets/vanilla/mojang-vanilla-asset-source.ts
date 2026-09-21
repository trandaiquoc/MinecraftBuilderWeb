import { Injectable, signal } from '@angular/core';
import { VanillaAssetProvider } from './vanilla-asset-provider';

const VERSION_MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const OFFICIAL_METADATA_HOST = 'piston-meta.mojang.com';
const OFFICIAL_DOWNLOAD_HOSTS = new Set(['piston-data.mojang.com', 'launcher.mojang.com']);
const MAX_CLIENT_BYTES = 512 * 1024 * 1024;

export interface MojangRelease { readonly id: string; readonly type: 'release'; readonly url: string; readonly releaseTime?: string; }
interface VersionManifest { readonly versions?: readonly { readonly id?: unknown; readonly type?: unknown; readonly url?: unknown; readonly releaseTime?: unknown }[]; }
interface VersionMetadata { readonly downloads?: { readonly client?: { readonly url?: unknown; readonly sha1?: unknown; readonly size?: unknown } } }

@Injectable({ providedIn: 'root' })
export class MojangVersionService {
  readonly releases = signal<readonly MojangRelease[]>([]);
  readonly loading = signal(false);
  private loaded?: Promise<readonly MojangRelease[]>;

  async loadReleases(): Promise<readonly MojangRelease[]> {
    if (this.loaded) return this.loaded;
    this.loading.set(true);
    this.loaded = fetch(VERSION_MANIFEST_URL).then(async (response) => {
      if (!response.ok) throw new Error(`Unable to load Minecraft versions (${response.status})`);
      const manifest = await response.json() as VersionManifest;
      const releases = (manifest.versions ?? []).flatMap((item) => typeof item.id === 'string' && item.type === 'release' && typeof item.url === 'string' && isTrustedMetadataUrl(item.url) ? [{ id: item.id, type: 'release' as const, url: item.url, ...(typeof item.releaseTime === 'string' ? { releaseTime: item.releaseTime } : {}) }] : []);
      if (!releases.length) throw new Error('Mojang returned no release versions');
      this.releases.set(releases);
      return releases;
    }).finally(() => this.loading.set(false));
    try { return await this.loaded; } catch (error) { this.loaded = undefined; throw error; }
  }
}

export type VanillaDownloadPhase = 'metadata' | 'download' | 'verify' | 'normalize';
export interface VanillaDownloadProgress { readonly phase: VanillaDownloadPhase; readonly loaded: number; readonly total?: number; }

export class MojangVanillaAssetSource {
  async load(version: string, onProgress?: (progress: VanillaDownloadProgress) => void): Promise<VanillaAssetProvider> {
    onProgress?.({ phase: 'metadata', loaded: 0 });
    const manifestResponse = await fetch(VERSION_MANIFEST_URL);
    if (!manifestResponse.ok) throw new Error(`Unable to load Minecraft versions (${manifestResponse.status})`);
    const manifest = await manifestResponse.json() as VersionManifest;
    const release = (manifest.versions ?? []).find((item) => item.id === version && item.type === 'release' && typeof item.url === 'string');
    if (!release || !isTrustedMetadataUrl(release.url as string)) throw new Error(`Minecraft release ${version} was not found in Mojang metadata.`);
    const metadataResponse = await fetch(release.url as string);
    if (!metadataResponse.ok) throw new Error(`Unable to load Minecraft ${version} metadata (${metadataResponse.status})`);
    const metadata = await metadataResponse.json() as VersionMetadata;
    const client = metadata.downloads?.client;
    if (!client || typeof client.url !== 'string' || !isTrustedClientUrl(client.url)) throw new Error(`Mojang did not provide a trusted client download for Minecraft ${version}.`);
    const expectedSize = typeof client.size === 'number' && Number.isFinite(client.size) ? client.size : undefined;
    const expectedSha1 = typeof client.sha1 === 'string' ? client.sha1.toLowerCase() : undefined;
    const response = await fetch(client.url);
    if (!response.ok || !response.body) throw new Error(`Unable to download Minecraft ${version} (${response.status})`);
    const contentLength = Number(response.headers.get('content-length') ?? 0) || expectedSize;
    if (contentLength && contentLength > MAX_CLIENT_BYTES) throw new Error('The Minecraft client JAR is larger than the supported download limit.');
    const bytes = await readResponse(response, contentLength, (loaded) => onProgress?.({ phase: 'download', loaded, total: contentLength }));
    if (!bytes.length || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('The Mojang client download is not a valid JAR/ZIP file.');
    if (expectedSize !== undefined && bytes.byteLength !== expectedSize) throw new Error('The Mojang client download size does not match its metadata.');
    onProgress?.({ phase: 'verify', loaded: bytes.byteLength, total: bytes.byteLength });
    if (expectedSha1 && typeof crypto !== 'undefined' && crypto.subtle) {
      const digestInput = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const digest = await crypto.subtle.digest('SHA-1', digestInput);
      const actual = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
      if (actual !== expectedSha1) throw new Error('The Mojang client checksum does not match its metadata.');
    }
    onProgress?.({ phase: 'normalize', loaded: 0, total: bytes.byteLength });
    const blobBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return VanillaAssetProvider.fromJar(new Blob([blobBytes]), version, 'Mojang official assets');
  }
}

async function readResponse(response: Response, total: number | undefined, progress: (loaded: number) => void): Promise<Uint8Array> {
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    loaded += next.value.byteLength;
    if (loaded > MAX_CLIENT_BYTES) throw new Error('The Minecraft client download is larger than the supported limit.');
    chunks.push(next.value); progress(loaded);
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

function isTrustedMetadataUrl(value: string): boolean { try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === OFFICIAL_METADATA_HOST; } catch { return false; } }
function isTrustedClientUrl(value: string): boolean { try { const url = new URL(value); return url.protocol === 'https:' && OFFICIAL_DOWNLOAD_HOSTS.has(url.hostname); } catch { return false; } }

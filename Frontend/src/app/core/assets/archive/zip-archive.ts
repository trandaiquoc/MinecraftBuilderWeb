import { yieldToBrowser } from '../cooperative-yield';
import { throwIfAborted } from '../mod/mod-import-cancellation';

export interface ZipEntry {
  readonly name: string;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  read(signal?: AbortSignal): Promise<Uint8Array>;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const MAX_ENTRY_SIZE = 32 * 1024 * 1024;

export class ZipArchive {
  readonly entries: readonly ZipEntry[];
  private constructor(private readonly bytes: Uint8Array, entries: readonly ZipEntry[]) { this.entries = entries; }

  static async open(file: Blob, onProgress?: (loaded: number, total: number) => void, signal?: AbortSignal): Promise<ZipArchive> {
    throwIfAborted(signal);
    const bytes = await readBlob(file, onProgress, signal);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const eocd = findEndOfCentralDirectory(view);
    const entryCount = view.getUint16(eocd + 10, true);
    let cursor = view.getUint32(eocd + 16, true);
    const entries: ZipEntry[] = [];
    for (let index = 0; index < entryCount; index++) {
      throwIfAborted(signal);
      if (view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) throw new Error('Invalid ZIP central directory');
      const flags = view.getUint16(cursor + 8, true);
      const method = view.getUint16(cursor + 10, true);
      const compressedSize = view.getUint32(cursor + 20, true);
      const uncompressedSize = view.getUint32(cursor + 24, true);
      const nameLength = view.getUint16(cursor + 28, true);
      const extraLength = view.getUint16(cursor + 30, true);
      const commentLength = view.getUint16(cursor + 32, true);
      const localOffset = view.getUint32(cursor + 42, true);
      const name = new TextDecoder((flags & 0x800) !== 0 ? 'utf-8' : 'utf-8').decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
      if ((flags & 1) !== 0) throw new Error(`Encrypted ZIP entries are not supported: ${name}`);
      if (uncompressedSize > MAX_ENTRY_SIZE) throw new Error(`ZIP entry is too large: ${name}`);
      entries.push({ name, compressedSize, uncompressedSize, read: (entrySignal) => readEntry(bytes, view, localOffset, method, compressedSize, uncompressedSize, name, entrySignal ?? signal) });
      cursor += 46 + nameLength + extraLength + commentLength;
      if ((index + 1) % 256 === 0) { await yieldToBrowser(); throwIfAborted(signal); }
    }
    return new ZipArchive(bytes, entries);
  }

  async fingerprint(signal?: AbortSignal): Promise<string | undefined> {
    try {
      throwIfAborted(signal);
      if (!globalThis.crypto?.subtle) return undefined;
      const digest = await globalThis.crypto.subtle.digest('SHA-256', this.bytes.byteOffset === 0 && this.bytes.byteLength === this.bytes.buffer.byteLength ? this.bytes.buffer as ArrayBuffer : this.bytes.slice().buffer as ArrayBuffer);
      throwIfAborted(signal);
      return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
    } catch (error) { if (signal?.aborted) throwIfAborted(signal); if (error instanceof Error && error.name === 'AbortError') throw error; return undefined; }
  }
}

async function readBlob(file: Blob, onProgress?: (loaded: number, total: number) => void, signal?: AbortSignal): Promise<Uint8Array> {
  throwIfAborted(signal);
  const total = file.size;
  if (!file.stream) { const bytes = new Uint8Array(await file.arrayBuffer()); throwIfAborted(signal); onProgress?.(bytes.byteLength, total); return bytes; }
  const reader = file.stream().getReader();
  const abort = (): void => { void reader.cancel(signal?.reason); };
  signal?.addEventListener('abort', abort, { once: true });
  const bytes = new Uint8Array(total);
  let loaded = 0;
  try {
    while (true) {
      throwIfAborted(signal);
      const result = await reader.read();
      if (result.done) break;
      if (result.value) { bytes.set(result.value, loaded); loaded += result.value.byteLength; onProgress?.(loaded, total); }
    }
    throwIfAborted(signal);
    return loaded === total ? bytes : bytes.slice(0, loaded);
  } catch (error) {
    if (signal?.aborted) throwIfAborted(signal);
    throw error;
  } finally { signal?.removeEventListener('abort', abort); }
}

function findEndOfCentralDirectory(view: DataView): number {
  const minimum = Math.max(0, view.byteLength - 65_557);
  for (let cursor = view.byteLength - 22; cursor >= minimum; cursor--) if (view.getUint32(cursor, true) === EOCD_SIGNATURE) return cursor;
  throw new Error('ZIP end-of-central-directory record was not found');
}

async function readEntry(bytes: Uint8Array, view: DataView, localOffset: number, method: number, compressedSize: number, expectedSize: number, name: string, signal?: AbortSignal): Promise<Uint8Array> {
  throwIfAborted(signal);
  if (view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) throw new Error(`Invalid ZIP local header: ${name}`);
  const nameLength = view.getUint16(localOffset + 26, true);
  const extraLength = view.getUint16(localOffset + 28, true);
  const start = localOffset + 30 + nameLength + extraLength;
  const compressed = bytes.slice(start, start + compressedSize);
  let output: Uint8Array;
  if (method === 0) output = compressed;
  else if (method === 8) {
    const decompressor = new DecompressionStream('deflate-raw');
    const reading = new Response(decompressor.readable).arrayBuffer();
    const writer = decompressor.writable.getWriter();
    const abort = (): void => { void writer.abort(signal?.reason); };
    signal?.addEventListener('abort', abort, { once: true });
    try {
      await writer.write(new Uint8Array(compressed).buffer); throwIfAborted(signal); await writer.close();
      output = new Uint8Array(await reading);
    } finally { signal?.removeEventListener('abort', abort); }
  } else throw new Error(`Unsupported ZIP compression method ${method}: ${name}`);
  throwIfAborted(signal);
  if (output.byteLength !== expectedSize) throw new Error(`ZIP entry size mismatch: ${name}`);
  return output;
}

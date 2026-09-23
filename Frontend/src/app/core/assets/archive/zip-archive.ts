import { yieldToBrowser } from '../cooperative-yield';

export interface ZipEntry {
  readonly name: string;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  read(): Promise<Uint8Array>;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const MAX_ENTRY_SIZE = 32 * 1024 * 1024;

export class ZipArchive {
  readonly entries: readonly ZipEntry[];
  private constructor(private readonly bytes: Uint8Array, entries: readonly ZipEntry[]) { this.entries = entries; }

  static async open(file: Blob, onProgress?: (loaded: number, total: number) => void): Promise<ZipArchive> {
    const bytes = await readBlob(file, onProgress);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const eocd = findEndOfCentralDirectory(view);
    const entryCount = view.getUint16(eocd + 10, true);
    let cursor = view.getUint32(eocd + 16, true);
    const entries: ZipEntry[] = [];
    for (let index = 0; index < entryCount; index++) {
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
      entries.push({ name, compressedSize, uncompressedSize, read: () => readEntry(bytes, view, localOffset, method, compressedSize, uncompressedSize, name) });
      cursor += 46 + nameLength + extraLength + commentLength;
      if ((index + 1) % 256 === 0) await yieldToBrowser();
    }
    return new ZipArchive(bytes, entries);
  }

  async fingerprint(): Promise<string | undefined> {
    try {
      if (!globalThis.crypto?.subtle) return undefined;
      const digest = await globalThis.crypto.subtle.digest('SHA-256', this.bytes.slice().buffer as ArrayBuffer);
      return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
    } catch { return undefined; }
  }
}

async function readBlob(file: Blob, onProgress?: (loaded: number, total: number) => void): Promise<Uint8Array> {
  const total = file.size;
  if (!file.stream) { const bytes = new Uint8Array(await file.arrayBuffer()); onProgress?.(bytes.byteLength, total); return bytes; }
  const reader = file.stream().getReader();
  const bytes = new Uint8Array(total);
  let loaded = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    if (result.value) { bytes.set(result.value, loaded); loaded += result.value.byteLength; onProgress?.(loaded, total); }
  }
  return loaded === total ? bytes : bytes.slice(0, loaded);
}

function findEndOfCentralDirectory(view: DataView): number {
  const minimum = Math.max(0, view.byteLength - 65_557);
  for (let cursor = view.byteLength - 22; cursor >= minimum; cursor--) if (view.getUint32(cursor, true) === EOCD_SIGNATURE) return cursor;
  throw new Error('ZIP end-of-central-directory record was not found');
}

async function readEntry(bytes: Uint8Array, view: DataView, localOffset: number, method: number, compressedSize: number, expectedSize: number, name: string): Promise<Uint8Array> {
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
    await writer.write(new Uint8Array(compressed).buffer); await writer.close();
    output = new Uint8Array(await reading);
  } else throw new Error(`Unsupported ZIP compression method ${method}: ${name}`);
  if (output.byteLength !== expectedSize) throw new Error(`ZIP entry size mismatch: ${name}`);
  return output;
}

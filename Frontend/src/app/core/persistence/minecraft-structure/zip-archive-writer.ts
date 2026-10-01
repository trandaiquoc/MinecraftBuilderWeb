/** A small packaging port kept independent from any ZIP library. */
export interface ZipArchiveOutputEntry {
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly compression: 'store' | 'deflate';
}

export interface ZipArchiveWriter {
  write(entries: readonly ZipArchiveOutputEntry[]): Promise<Uint8Array>;
}

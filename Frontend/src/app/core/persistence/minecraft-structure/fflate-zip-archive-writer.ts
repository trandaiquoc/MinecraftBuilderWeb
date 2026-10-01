import { zip, type AsyncZippable } from 'fflate';
import type { ZipArchiveOutputEntry, ZipArchiveWriter } from './zip-archive-writer';
import { validateZipArchiveEntries } from './zip-archive-writer';

/** Browser-safe fflate adapter for the library-neutral ZIP packaging port. */
export class FflateZipArchiveWriter implements ZipArchiveWriter {
  write(entries: readonly ZipArchiveOutputEntry[]): Promise<Uint8Array> {
    const diagnostics = validateZipArchiveEntries(entries);
    if (diagnostics.length > 0) return Promise.reject(new Error(diagnostics.join(' ')));

    const files: AsyncZippable = Object.create(null) as AsyncZippable;
    // A fixed DOS-compatible timestamp keeps artifacts reproducible and avoids
    // leaking the user's local clock into a downloadable archive.
    for (const entry of entries) files[entry.path] = [entry.bytes, { level: entry.compression === 'store' ? 0 : 6, mtime: '1980-01-01T00:00:00Z' }];
    return new Promise<Uint8Array>((resolve, reject) => {
      zip(files, (error, bytes) => error ? reject(error) : resolve(bytes));
    });
  }
}

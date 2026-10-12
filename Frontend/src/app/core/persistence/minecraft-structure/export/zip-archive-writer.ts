/** A small packaging port kept independent from any ZIP library. */
export interface ZipArchiveOutputEntry {
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly compression: 'store' | 'deflate';
}

export interface ZipArchiveWriter {
  write(entries: readonly ZipArchiveOutputEntry[]): Promise<Uint8Array>;
}

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/**
 * Validates a relative ZIP entry path without normalizing it. Keeping this at
 * the writer boundary protects future callers that do not come from the
 * already-validated datapack plan.
 */
export function validateZipArchiveEntryPath(path: unknown): readonly string[] {
  if (
    typeof path !== 'string' ||
    !path ||
    path.startsWith('/') ||
    path.startsWith('\\') ||
    path.includes('\\') ||
    path.includes(':') ||
    /^[a-z]:/i.test(path) ||
    CONTROL_CHARACTERS.test(path)
  ) {
    return ['ZIP entry path must be a safe relative path.'];
  }
  const segments = path.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..'))
    return ['ZIP entry path cannot contain empty, dot, or parent segments.'];
  return [];
}

export function validateZipArchiveEntries(
  entries: readonly ZipArchiveOutputEntry[],
): readonly string[] {
  const diagnostics: string[] = [];
  const paths = new Set<string>();
  for (const entry of entries) {
    diagnostics.push(...validateZipArchiveEntryPath(entry.path));
    if (paths.has(entry.path)) diagnostics.push(`ZIP entry path is duplicated: ${entry.path}`);
    paths.add(entry.path);
    if (!isUint8Array(entry.bytes))
      diagnostics.push(`ZIP entry bytes must be Uint8Array: ${entry.path}`);
    if (entry.compression !== 'store' && entry.compression !== 'deflate')
      diagnostics.push(`ZIP entry compression is unsupported: ${entry.path}`);
  }
  return diagnostics;
}

function isUint8Array(value: unknown): value is Uint8Array {
  return (
    ArrayBuffer.isView(value) && Object.prototype.toString.call(value) === '[object Uint8Array]'
  );
}

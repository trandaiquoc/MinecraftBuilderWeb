import { describe, expect, it, vi } from 'vitest';
import { ZipArchive } from '../archive/zip-archive';
import { inspectModJar } from './external-mod-importer';
import { MAX_JAR_UPLOAD_BYTES } from './jar-upload-validation';

describe('external mod upload safety', () => {
  it('rejects an oversized JAR before opening the archive', async () => {
    const open = vi.spyOn(ZipArchive, 'open');
    const file = { name: 'too-large.jar', size: MAX_JAR_UPLOAD_BYTES + 1 } as File;
    await expect(inspectModJar(file)).rejects.toThrow('JAR files must not exceed 200 MB');
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });
});

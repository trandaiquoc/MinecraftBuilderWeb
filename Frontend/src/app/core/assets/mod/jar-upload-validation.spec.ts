import { describe, expect, it } from 'vitest';
import { JarUploadValidationError, MAX_JAR_UPLOAD_BYTES, validateJarUpload } from './jar-upload-validation';

const file = (name: string, size: number) => ({ name, size });

describe('JAR upload validation', () => {
  it('accepts case-insensitive JAR names at the exact size boundary', () => {
    expect(() => validateJarUpload(file('example.jar', 0))).not.toThrow();
    expect(() => validateJarUpload(file('EXAMPLE.JAR', MAX_JAR_UPLOAD_BYTES))).not.toThrow();
  });

  it.each(['example.zip', 'example.jar.zip', 'example', 'example.png'])('rejects %s before archive processing', (name) => {
    expect(() => validateJarUpload(file(name, 1))).toThrowError(JarUploadValidationError);
    expect(() => validateJarUpload(file(name, 1))).toThrow('Only JAR files');
  });

  it('rejects only files above 200 MB', () => {
    expect(() => validateJarUpload(file('large.jar', MAX_JAR_UPLOAD_BYTES + 1))).toThrow('200 MB');
  });
});

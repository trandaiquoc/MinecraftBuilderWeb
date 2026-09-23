export const MAX_JAR_UPLOAD_BYTES = 100 * 1024 * 1024;

export type JarValidationCode = 'jar-extension' | 'jar-too-large';

export class JarUploadValidationError extends Error {
  constructor(readonly code: JarValidationCode, readonly maxBytes = MAX_JAR_UPLOAD_BYTES) {
    super(code === 'jar-extension' ? 'Only JAR files (.jar) are supported.' : 'JAR files must not exceed 100 MB.');
    this.name = 'JarUploadValidationError';
  }
}

export function validateJarUpload(file: Pick<File, 'name' | 'size'>): void {
  if (!file.name.toLocaleLowerCase().endsWith('.jar')) throw new JarUploadValidationError('jar-extension');
  if (file.size > MAX_JAR_UPLOAD_BYTES) throw new JarUploadValidationError('jar-too-large');
}

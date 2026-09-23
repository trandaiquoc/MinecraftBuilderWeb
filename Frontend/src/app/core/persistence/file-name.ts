/** Converts a project name into a portable download filename stem. */
export function sanitizeFilename(value: string): string {
  return value.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'minecraft-project';
}

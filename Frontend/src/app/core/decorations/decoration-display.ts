export function humanizeDecorationName(id: string): string {
  return id
    .split('_')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
}

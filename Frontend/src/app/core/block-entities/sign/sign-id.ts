export function isSignId(id: string): boolean {
  if (!id.startsWith('minecraft:')) return false;
  const path = id.slice('minecraft:'.length);
  return /(?:^|_)(?:wall_)?sign$/.test(path) || path.endsWith('_hanging_sign');
}

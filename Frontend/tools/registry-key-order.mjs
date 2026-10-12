export function compareRegistryKeys(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

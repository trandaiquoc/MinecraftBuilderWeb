import {
  itemEvidenceFromResources,
  itemIdentityIndexFromResources,
} from '../vanilla/format/item-evidence';

export function externalItemEvidence(
  json: Readonly<Record<string, unknown>>,
): readonly ReturnType<typeof itemEvidenceFromResources>[number][] {
  const paths = Object.keys(json);
  const identity = itemIdentityIndexFromResources(json);
  const modern = itemEvidenceFromResources(
    json,
    paths.filter((path) => /^assets\/[^/]+\/items\/.+\.json$/.test(path)),
    'modern-item-definition',
    identity,
  );
  const legacy = itemEvidenceFromResources(
    json,
    paths.filter((path) => /^assets\/[^/]+\/models\/item\/.+\.json$/.test(path)),
    'legacy-item-model',
    identity,
  );
  const byId = new Map<string, ReturnType<typeof itemEvidenceFromResources>[number]>();
  for (const entry of [...legacy, ...modern]) byId.set(entry.itemId, entry);
  return [...byId.values()];
}

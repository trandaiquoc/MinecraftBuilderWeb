import type { AssetBlockRecord } from '../../blocks/catalog/block-definition.types';
import type { ContentSpecialVisualDescriptor } from '../../content/content-introspection';

export function buildExternalSignVisualIndex(
  blockIds: ReadonlySet<string>,
  families: ReadonlyMap<string, readonly string[]>,
  paths: readonly string[],
): ReadonlyMap<string, ContentSpecialVisualDescriptor | undefined> {
  const candidates = new Map<string, string[]>();
  for (const path of paths) {
    const match = /^assets\/([^/]+)\/textures\/entity\/signs\/(hanging\/)?([^/]+)\.png$/.exec(path);
    if (!match) continue;
    const key = `${match[2] ? 'hanging' : 'standing'}:${match[3]}`;
    const resource = `${match[1]}:entity/signs/${match[2] ?? ''}${match[3]}`;
    candidates.set(key, [...(candidates.get(key) ?? []), resource]);
  }
  const result = new Map<string, ContentSpecialVisualDescriptor | undefined>();
  for (const id of blockIds) {
    const family = families
      .get(id)
      ?.find((value) =>
        ['standing-sign', 'wall-sign', 'hanging-sign', 'wall-hanging-sign'].includes(value),
      );
    if (!family) continue;
    const variant =
      family === 'standing-sign'
        ? 'standing'
        : family === 'wall-sign'
          ? 'wall'
          : family === 'hanging-sign'
            ? 'hanging'
            : 'wall-hanging';
    const name = id.split(':')[1] ?? '';
    const material = name
      .replace(/_(?:wall_)?hanging_sign$/, '')
      .replace(/_wall_sign$/, '')
      .replace(/_sign$/, '');
    const values =
      candidates.get(
        `${variant === 'hanging' || variant === 'wall-hanging' ? 'hanging' : 'standing'}:${material}`,
      ) ?? [];
    result.set(
      id,
      values.length === 1
        ? {
            contractId: 'common-sign',
            variant,
            resources: { default: values[0] },
            stateDependencies:
              variant === 'standing' || variant === 'hanging' ? ['rotation'] : ['facing'],
            provenance: 'trusted-data',
          }
        : undefined,
    );
  }
  return result;
}

export function addVerifiedSignPlacementVariants(
  records: readonly AssetBlockRecord[],
): readonly AssetBlockRecord[] {
  const groups = new Map<
    string,
    { standing?: string; wall?: string; hanging?: string; wallHanging?: string }
  >();
  for (const record of records) {
    const visual = record.specialVisual;
    if (visual?.contractId !== 'common-sign' || !visual.resources['default']) continue;
    const group = groups.get(visual.resources['default']) ?? {};
    if (visual.variant === 'standing') group.standing = record.id;
    if (visual.variant === 'wall') group.wall = record.id;
    if (visual.variant === 'hanging') group.hanging = record.id;
    if (visual.variant === 'wall-hanging') group.wallHanging = record.id;
    groups.set(visual.resources['default'], group);
  }
  const variantsById = new Map<
    string,
    {
      readonly standing?: string;
      readonly wall?: string;
      readonly hanging?: string;
      readonly wallHanging?: string;
    }
  >();
  for (const group of groups.values()) {
    const variants = Object.fromEntries(Object.entries(group).filter(([, value]) => !!value));
    if (!(group.standing || group.hanging) || Object.keys(variants).length < 2) continue;
    for (const id of Object.values(group).filter((value): value is string => !!value))
      variantsById.set(id, variants);
  }
  return records.map((record) => {
    const placementVariants = variantsById.get(record.id);
    return placementVariants ? { ...record, placementVariants } : record;
  });
}

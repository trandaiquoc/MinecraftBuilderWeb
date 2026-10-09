import type {
  BehaviorSupportLevel,
  VisualSupportLevel,
} from '../../blocks/catalog/block-definition.types';
import { auditContentDomains } from './vanilla-content-domain-audit';
import type {
  VanillaAssetCoverageReport,
  VanillaAssetAuditRecord,
} from './vanilla-asset-audit.types';
import type { VanillaAssetProvider } from './vanilla-asset-provider';

/** Aggregates completed entry audits into the stable coverage report contract. */
export function buildVanillaAssetCoverage(
  provider: VanillaAssetProvider,
  records: readonly VanillaAssetAuditRecord[],
): VanillaAssetCoverageReport {
  const minecraftVersion = provider.minecraftVersion;
  const sourceName = provider.sourceName;
  const count = <T extends string>(
    values: readonly T[],
    choices: readonly T[],
  ): Record<T, number> =>
    Object.fromEntries(
      choices.map((choice) => [choice, values.filter((value) => value === choice).length]),
    ) as Record<T, number>;
  const reasons: Record<string, number> = {};
  const families: Record<string, number> = {};
  for (const item of records) {
    families[item.family] = (families[item.family] ?? 0) + 1;
    for (const reason of item.render.reasons) reasons[reason] = (reasons[reason] ?? 0) + 1;
  }
  return {
    schemaVersion: 1,
    minecraftVersion,
    sourceName,
    generatedAt: new Date().toISOString(),
    methodology: [
      `Catalog entries and default states come from the selected Minecraft ${minecraftVersion} asset source.`,
      'Display names come from the active en_us language resource; visual resources and behavior metadata remain independent.',
      'Geometry is built headlessly through the production resolver/geometry provider without a viewport.',
      'PNG decode uses createImageBitmap when available and a strict PNG container check in headless tooling.',
    ],
    summary: {
      totalEntries: records.length,
      visual: count(
        records.map((item) => item.render.visualSupport),
        ['real', 'partial', 'fallback'] satisfies readonly VisualSupportLevel[],
      ),
      behavior: count(
        records.map((item) => item.catalog.behaviorSupport),
        ['full', 'partial', 'unknown'] satisfies readonly BehaviorSupportLevel[],
      ),
      thumbnail: count(
        records.map((item) => item.thumbnail),
        ['real', 'fallback', 'unavailable'],
      ),
      defaultState: {
        known: records.filter((item) => item.defaultState.known).length,
        unknown: records.filter((item) => !item.defaultState.known).length,
      },
      specialRendererRequired: records.filter(
        (item) => item.render.classification === 'special-renderer-required',
      ).length,
      intentionallyInvisible: records.filter(
        (item) => item.render.classification === 'intentionally-invisible',
      ).length,
      failureReasons: sortCounts(reasons),
      families: sortCounts(families),
      contentDomain: auditContentDomains(provider),
    },
    records,
  };
}

function sortCounts(values: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(values).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  );
}

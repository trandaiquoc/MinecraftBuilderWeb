import type { AssetAuditReason, VanillaAssetCoverageReport } from './vanilla-asset-audit.types';

export function coverageReportMarkdown(report: VanillaAssetCoverageReport): string {
  const topReasons = Object.entries(report.summary.failureReasons).slice(0, 12);
  const samples = topReasons
    .map(
      ([reason, total]) =>
        `### ${reason} (${total})\n\n${report.records
          .filter((item) => item.render.reasons.includes(reason as AssetAuditReason))
          .slice(0, 10)
          .map((item) => `- \`${item.registryId}\``)
          .join('\n')}`,
    )
    .join('\n\n');
  return `# Vanilla Asset Coverage - Minecraft Java ${report.minecraftVersion}\n\nGenerated from \`${report.sourceName}\` at ${report.generatedAt}.\n\n## Summary\n\n- Total authoritative block entries: **${report.summary.totalEntries}**\n- Visual: REAL **${report.summary.visual.real}**, PARTIAL **${report.summary.visual.partial}**, FALLBACK **${report.summary.visual.fallback}**\n- Special renderer required: **${report.summary.specialRendererRequired}**\n- Intentionally invisible: **${report.summary.intentionallyInvisible}**\n- Behavior: Full **${report.summary.behavior.full}**, Partial **${report.summary.behavior.partial}**, Unknown **${report.summary.behavior.unknown}**\n- Thumbnail: real **${report.summary.thumbnail.real}**, fallback **${report.summary.thumbnail.fallback}**, unavailable **${report.summary.thumbnail.unavailable}**\n- Default state: known **${report.summary.defaultState.known}**, unknown **${report.summary.defaultState.unknown}**\n\n## Methodology\n\n${report.methodology.map((item) => `- ${item}`).join('\n')}\n\n## Top Failure Reasons\n\n${Object.entries(
    report.summary.failureReasons,
  )
    .slice(0, 20)
    .map(([reason, total]) => `- ${reason}: **${total}**`)
    .join(
      '\n',
    )}\n\n## Representative Samples\n\n${samples}\n\n## Family Distribution\n\n${Object.entries(
    report.summary.families,
  )
    .map(([family, total]) => `- ${family}: ${total}`)
    .join(
      '\n',
    )}\n\n## Current Manual Visual Observations\n\n${manualVisualObservations(report)}\n\nThese classifications only describe the asset/model pipeline. A Real visual does not imply correct placement or neighbor behavior.\n\n## Remaining Follow-ups\n\n1. Add dedicated renderers for entries classified SPECIAL_RENDERER_REQUIRED.\n2. Add verified render-layer/tint metadata after profiling the affected Partial set; do not infer it from registry names.\n3. Keep behavior issues in the rule engine; visual audit results are not evidence of placement correctness.\n`;
}

function manualVisualObservations(report: VanillaAssetCoverageReport): string {
  const describe = (id: string): string => {
    const item = report.records.find((record) => record.registryId === id);
    return item
      ? `${item.render.visualSupport.toUpperCase()} (${item.render.reasons.join(', ') || 'no asset diagnostic'})`
      : 'not present';
  };
  const family = (name: string): string => {
    const items = report.records.filter((item) => item.family === name);
    return `Real ${items.filter((item) => item.render.visualSupport === 'real').length}, Partial ${items.filter((item) => item.render.visualSupport === 'partial').length}, Fallback ${items.filter((item) => item.render.visualSupport === 'fallback').length}`;
  };
  return [
    `- Slabs: ${family('slabs')}; \`minecraft:stone_slab\` is ${describe('minecraft:stone_slab')}.`,
    `- Stairs: ${family('stairs')}; \`minecraft:oak_stairs\` is ${describe('minecraft:oak_stairs')}.`,
    `- Bed: \`minecraft:red_bed\` is ${describe('minecraft:red_bed')}.`,
    `- Trapdoor: \`minecraft:oak_trapdoor\` is ${describe('minecraft:oak_trapdoor')}.`,
    `- Wall Torch: ${describe('minecraft:wall_torch')}.`,
    `- Fence: ${describe('minecraft:oak_fence')}; neighbor refresh is covered by the rule-engine smoke tests.`,
    `- Door: ${describe('minecraft:oak_door')}; atomic lower/upper placement is covered by the rule-engine smoke tests.`,
    `- Sunflower: ${describe('minecraft:sunflower')}; atomic lower/upper placement is covered by the rule-engine smoke tests.`,
    `- Dandelion: ${describe('minecraft:dandelion')}.`,
    `- Glass Pane: ${describe('minecraft:glass_pane')}.`,
    `- Wall: ${describe('minecraft:cobblestone_wall')}.`,
  ].join('\n');
}

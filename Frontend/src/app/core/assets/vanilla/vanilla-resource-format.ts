export type VanillaResourceSupport = 'verified' | 'resource-compatible' | 'legacy-limited' | 'unsupported-resource-format';

export interface VanillaResourceFormatProfile {
  readonly id: 'modern-json' | 'legacy' | 'unsupported';
  readonly support: VanillaResourceSupport;
  readonly blockstates: number;
  readonly models: number;
  readonly textures: number;
  readonly languages: number;
  readonly label: string;
}

/** Detects the resource era without claiming that a downloaded client has full editor support. */
export function detectVanillaResourceFormat(json: Readonly<Record<string, unknown>>, binary: ReadonlyMap<string, Uint8Array>, verified = false): VanillaResourceFormatProfile {
  const paths = Object.keys(json);
  const blockstates = paths.filter((path) => /\/blockstates\/.*\.json$/.test(path)).length;
  const models = paths.filter((path) => /\/models\/.*\.json$/.test(path)).length;
  const textures = [...binary.keys()].filter((path) => /\/textures\/.*\.png$/.test(path)).length;
  const languages = paths.filter((path) => /\/lang\/[^/]+\.json$/.test(path)).length;
  if (blockstates > 0 && models > 0) return { id: 'modern-json', support: verified ? 'verified' : 'resource-compatible', blockstates, models, textures, languages, label: verified ? 'Verified JSON resource profile' : 'Resource-compatible JSON profile' };
  if (textures > 0 || languages > 0 || blockstates > 0 || models > 0) return { id: 'legacy', support: 'legacy-limited', blockstates, models, textures, languages, label: 'Legacy resource format' };
  return { id: 'unsupported', support: 'unsupported-resource-format', blockstates, models, textures, languages, label: 'Unsupported resource format' };
}

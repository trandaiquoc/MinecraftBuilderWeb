import { detectVanillaResourceFormat, VanillaResourceFormatProfile } from '../vanilla-resource-format';

export interface VanillaResourceFormatAdapter {
  readonly id: 'modern-json' | 'legacy' | 'unsupported';
  readonly profile: VanillaResourceFormatProfile;
  readonly canNormalizeModels: boolean;
  readonly canExposeLanguage: boolean;
  readonly blockstatePaths: (json: Readonly<Record<string, unknown>>) => readonly string[];
  readonly languagePath: (json: Readonly<Record<string, unknown>>) => string | undefined;
}

class ModernJsonResourceAdapter implements VanillaResourceFormatAdapter {
  readonly id = 'modern-json' as const;
  readonly canNormalizeModels = true;
  readonly canExposeLanguage = true;
  readonly blockstatePaths = blockstateResourcePaths;
  readonly languagePath = languageResourcePath;
  constructor(readonly profile: VanillaResourceFormatProfile) {}
}

class LegacyResourcePackAdapter implements VanillaResourceFormatAdapter {
  readonly id = 'legacy' as const;
  readonly canNormalizeModels = false;
  readonly canExposeLanguage = true;
  readonly blockstatePaths = blockstateResourcePaths;
  readonly languagePath = languageResourcePath;
  constructor(readonly profile: VanillaResourceFormatProfile) {}
}

class UnsupportedResourceAdapter implements VanillaResourceFormatAdapter {
  readonly id = 'unsupported' as const;
  readonly canNormalizeModels = false;
  readonly canExposeLanguage = false;
  readonly blockstatePaths = (_json: Readonly<Record<string, unknown>>): readonly string[] => [];
  readonly languagePath = (_json: Readonly<Record<string, unknown>>): string | undefined => undefined;
  constructor(readonly profile: VanillaResourceFormatProfile) {}
}

function blockstateResourcePaths(json: Readonly<Record<string, unknown>>): readonly string[] {
  return Object.keys(json).filter((path) => /\/blockstates\/[^/]+\.json$/.test(path)).sort();
}

function languageResourcePath(json: Readonly<Record<string, unknown>>): string | undefined {
  return Object.keys(json).find((path) => /^assets\/[^/]+\/lang\/[^/]+\.json$/.test(path));
}

/** Selects by observed resource evidence; version is only used as verification evidence. */
export function selectVanillaResourceFormatAdapter(json: Readonly<Record<string, unknown>>, binary: ReadonlyMap<string, Uint8Array>, verified = false): VanillaResourceFormatAdapter {
  const profile = detectVanillaResourceFormat(json, binary, verified);
  if (profile.id === 'modern-json') return new ModernJsonResourceAdapter(profile);
  if (profile.id === 'legacy') return new LegacyResourcePackAdapter(profile);
  return new UnsupportedResourceAdapter(profile);
}

import type { SurfaceFaceTemplate } from '../batching/surface-face-batch-renderer';
import { precompileTerrainTemplates, type PrecompiledTerrainFace } from './chunk-surface-mesher';
import { TerrainTextureAtlas, type TerrainAtlasMode } from './atlas/terrain-texture-atlas';
import type { TerrainSurfaceRecord } from './terrain-render-contracts';

export interface TerrainTemplateResourceEvidence {
  readonly templateResolutions: number;
  readonly templateCacheHits: number;
}

/** Owns reusable surface templates, their compiled forms, atlas resources, and disposal. */
export class TerrainTemplateResourceOwner {
  readonly atlas?: TerrainTextureAtlas;
  private readonly templatesByKey = new Map<string, readonly SurfaceFaceTemplate[]>();
  private readonly compiledByTemplates = new WeakMap<
    readonly SurfaceFaceTemplate[],
    readonly PrecompiledTerrainFace[]
  >();
  private readonly identityByTemplates = new WeakMap<readonly SurfaceFaceTemplate[], number>();
  private nextIdentity = 1;
  private resolutionCount = 0;
  private cacheHitCount = 0;

  constructor(
    atlasMode: TerrainAtlasMode | undefined,
    private readonly record: (name: string, delta?: number) => void,
  ) {
    if (atlasMode === 'on') this.atlas = new TerrainTextureAtlas();
  }

  cacheTemplates(key: string, templates: readonly SurfaceFaceTemplate[]): void {
    if (this.templatesByKey.has(key)) return;
    const compiled = precompileTerrainTemplates(templates, this.atlas);
    this.templatesByKey.set(key, templates);
    this.compiledByTemplates.set(templates, compiled);
    this.resolutionCount += 1;
    this.record('terrainTemplateResolutions');
  }

  templatesFor(key: string): readonly SurfaceFaceTemplate[] | undefined {
    const templates = this.templatesByKey.get(key);
    if (templates) {
      this.cacheHitCount += 1;
      this.record('terrainTemplateCacheHits');
    }
    return templates;
  }

  hasTemplates(key: string): boolean {
    return this.templatesByKey.has(key);
  }

  compiledTemplates(record: TerrainSurfaceRecord): readonly PrecompiledTerrainFace[] {
    if (record.compiledTemplates) return record.compiledTemplates;
    const cached = this.compiledByTemplates.get(record.templates);
    if (cached) return cached;
    const compiled = precompileTerrainTemplates(record.templates, this.atlas);
    this.compiledByTemplates.set(record.templates, compiled);
    return compiled;
  }

  identityFor(templates: readonly SurfaceFaceTemplate[]): number {
    let identity = this.identityByTemplates.get(templates);
    if (identity === undefined) {
      identity = this.nextIdentity++;
      this.identityByTemplates.set(templates, identity);
    }
    return identity;
  }

  evidence(): TerrainTemplateResourceEvidence {
    return { templateResolutions: this.resolutionCount, templateCacheHits: this.cacheHitCount };
  }

  clear(): void {
    const geometries = new Set<SurfaceFaceTemplate['geometry']>();
    const materials = new Set<SurfaceFaceTemplate['material']>();
    for (const templates of this.templatesByKey.values())
      for (const template of templates) {
        geometries.add(template.geometry);
        materials.add(template.material);
      }
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    this.templatesByKey.clear();
    this.atlas?.clear();
    this.resolutionCount = 0;
    this.cacheHitCount = 0;
  }
}

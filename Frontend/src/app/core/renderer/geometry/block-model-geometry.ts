import * as THREE from 'three';
import { PlacedBlock } from '../../domain/project.types';
import { BlockModelResolver, ResolvedBlockModel, ResolvedElement, ResolvedFace, ResolvedModelPart } from '../../blocks/resolver';
import { texturePath } from '../../assets/vanilla/vanilla-asset-provider';
import { RenderableAssetResourceProvider } from '../../assets/content-source/content-source.types';
import { NormalizedSpecialVisualDescriptor, SpecialBlockVisualRegistry } from '../visuals/special-block-visuals';
import { PlaceableItemDefinition } from '../../blocks/placement-palette/placeable-item';
import { createFluidGeometry } from '../fluids/fluid-geometry';
import { fluidKindForBlockId, FluidWorldLookup } from '../fluids/fluid-state';
import { resolveResourceLocation, resourcePath } from '../../content/resource-location';

export type BlockRenderMode = 'real' | 'partial' | 'fallback';
export type BlockRenderDiagnosticCode = 'MODEL_NOT_FOUND' | 'TEXTURE_NOT_FOUND' | 'TEXTURE_DECODE_FAILED' | 'GEOMETRY_BUILD_FAILED' | 'UNKNOWN_ERROR';

export interface BlockRenderDiagnostic { readonly code: BlockRenderDiagnosticCode; readonly message: string; readonly resource?: string; }
export interface BlockVisualTrace {
  readonly texturePaths: readonly string[];
  readonly pngBytesFound: boolean;
  readonly textureDecoded: boolean;
  readonly geometryBuilt: boolean;
  readonly meshBuilt: boolean;
  readonly bounds?: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] };
}

export interface BlockVisualResult {
  readonly object?: THREE.Group;
  readonly resolved: ResolvedBlockModel;
  readonly mode: BlockRenderMode;
  readonly diagnostics: readonly BlockRenderDiagnostic[];
  readonly trace: BlockVisualTrace;
}
export interface BlockVisualWorldContext extends FluidWorldLookup {}

/**
 * Offscreen palette previews use a fixed camera. Entity-style skull models
 * expose their vanilla front on the opposite Z-facing side from that camera;
 * this correction is preview-only and never enters world placement.
 */
export function thumbnailPreviewRotationY(object: THREE.Object3D): number {
  return object.userData['specialVisualFamily'] === 'heads-skulls' ? Math.PI : 0;
}

export interface BlockVisualProvider {
  create(block: PlacedBlock, context?: BlockVisualWorldContext): Promise<BlockVisualResult>;
  thumbnailUrl(blockId: string, state: Readonly<Record<string, string>>): string | undefined;
  perspectiveThumbnail?(blockId: string, state: Readonly<Record<string, string>>): Promise<string | undefined>;
  perspectiveItemThumbnail?(item: PlaceableItemDefinition): Promise<string | undefined>;
  setSpecialVisualDescriptors?(descriptors: readonly NormalizedSpecialVisualDescriptor[]): void;
  cacheStats?(): Readonly<VisualCacheStats>;
  resourceCounts?(): Readonly<VisualResourceCounts>;
}

export interface VisualCacheStats { readonly resolvedModelCacheHits: number; readonly resolvedModelCacheMisses: number; readonly geometryCacheHits: number; readonly geometryCacheMisses: number; readonly textureCacheHits: number; readonly textureCacheMisses: number; }
export interface VisualResourceCounts { readonly resolvedModels: number; readonly geometries: number; readonly textures: number; readonly fluidTextures: number; readonly thumbnails: number; }

export class VanillaBlockVisualProvider implements BlockVisualProvider {
  private readonly resolver: BlockModelResolver;
  private readonly resolvedCache = new Map<string, ResolvedBlockModel>();
  private readonly textureCache = new Map<string, Promise<THREE.Texture | undefined>>();
  private readonly fluidTextureCache = new Map<string, THREE.Texture>();
  private readonly specialVisuals: SpecialBlockVisualRegistry;
  private readonly thumbnailCache = new Map<string, Promise<string | undefined>>();
  private readonly geometryCache = new Map<string, THREE.BufferGeometry>();
  private readonly stats = { resolvedModelCacheHits: 0, resolvedModelCacheMisses: 0, geometryCacheHits: 0, geometryCacheMisses: 0, textureCacheHits: 0, textureCacheMisses: 0 };
  private thumbnailRenderer?: THREE.WebGLRenderer;
  private grassTintCache?: Promise<number | undefined>;

  constructor(private readonly assets: RenderableAssetResourceProvider, private readonly loadTexture = (url: string) => new THREE.TextureLoader().loadAsync(url)) { this.resolver = new BlockModelResolver(assets); this.specialVisuals = new SpecialBlockVisualRegistry(assets); }

  async create(block: PlacedBlock, context?: BlockVisualWorldContext): Promise<BlockVisualResult> {
    const resolved = this.resolve(block.id, block.state);
    if (fluidKindForBlockId(block.id)) return this.createFluid(block, resolved, context);
    const resources = resolved.trace.textureResources;
    const texturePaths = resources.map(texturePath);
    const compatibleSpecial = this.specialVisuals.resolveCompatible(block);
    const diagnosticSpecial = this.specialVisuals.resolveDiagnosticFallback(block);
    const special = compatibleSpecial ?? (resolved.parts.some((part) => part.elements.length) ? undefined : diagnosticSpecial);
    if (special && (special.overrideGeneric === true || special.family === 'chests' || special.family === 'shulker-boxes' || !resolved.parts.some((part) => part.elements.length))) {
      const resource = special.textureResource?.(block);
      const resourceMap = special.textureResources?.(block) ?? (resource ? { default: resource } : {});
      const entries = Object.entries(resourceMap);
      const diagnostics: BlockRenderDiagnostic[] = [];
      const textures: Record<string, THREE.Texture | undefined> = {};
      for (const [role, pathResource] of entries) {
        const path = texturePath(pathResource);
        if (!this.assets.readBinary(path)) { diagnostics.push({ code: 'TEXTURE_NOT_FOUND', message: `Texture resource was not found: ${path}`, resource: path }); continue; }
        const loaded = await this.texture(pathResource);
        textures[role] = loaded;
        if (!loaded) diagnostics.push({ code: 'TEXTURE_DECODE_FAILED', message: `Texture could not be decoded: ${path}`, resource: path });
      }
      const texture = textures['default'] ?? textures['base'] ?? (resource ? await this.texture(resource) : undefined);
      const object = special.create(block, { texture, textures });
      object.userData['specialVisualFamily'] = special.family;
      object.updateMatrixWorld(true);
      const specialTexturePaths = entries.map(([, value]) => texturePath(value));
      const requiredTexturesReady = entries.every(([role]) => !!textures[role]);
      const knownTexturedFamily = special.family === 'beds' || special.family === 'signs' || special.family === 'chests' || special.family === 'shulker-boxes' || special.family === 'decorated-pots' || special.family === 'conduits';
      return { object, resolved, mode: knownTexturedFamily && requiredTexturesReady ? 'real' : 'partial', diagnostics, trace: { texturePaths: specialTexturePaths, pngBytesFound: entries.every(([, value]) => !!this.assets.readBinary(texturePath(value))), textureDecoded: requiredTexturesReady, geometryBuilt: true, meshBuilt: true, bounds: boxBounds(new THREE.Box3().setFromObject(object)) } };
    }
    if (!resolved.parts.some((part) => part.elements.length)) return {
      resolved, mode: 'fallback', diagnostics: [{ code: 'MODEL_NOT_FOUND', message: resolved.diagnostics.map((item) => item.message).join('; ') || `No renderable model elements for ${block.id}` }],
      trace: { texturePaths, pngBytesFound: false, textureDecoded: false, geometryBuilt: false, meshBuilt: false },
    };
    const diagnostics: BlockRenderDiagnostic[] = [];
    const textures = await Promise.all(resources.map(async (resource) => {
      const path = texturePath(resource);
      if (!this.assets.readBinary(path)) { diagnostics.push({ code: 'TEXTURE_NOT_FOUND', message: `Texture resource was not found: ${path}`, resource: path }); return undefined; }
      const texture = await this.texture(resource);
      if (!texture) diagnostics.push({ code: 'TEXTURE_DECODE_FAILED', message: `Texture could not be decoded: ${path}`, resource: path });
      return texture;
    }));
    try {
      const root = new THREE.Group();
      root.userData['blockId'] = block.id; root.userData['state'] = { ...block.state }; root.userData['diagnostics'] = resolved.diagnostics;
      for (const part of resolved.parts) root.add(await this.createPart(part, block.id));
      root.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(root);
      const mode: BlockRenderMode = diagnostics.length ? 'partial' : 'real';
      return { object: root, resolved, mode, diagnostics, trace: { texturePaths, pngBytesFound: resources.every((_, index) => !!this.assets.readBinary(texturePaths[index])), textureDecoded: textures.every(Boolean), geometryBuilt: true, meshBuilt: true, bounds: boxBounds(bounds) } };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown geometry build failure';
      return { resolved, mode: 'fallback', diagnostics: [{ code: 'GEOMETRY_BUILD_FAILED', message }], trace: { texturePaths, pngBytesFound: resources.every((_, index) => !!this.assets.readBinary(texturePaths[index])), textureDecoded: textures.every(Boolean), geometryBuilt: false, meshBuilt: false } };
    }
  }

  private async createFluid(block: PlacedBlock, resolved: ResolvedBlockModel, context?: BlockVisualWorldContext): Promise<BlockVisualResult> {
    const kind = fluidKindForBlockId(block.id)!; const resources = kind === 'water' ? ['minecraft:block/water_still', 'minecraft:block/water_flow'] : ['minecraft:block/lava_still', 'minecraft:block/lava_flow'];
    const diagnostics: BlockRenderDiagnostic[] = []; const textures = await Promise.all(resources.map(async (resource) => {
      const path = texturePath(resource); if (!this.assets.readBinary(path)) { diagnostics.push({ code: 'TEXTURE_NOT_FOUND', message: `Texture resource was not found: ${path}`, resource: path }); return undefined; }
      const texture = await this.texture(resource); if (!texture) diagnostics.push({ code: 'TEXTURE_DECODE_FAILED', message: `Texture could not be decoded: ${path}`, resource: path }); return texture;
    }));
    const geometry = createFluidGeometry(block, context); if (!geometry) return { resolved, mode: 'fallback', diagnostics: [{ code: 'GEOMETRY_BUILD_FAILED', message: `Could not build fluid geometry for ${block.id}` }], trace: { texturePaths: resources.map(texturePath), pngBytesFound: resources.every((resource) => !!this.assets.readBinary(texturePath(resource))), textureDecoded: textures.every(Boolean), geometryBuilt: false, meshBuilt: false } };
    const state = block.state['level'] ?? '0'; const flowing = geometry.flowAngle !== 0; const texture = this.staticFluidTexture(resources[flowing ? 1 : 0], textures[flowing ? 1 : 0]);
    const material = kind === 'water' ? new THREE.MeshLambertMaterial({ map: texture, color: 0x3f76e4, transparent: true, depthWrite: false, side: THREE.DoubleSide }) : new THREE.MeshLambertMaterial({ map: texture, color: 0xffffff, transparent: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry.geometry, material); const root = new THREE.Group(); root.add(mesh); root.userData['fluidKind'] = kind; root.userData['fluidLevel'] = state; root.userData['fluidFlowAngle'] = geometry.flowAngle; root.userData['fluidRenderLayer'] = kind === 'water' ? 'translucent' : 'solid';
    return { object: root, resolved, mode: diagnostics.length ? 'partial' : 'real', diagnostics, trace: { texturePaths: resources.map(texturePath), pngBytesFound: resources.every((resource) => !!this.assets.readBinary(texturePath(resource))), textureDecoded: textures.every(Boolean), geometryBuilt: true, meshBuilt: true, bounds: boxBounds(new THREE.Box3().setFromObject(root)) } };
  }

  private staticFluidTexture(resource: string, texture: THREE.Texture | undefined): THREE.Texture | undefined {
    if (!texture) return undefined;
    const cached = this.fluidTextureCache.get(resource); if (cached) return cached;
    const metadata = this.assets.readJson(`${texturePath(resource)}.mcmeta`);
    const view = staticFluidTextureView(texture, metadata); this.fluidTextureCache.set(resource, view); return view;
  }

  thumbnailUrl(blockId: string, state: Readonly<Record<string, string>>): string | undefined {
    const resolved = this.resolve(blockId, state);
    const texture = resolved.parts.flatMap((part) => part.elements).flatMap((element) => Object.values(element.faces)).find((face) => !face.texture.startsWith('#'))?.texture;
    return texture ? this.assets.textureUrl(texture) : undefined;
  }

  perspectiveThumbnail(blockId: string, state: Readonly<Record<string, string>>): Promise<string | undefined> {
    const key = `thumbnail-v2|${blockId}|${Object.entries(state).sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => `${name}=${value}`).join(',')}`;
    const cached = this.thumbnailCache.get(key); if (cached) return cached;
    const task = this.renderThumbnail(blockId, state).catch(() => this.thumbnailUrl(blockId, state));
    this.thumbnailCache.set(key, task); return task;
  }

  perspectiveItemThumbnail(item: PlaceableItemDefinition): Promise<string | undefined> {
    const key = `item-thumbnail-v2|${item.itemId}|${item.previewRecipe}|${item.previewBlocks.map((block) => `${block.id}@${block.position.x},${block.position.y},${block.position.z}|${Object.entries(block.state).sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => `${name}=${value}`).join(',')}`).join(';')}`;
    const cached = this.thumbnailCache.get(key); if (cached) return cached;
    const task = this.renderThumbnailBlocks(item.previewBlocks).then((url) => url ?? this.itemThumbnailResource(item.itemId)).catch(() => this.itemThumbnailResource(item.itemId) ?? this.thumbnailUrl(item.displayBlockId, item.defaultState));
    this.thumbnailCache.set(key, task); return task;
  }
  setSpecialVisualDescriptors(descriptors: readonly NormalizedSpecialVisualDescriptor[]): void {
    for (const descriptor of descriptors) this.specialVisuals.registerDescriptor(descriptor);
  }

  dispose(): void { for (const texture of this.textureCache.values()) void texture.then((value) => value?.dispose()); for (const texture of this.fluidTextureCache.values()) texture.dispose(); for (const geometry of this.geometryCache.values()) geometry.dispose(); this.geometryCache.clear(); this.thumbnailRenderer?.dispose(); this.thumbnailRenderer = undefined; this.thumbnailCache.clear(); this.textureCache.clear(); this.fluidTextureCache.clear(); this.resolvedCache.clear(); }

  cacheStats(): Readonly<VisualCacheStats> { return { ...this.stats }; }
  resourceCounts(): Readonly<VisualResourceCounts> { return { resolvedModels: this.resolvedCache.size, geometries: this.geometryCache.size, textures: this.textureCache.size, fluidTextures: this.fluidTextureCache.size, thumbnails: this.thumbnailCache.size }; }

  private async renderThumbnail(blockId: string, state: Readonly<Record<string, string>>): Promise<string | undefined> {
    return this.renderThumbnailBlocks([{ kind: 'resolved', id: blockId, namespace: blockId.split(':')[0] ?? 'minecraft', position: { x: 0, y: 0, z: 0 }, state }]);
  }

  private async renderThumbnailBlocks(blocks: readonly PlacedBlock[]): Promise<string | undefined> {
    if (typeof document === 'undefined') return undefined;
    const renderer = this.thumbnailRenderer ??= new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(96, 96, false); renderer.setClearColor(0x000000, 0);
    const visuals = (await Promise.all(blocks.map(async (block) => ({ block, visual: await this.create(block) })))).map(({ block, visual }) => {
      if (!visual.object) return undefined;
      visual.object.position.set(visual.object.position.x + block.position.x, visual.object.position.y + block.position.y, visual.object.position.z + block.position.z);
      visual.object.rotation.y += thumbnailPreviewRotationY(visual.object);
      return visual.object;
    }).filter((object): object is THREE.Group => !!object);
    if (!visuals.length) return undefined;
    const scene = new THREE.Scene(); scene.add(new THREE.HemisphereLight(0xffffff, 0x59636f, 3.1)); const keyLight = new THREE.DirectionalLight(0xffffff, 1.45); keyLight.position.set(4, 6, 5); scene.add(keyLight); for (const object of visuals) scene.add(object);
    const bounds = new THREE.Box3(); for (const object of visuals) bounds.expandByObject(object); if (!validBounds(bounds)) return undefined; const center = bounds.getCenter(new THREE.Vector3()); const size = Math.max(...bounds.getSize(new THREE.Vector3()).toArray(), .5);
    const camera = new THREE.PerspectiveCamera(35, 1, .1, 20); camera.position.copy(center).add(new THREE.Vector3(size * 1.7, size * 1.35, size * 1.7)); camera.lookAt(center);
    renderer.render(scene, camera); for (const object of visuals) scene.remove(object);
    return renderer.domElement.toDataURL('image/png');
  }

  private itemThumbnailResource(itemId: string): string | undefined {
    const resource = itemVisualResource(this.assets, itemId);
    return resource ? this.assets.textureUrl?.(resource) : undefined;
  }

  private resolve(blockId: string, state: Readonly<Record<string, string>>): ResolvedBlockModel {
    const key = `${blockId}|${Object.entries(state).sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => `${name}=${value}`).join(',')}`;
    const cached = this.resolvedCache.get(key); if (cached) { this.stats.resolvedModelCacheHits += 1; return cached; }
    this.stats.resolvedModelCacheMisses += 1;
    const resolved = this.resolver.resolve(blockId, state, key); this.resolvedCache.set(key, resolved); return resolved;
  }

  private async createPart(part: ResolvedModelPart, blockId: string): Promise<THREE.Group> {
    const model = new THREE.Group();
    model.userData['model'] = part.model; model.userData['uvlock'] = part.transform.uvlock; model.userData['ambientOcclusion'] = part.ambientOcclusion;
    for (const element of part.elements) model.add(await this.createElement(element, part, blockId));
    if (part.transform.x || part.transform.y || part.transform.z) {
      const pivot = new THREE.Group(); pivot.position.set(.5, .5, .5); model.position.set(-.5, -.5, -.5); pivot.add(model);
      pivot.rotation.order = 'YXZ'; pivot.rotation.x = THREE.MathUtils.degToRad(part.transform.x); pivot.rotation.y = THREE.MathUtils.degToRad(-part.transform.y); pivot.rotation.z = THREE.MathUtils.degToRad(part.transform.z ?? 0);
      const wrapper = new THREE.Group(); wrapper.add(pivot); return wrapper;
    }
    return model;
  }

  private async createElement(element: ResolvedElement, part: ResolvedModelPart, blockId: string): Promise<THREE.Group> {
    const elementGroup = new THREE.Group();
    const origin = element.rotation ? vector(element.rotation.origin) : new THREE.Vector3();
    for (const [direction, face] of Object.entries(element.faces)) {
      const uvlockTurns = part.transform.uvlock ? -(part.transform.x + part.transform.y) / 90 : 0;
      const geometryKey = geometryCacheKey(element, direction, face, uvlockTurns, origin);
      let geometry = this.geometryCache.get(geometryKey);
      if (geometry) this.stats.geometryCacheHits += 1;
      else { this.stats.geometryCacheMisses += 1; geometry = faceGeometry(element, direction, face, uvlockTurns, origin); geometry.userData['providerOwnedGeometry'] = true; this.geometryCache.set(geometryKey, geometry); }
      const texture = await this.texture(face.texture);
      const tint = tintColorForFace(blockId, face.tintindex, await this.tintColor(blockId, face.tintindex));
      const explicitShade = element.shadeDirectionOverride !== undefined;
      const material = element.shade === false || explicitShade
        ? new THREE.MeshBasicMaterial({ map: texture, color: tint ?? 0xffffff, transparent: face.forceTranslucent === true, alphaTest: .1, side: THREE.DoubleSide })
        : new THREE.MeshLambertMaterial({ map: texture, color: tint ?? 0xffffff, transparent: face.forceTranslucent === true, alphaTest: .1, side: THREE.DoubleSide });
      if (explicitShade) {
        material.color.multiplyScalar(shadeDirectionFactor(element.shadeDirectionOverride));
        material.userData['shadeDirectionOverride'] = element.shadeDirectionOverride;
      }
      if (!texture) material.color.setHex(0xd04cff);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData['face'] = direction; mesh.userData['cullface'] = face.cullface; mesh.userData['tintindex'] = face.tintindex; mesh.userData['texture'] = face.texture;
      elementGroup.add(mesh);
    }
    if (element.rotation) {
      elementGroup.position.copy(origin);
      if (element.rotation.rotations?.length) {
        elementGroup.rotation.order = 'ZYX';
        for (const rotation of element.rotation.rotations) elementGroup.rotation[rotation.axis] = THREE.MathUtils.degToRad(rotation.angle);
      } else if (element.rotation.axis && element.rotation.angle !== undefined) {
        elementGroup.rotation[element.rotation.axis] = THREE.MathUtils.degToRad(element.rotation.angle);
      }
      if (element.rotation.rescale && element.rotation.axis && element.rotation.angle !== undefined) {
        const scale = 1 / Math.cos(THREE.MathUtils.degToRad(element.rotation.angle));
        if (element.rotation.axis !== 'x') elementGroup.scale.x = scale;
        if (element.rotation.axis !== 'y') elementGroup.scale.y = scale;
        if (element.rotation.axis !== 'z') elementGroup.scale.z = scale;
      }
    }
    return elementGroup;
  }

  private texture(resource: string): Promise<THREE.Texture | undefined> {
    const cached = this.textureCache.get(resource); if (cached) { this.stats.textureCacheHits += 1; return cached; }
    this.stats.textureCacheMisses += 1;
    const url = this.assets.textureUrl(resource);
    const loading = url ? this.loadTexture(url).then((texture) => {
      texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter; texture.generateMipmaps = false; texture.colorSpace = THREE.SRGBColorSpace; return texture;
    }).catch(() => { this.textureCache.delete(resource); return undefined; }) : Promise.resolve(undefined);
    this.textureCache.set(resource, loading); return loading;
  }

  private tintColor(blockId: string, _tintIndex: number | undefined): Promise<number | undefined> {
    if (!isGrassTintBlock(blockId)) return Promise.resolve(undefined);
    return this.grassTintCache ??= this.sampleGrassTint();
  }

  private async sampleGrassTint(): Promise<number | undefined> {
    const texture = await this.texture('minecraft:colormap/grass');
    return texture ? sampleGrassColormap(texture) : undefined;
  }
}

/** Resolves the first statically declared inventory texture for an Item. This
 * intentionally supports only data-driven item formats; runtime renderers are
 * left unresolved instead of being guessed. */
export function itemVisualResource(provider: Pick<RenderableAssetResourceProvider, 'readJson'>, itemId: string): string | undefined {
  const location = resolveResourceLocation(itemId);
  if (!location) return undefined;
  const [namespace, name] = location.split(':', 2);
  const modernPath = `assets/${namespace}/items/${name}.json`;
  const legacyPath = `assets/${namespace}/models/item/${name}.json`;
  const raw = provider.readJson(modernPath) ?? provider.readJson(legacyPath);
  const directTextures = isRecord(raw) && isRecord(raw['textures']) ? raw['textures'] : undefined;
  if (directTextures) for (const key of Object.keys(directTextures).filter((key) => /^layer\d+$/.test(key)).sort()) {
    const value = directTextures[key]; if (typeof value === 'string') return resolveResourceLocation(value, namespace) ?? value;
  }
  const model = modelReference(raw) ?? `${namespace}:item/${name}`;
  const visited = new Set<string>();
  const visit = (modelId: string): string | undefined => {
    const normalized = resolveResourceLocation(modelId, namespace) ?? modelId;
    const path = resourcePath(normalized, 'models') ?? `assets/${namespace}/models/${normalized.split(':').at(-1)}.json`;
    if (visited.has(path)) return undefined;
    visited.add(path);
    const document = provider.readJson(path);
    if (!isRecord(document)) return undefined;
    const textures = isRecord(document['textures']) ? document['textures'] : {};
    for (const key of Object.keys(textures).filter((key) => /^layer\d+$/.test(key)).sort()) {
      const value = textures[key]; if (typeof value === 'string') return resolveResourceLocation(value, normalized.split(':')[0]) ?? value;
    }
    if (typeof document['parent'] === 'string') return visit(document['parent']);
    return undefined;
  };
  return model ? visit(model) : undefined;
}

function modelReference(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value['model'] === 'string') return value['model'];
  const model = value['model'];
  return isRecord(model) && typeof model['model'] === 'string' ? model['model'] : undefined;
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }

/** Deterministic face-lighting approximation for the target's explicit shade direction. */
export function shadeDirectionFactor(direction: string): number {
  switch (direction) {
    case 'up': return 1;
    case 'down': return .7;
    case 'north':
    case 'south': return .85;
    case 'east':
    case 'west': return .9;
    default: return 1;
  }
}

export function isGrassTintBlock(blockId: string): boolean {
  return blockId === 'minecraft:grass_block' || blockId === 'minecraft:short_grass' || blockId === 'minecraft:tall_grass';
}

export function tintColorForFace(blockId: string, tintIndex: number | undefined, grassColor: number | undefined): number | undefined {
  return tintIndex === undefined || !isGrassTintBlock(blockId) ? undefined : grassColor;
}

export function grassColormapSampleCoordinate(width: number, height: number, temperature = 0.5, humidity = 1): readonly [number, number] {
  const effectiveHumidity = humidity * temperature;
  return [Math.floor((1 - temperature) * Math.max(width - 1, 0)), Math.floor((1 - effectiveHumidity) * Math.max(height - 1, 0))];
}

export function sampleGrassColormap(texture: THREE.Texture): number | undefined {
  const image = texture.image as { readonly width?: number; readonly height?: number; readonly data?: ArrayLike<number> } | undefined;
  const width = image?.width ?? 0; const height = image?.height ?? 0;
  if (!image || !width || !height) return undefined;
  const source = image;
  const [x, y] = grassColormapSampleCoordinate(width, height);
  if (source.data && source.data.length >= width * height * 4) {
    const offset = (y * width + x) * 4;
    return ((source.data[offset] ?? 255) << 16) | ((source.data[offset + 1] ?? 255) << 8) | (source.data[offset + 2] ?? 255);
  }
  if (typeof document === 'undefined') return undefined;
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d'); if (!context) return undefined;
  context.drawImage(source as CanvasImageSource, 0, 0);
  const pixel = context.getImageData(x, y, 1, 1).data;
  return (pixel[0] << 16) | (pixel[1] << 8) | pixel[2];
}

/** Returns a nearest-filtered view of animation frame zero without changing the shared cache texture. */
export function staticFluidTextureView(texture: THREE.Texture, metadata?: unknown): THREE.Texture {
  const view = texture.clone();
  const image = view.image as { readonly width?: number; readonly height?: number } | undefined;
  const width = image?.width ?? 0; const height = image?.height ?? 0;
  const animation = recordValue(recordValue(metadata)['animation']);
  const explicitHeight = typeof animation['height'] === 'number' && animation['height'] > 0 ? animation['height'] : undefined;
  const frameHeight = explicitHeight ?? (width > 0 && height > width ? width : height);
  const frameIndex = Array.isArray(animation['frames']) && animation['frames'].length > 0 ? frameIndexValue(animation['frames'][0]) : 0;
  if (height > frameHeight && frameHeight > 0) {
    const frameCount = Math.max(1, Math.floor(height / frameHeight));
    const index = Math.min(Math.max(frameIndex, 0), frameCount - 1);
    view.repeat.set(1, frameHeight / height); view.offset.set(0, 1 - ((index + 1) * frameHeight) / height); view.wrapS = THREE.ClampToEdgeWrapping; view.wrapT = THREE.ClampToEdgeWrapping;
  }
  view.magFilter = THREE.NearestFilter; view.minFilter = THREE.NearestFilter; view.generateMipmaps = false; view.needsUpdate = true;
  return view;
}

function recordValue(value: unknown): Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function frameIndexValue(value: unknown): number { if (typeof value === 'number') return value; const frame = recordValue(value); return typeof frame['index'] === 'number' ? frame['index'] : 0; }

function validBounds(bounds: THREE.Box3): boolean { const size = bounds.getSize(new THREE.Vector3()); return bounds.min.toArray().every(Number.isFinite) && bounds.max.toArray().every(Number.isFinite) && size.lengthSq() > 0; }

function geometryCacheKey(element: ResolvedElement, direction: string, face: ResolvedFace, uvlockTurns: number, origin: THREE.Vector3): string {
  return JSON.stringify({ from: element.from, to: element.to, elementRotation: element.rotation, direction, uv: face.uv, rotation: face.rotation ?? 0, uvlockTurns, origin: [origin.x, origin.y, origin.z] });
}

function boxBounds(bounds: THREE.Box3): { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] } {
  return { min: [bounds.min.x, bounds.min.y, bounds.min.z], max: [bounds.max.x, bounds.max.y, bounds.max.z] };
}

export function faceGeometry(element: ResolvedElement, direction: string, face: ResolvedFace, uvlockTurns = 0, origin = new THREE.Vector3()): THREE.BufferGeometry {
  const [x1, y1, z1] = element.from.map((value) => value / 16) as [number, number, number];
  const [x2, y2, z2] = element.to.map((value) => value / 16) as [number, number, number];
  const positions = facePositions(direction, x1, y1, z1, x2, y2, z2).flatMap((position) => [position[0] - origin.x, position[1] - origin.y, position[2] - origin.z]);
  const [u1, v1, u2, v2] = face.uv ?? [0, 0, 16, 16];
  const uv = rotateCorners([[u1 / 16, 1 - v2 / 16], [u2 / 16, 1 - v2 / 16], [u2 / 16, 1 - v1 / 16], [u1 / 16, 1 - v1 / 16]], ((face.rotation ?? 0) / 90) + uvlockTurns).flat();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex([0, 1, 2, 0, 2, 3]); geometry.computeVertexNormals();
  return geometry;
}

function facePositions(direction: string, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): readonly (readonly [number, number, number])[] {
  switch (direction) {
    case 'north': return [[x2, y1, z1], [x1, y1, z1], [x1, y2, z1], [x2, y2, z1]];
    case 'south': return [[x1, y1, z2], [x2, y1, z2], [x2, y2, z2], [x1, y2, z2]];
    case 'west': return [[x1, y1, z1], [x1, y1, z2], [x1, y2, z2], [x1, y2, z1]];
    case 'east': return [[x2, y1, z2], [x2, y1, z1], [x2, y2, z1], [x2, y2, z2]];
    case 'down': return [[x1, y1, z1], [x2, y1, z1], [x2, y1, z2], [x1, y1, z2]];
    default: return [[x1, y2, z2], [x2, y2, z2], [x2, y2, z1], [x1, y2, z1]];
  }
}

function rotateCorners<T>(values: readonly T[], turns: number): T[] { const normalized = ((Math.round(turns) % 4) + 4) % 4; return values.map((_, index) => values[(index + normalized) % 4]); }
function vector(value: readonly [number, number, number]): THREE.Vector3 { return new THREE.Vector3(value[0] / 16, value[1] / 16, value[2] / 16); }

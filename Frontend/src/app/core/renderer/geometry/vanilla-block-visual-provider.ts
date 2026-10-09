import * as THREE from 'three';
import { PlacedBlock } from '../../domain/project.types';
import { BlockModelResolver, ResolvedBlockModel, ResolvedElement, ResolvedFace, ResolvedModelPart } from '../../blocks/resolver';
import { textureResourcePath } from '../../content/resource-location';
import { RenderableAssetResourceProvider } from '../../assets/content-source/content-source.types';
import { SpecialBlockVisualRegistry } from '../visuals/special-block-visual-registry';
import type { NormalizedSpecialVisualDescriptor } from '../visuals/special-visual-contracts';
import type { PlaceableItemDefinition } from '../../blocks/placement-palette/placeable-item.types';
import { createFluidGeometry } from '../fluids/fluid-geometry';
import { vanillaFluidRenderResolver } from '../fluids/fluid-state';
import type { OcclusionClass } from '../visibility/interior-occlusion';
import { isGrassTintBlock, sampleGrassColormap, tintColorForFace } from './block-tint-resolver';
import { staticFluidTextureView } from '../fluids/static-fluid-texture';
import { faceGeometry, modelCoordinateVector, shadeDirectionFactor } from './block-model-geometry';
import { BlockThumbnailRenderer } from '../visuals/block-thumbnail-renderer';
import type { BlockRenderDiagnostic, BlockRenderMode, BlockVisualProvider, BlockVisualResult, BlockVisualWorldContext, PerspectiveThumbnailResult, VisualCacheStats, VisualResourceCounts } from '../visuals/block-visual-provider-contract';
import { stableBlockVisualKey } from '../visuals/stable-block-visual-key';

export class VanillaBlockVisualProvider implements BlockVisualProvider {
  private readonly resolver: BlockModelResolver;
  private readonly resolvedCache = new Map<string, ResolvedBlockModel>();
  private readonly reusableKeyCache = new Map<string, string | undefined>();
  private readonly occlusionClassCache = new Map<string, OcclusionClass>();
  private readonly textureCache = new Map<string, Promise<THREE.Texture | undefined>>();
  private readonly fluidTextureCache = new Map<string, THREE.Texture>();
  private readonly specialVisuals: SpecialBlockVisualRegistry;
  private readonly geometryCache = new Map<string, THREE.BufferGeometry>();
  private readonly stats = { resolvedModelCacheHits: 0, resolvedModelCacheMisses: 0, geometryCacheHits: 0, geometryCacheMisses: 0, textureCacheHits: 0, textureCacheMisses: 0 };
  private visualLeaseCount = 0;
  private disposalRequested = false;
  private resourcesDisposed = false;
  private grassTintCache?: Promise<number | undefined>;
  private readonly thumbnails: BlockThumbnailRenderer;

  constructor(private readonly assets: RenderableAssetResourceProvider, private readonly loadTexture = (url: string) => new THREE.TextureLoader().loadAsync(url)) {
    this.resolver = new BlockModelResolver(assets);
    this.specialVisuals = new SpecialBlockVisualRegistry(assets);
    this.thumbnails = new BlockThumbnailRenderer(assets, this.specialVisuals, {
      createBlockVisual: (block) => this.create(block),
      resolveBlockModel: (blockId, state) => this.resolve(blockId, state),
      resolveItemModel: (modelId) => this.resolver.resolveModelReference(modelId),
      createModelPart: (part, blockId) => this.createPart(part, blockId),
      loadTexture: (resource) => this.texture(resource),
    });
  }

  readonly fluidRenderResolver = vanillaFluidRenderResolver;
  get fluidRenderContractKey(): string { return `vanilla-fluid-v1|${(this.assets as RenderableAssetResourceProvider & { readonly revision?: number }).revision ?? 'unknown'}`; }

  async fluidTexture(resource: string): Promise<THREE.Texture | undefined> {
    try {
      const texture = await this.texture(resource);
      return texture ? this.staticFluidTexture(resource, texture) : undefined;
    } catch {
      return undefined;
    }
  }

  async create(block: PlacedBlock, context?: BlockVisualWorldContext): Promise<BlockVisualResult> {
    const resolved = this.resolve(block.id, block.state);
    if (this.fluidRenderResolver.resolve(block, context)) return this.createFluid(block, resolved, context);
    const resources = resolved.trace.textureResources;
    const texturePaths = resources.map(textureResourcePath);
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
        const path = textureResourcePath(pathResource);
        if (!this.assets.readBinary(path)) { diagnostics.push({ code: 'TEXTURE_NOT_FOUND', message: `Texture resource was not found: ${path}`, resource: path }); continue; }
        const loaded = await this.texture(pathResource);
        textures[role] = loaded;
        if (!loaded) diagnostics.push({ code: 'TEXTURE_DECODE_FAILED', message: `Texture could not be decoded: ${path}`, resource: path });
      }
      const texture = textures['default'] ?? textures['base'] ?? (resource ? await this.texture(resource) : undefined);
      const object = special.create(block, { texture, textures });
      object.userData['specialVisualFamily'] = special.family;
      object.userData['staticBatchable'] = special.staticBatchable === true;
      object.updateMatrixWorld(true);
      const specialTexturePaths = entries.map(([, value]) => textureResourcePath(value));
      const requiredTexturesReady = entries.every(([role]) => !!textures[role]);
      const knownTexturedFamily = special.family === 'beds' || special.family === 'signs' || special.family === 'chests' || special.family === 'shulker-boxes' || special.family === 'decorated-pots' || special.family === 'conduits';
      return { object, resolved, mode: knownTexturedFamily && requiredTexturesReady ? 'real' : 'partial', diagnostics, trace: { texturePaths: specialTexturePaths, pngBytesFound: entries.every(([, value]) => !!this.assets.readBinary(textureResourcePath(value))), textureDecoded: requiredTexturesReady, geometryBuilt: true, meshBuilt: true, bounds: boxBounds(new THREE.Box3().setFromObject(object)) } };
    }
    if (!resolved.parts.some((part) => part.elements.length)) return {
      resolved, mode: 'fallback', diagnostics: [{ code: 'MODEL_NOT_FOUND', message: resolved.diagnostics.map((item) => item.message).join('; ') || `No renderable model elements for ${block.id}` }],
      trace: { texturePaths, pngBytesFound: false, textureDecoded: false, geometryBuilt: false, meshBuilt: false },
    };
    const diagnostics: BlockRenderDiagnostic[] = [];
    const textures = await Promise.all(resources.map(async (resource) => {
      const path = textureResourcePath(resource);
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

  reusableVisualKey(block: PlacedBlock): string | undefined {
    const stateKey = `${block.id}|${Object.entries(block.state).sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => `${name}=${value}`).join(',')}`;
    if (this.reusableKeyCache.has(stateKey)) return this.reusableKeyCache.get(stateKey);
    if (this.fluidRenderResolver.resolve(block)) return undefined;
    const specialKey = this.specialVisuals.reusableVisualKey(block);
    if (specialKey) { this.reusableKeyCache.set(stateKey, specialKey); return specialKey; }
    if (this.specialVisuals.resolveCompatible(block)) return undefined;
    const resolved = this.resolve(block.id, block.state);
    if (!resolved.parts.some((part) => part.elements.length)) return undefined;
    const key = `vanilla-template-v1|${stableBlockVisualKey({ id: block.id, state: block.state, parts: resolved.parts })}`;
    this.reusableKeyCache.set(stateKey, key);
    return key;
  }

  occlusionClass(block: PlacedBlock): OcclusionClass {
    const key = `occlusion-v1|${block.id}|${Object.entries(block.state).sort(([left], [right]) => left.localeCompare(right)).map(([name, value]) => `${name}=${value}`).join(',')}`;
    const cached = this.occlusionClassCache.get(key);
    if (cached) return cached;
    const result = this.resolveOcclusionClass(block);
    this.occlusionClassCache.set(key, result);
    return result;
  }

  private resolveOcclusionClass(block: PlacedBlock): OcclusionClass {
    if (block.kind !== 'resolved' || block.namespace !== 'minecraft' || this.fluidRenderResolver.resolve(block) || this.specialVisuals.resolveCompatible(block)) return 'non-occluding';
    const resolved = this.resolve(block.id, block.state);
    if (resolved.support !== 'full' || resolved.diagnostics.length !== 0 || resolved.parts.length !== 1) return 'unknown';
    const part = resolved.parts[0];
    if (part.transform.x !== 0 || part.transform.y !== 0 || part.transform.z !== undefined || part.elements.length !== 1) return 'unknown';
    const element = part.elements[0];
    if (element.rotation || element.from.some((value) => value !== 0) || element.to.some((value) => value !== 16)) return 'unknown';
    const requiredFaces = ['down', 'up', 'north', 'south', 'west', 'east'] as const;
    if (requiredFaces.some((direction) => !element.faces[direction] || element.faces[direction].forceTranslucent === true)) return 'unknown';
    return 'opaque-full-cube';
  }

  private async createFluid(block: PlacedBlock, resolved: ResolvedBlockModel, context?: BlockVisualWorldContext): Promise<BlockVisualResult> {
    const fluid = this.fluidRenderResolver.resolve(block, context); if (!fluid) return { resolved, mode: 'fallback', diagnostics: [{ code: 'MODEL_NOT_FOUND', message: `No fluid descriptor for ${block.id}` }], trace: { texturePaths: [], pngBytesFound: false, textureDecoded: false, geometryBuilt: false, meshBuilt: false } };
    const resources = [fluid.stillTexture, fluid.flowTexture];
    const diagnostics: BlockRenderDiagnostic[] = []; const textures = await Promise.all(resources.map(async (resource) => {
      const path = textureResourcePath(resource); if (!this.assets.readBinary(path)) { diagnostics.push({ code: 'TEXTURE_NOT_FOUND', message: `Texture resource was not found: ${path}`, resource: path }); return undefined; }
      const texture = await this.texture(resource); if (!texture) diagnostics.push({ code: 'TEXTURE_DECODE_FAILED', message: `Texture could not be decoded: ${path}`, resource: path }); return texture;
    }));
    const geometry = createFluidGeometry(block, context, this.fluidRenderResolver); if (!geometry) return { resolved, mode: 'fallback', diagnostics: [{ code: 'GEOMETRY_BUILD_FAILED', message: `Could not build fluid geometry for ${block.id}` }], trace: { texturePaths: resources.map(textureResourcePath), pngBytesFound: resources.every((resource) => !!this.assets.readBinary(textureResourcePath(resource))), textureDecoded: textures.every(Boolean), geometryBuilt: false, meshBuilt: false } };
    const state = block.state['level'] ?? '0'; const flowing = geometry.flowAngle !== 0; const texture = this.staticFluidTexture(resources[flowing ? 1 : 0], textures[flowing ? 1 : 0]);
    const material = new THREE.MeshLambertMaterial({ map: texture, color: fluid.tint ?? 0xffffff, transparent: fluid.renderLayer === 'translucent', opacity: fluid.opacity ?? 1, depthWrite: fluid.depthWrite, side: fluid.doubleSided ? THREE.DoubleSide : THREE.FrontSide });
    const mesh = new THREE.Mesh(geometry.geometry, material); const root = new THREE.Group(); root.add(mesh); root.userData['fluidKind'] = fluid.kind; root.userData['fluidTypeId'] = fluid.fluidTypeId; root.userData['fluidLevel'] = state; root.userData['fluidFlowAngle'] = geometry.flowAngle; root.userData['fluidRenderLayer'] = fluid.renderLayer;
    return { object: root, resolved, mode: diagnostics.length ? 'partial' : 'real', diagnostics, trace: { texturePaths: resources.map(textureResourcePath), pngBytesFound: resources.every((resource) => !!this.assets.readBinary(textureResourcePath(resource))), textureDecoded: textures.every(Boolean), geometryBuilt: true, meshBuilt: true, bounds: boxBounds(new THREE.Box3().setFromObject(root)) } };
  }

  private staticFluidTexture(resource: string, texture: THREE.Texture | undefined): THREE.Texture | undefined {
    if (!texture) return undefined;
    const cached = this.fluidTextureCache.get(resource); if (cached) return cached;
    const metadata = this.assets.readJson(`${textureResourcePath(resource)}.mcmeta`);
    const view = staticFluidTextureView(texture, metadata); this.fluidTextureCache.set(resource, view); return view;
  }

  thumbnailUrl(blockId: string, state: Readonly<Record<string, string>>): string | undefined { return this.thumbnails.thumbnailUrl(blockId, state); }
  perspectiveThumbnail(blockId: string, state: Readonly<Record<string, string>>): Promise<string | undefined> { return this.thumbnails.perspectiveThumbnail(blockId, state); }
  perspectiveItemThumbnail(item: PlaceableItemDefinition): Promise<PerspectiveThumbnailResult> { return this.thumbnails.perspectiveItemThumbnail(item); }
  perspectiveItemVisualThumbnail(itemId: string, components?: Readonly<Record<string, unknown>>): Promise<PerspectiveThumbnailResult> { return this.thumbnails.perspectiveItemVisualThumbnail(itemId, components); }
  setSpecialVisualDescriptors(descriptors: readonly NormalizedSpecialVisualDescriptor[]): void { this.specialVisuals.setDescriptors(descriptors); this.reusableKeyCache.clear(); this.occlusionClassCache.clear(); }

  retain(): void { if (!this.resourcesDisposed) this.visualLeaseCount += 1; }
  release(): void {
    if (this.visualLeaseCount > 0) this.visualLeaseCount -= 1;
    if (this.disposalRequested && this.visualLeaseCount === 0) this.disposeResources();
  }
  dispose(): void { this.disposalRequested = true; if (this.visualLeaseCount === 0) this.disposeResources(); }

  private disposeResources(): void {
    if (this.resourcesDisposed) return;
    this.resourcesDisposed = true;
    for (const texture of this.textureCache.values()) void texture.then((value) => value?.dispose());
    for (const texture of this.fluidTextureCache.values()) texture.dispose();
    for (const geometry of this.geometryCache.values()) geometry.dispose();
    this.geometryCache.clear();
    this.thumbnails.dispose();
    this.textureCache.clear(); this.fluidTextureCache.clear(); this.resolvedCache.clear(); this.reusableKeyCache.clear(); this.occlusionClassCache.clear();
  }

  cacheStats(): Readonly<VisualCacheStats> { return { ...this.stats }; }
  resourceCounts(): Readonly<VisualResourceCounts> { return { resolvedModels: this.resolvedCache.size, geometries: this.geometryCache.size, textures: this.textureCache.size, fluidTextures: this.fluidTextureCache.size, thumbnails: this.thumbnails.resourceCount() }; }

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
    const origin = element.rotation ? modelCoordinateVector(element.rotation.origin) : new THREE.Vector3();
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
      if (face.forceTranslucent === true) material.userData['minecraftForceTranslucent'] = true;
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

function geometryCacheKey(element: ResolvedElement, direction: string, face: ResolvedFace, uvlockTurns: number, origin: THREE.Vector3): string {
  return JSON.stringify({ from: element.from, to: element.to, elementRotation: element.rotation, direction, uv: face.uv, rotation: face.rotation ?? 0, uvlockTurns, origin: [origin.x, origin.y, origin.z] });
}

function boxBounds(bounds: THREE.Box3): { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] } {
  return { min: [bounds.min.x, bounds.min.y, bounds.min.z], max: [bounds.max.x, bounds.max.y, bounds.max.z] };
}

import * as THREE from 'three';
import type { PlacedBlock } from '../../domain/project.types';
import type { ResolvedBlockModel, ResolvedModelPart } from '../../blocks/resolver';
import type { RenderableAssetResourceProvider } from '../../assets/content-source/content-source.types';
import type { PlaceableItemDefinition } from '../../blocks/placement-palette/placeable-item';
import { itemVisualResource, resolveItemVisual } from './item-visual-resolver';
import type { SpecialBlockVisualRegistry } from './special-block-visuals';
import type { BlockVisualResult, PerspectiveThumbnailResult } from './block-visual-provider-contract';
import { stableBlockVisualKey } from './stable-block-visual-key';

export interface BlockThumbnailSource {
  createBlockVisual(block: PlacedBlock): Promise<BlockVisualResult>;
  resolveBlockModel(blockId: string, state: Readonly<Record<string, string>>): ResolvedBlockModel;
  resolveItemModel(modelId: string): ResolvedBlockModel;
  createModelPart(part: ResolvedModelPart, blockId: string): Promise<THREE.Group>;
  loadTexture(resource: string): Promise<THREE.Texture | undefined>;
}

/** Owns the offscreen thumbnail renderer, request caches, and generated blob URLs. */
export class BlockThumbnailRenderer {
  private readonly thumbnailCache = new Map<string, Promise<string | undefined>>();
  private readonly itemThumbnailCache = new Map<string, Promise<PerspectiveThumbnailResult>>();
  private readonly itemVisualPreviewCache = new Map<string, Promise<PerspectiveThumbnailResult>>();
  private readonly objectUrls = new Set<string>();
  private renderer?: THREE.WebGLRenderer;

  constructor(
    private readonly assets: RenderableAssetResourceProvider,
    private readonly specialVisuals: SpecialBlockVisualRegistry,
    private readonly source: BlockThumbnailSource,
  ) {}

  thumbnailUrl(blockId: string, state: Readonly<Record<string, string>>): string | undefined {
    const resolved = this.source.resolveBlockModel(blockId, state);
    const texture = resolved.parts.flatMap((part) => part.elements).flatMap((element) => Object.values(element.faces)).find((face) => !face.texture.startsWith('#'))?.texture;
    return texture ? this.assets.textureUrl(texture) : undefined;
  }

  perspectiveThumbnail(blockId: string, state: Readonly<Record<string, string>>): Promise<string | undefined> {
    const key = `thumbnail-v2|${blockId}|${stableBlockVisualKey(state)}`;
    const cached = this.thumbnailCache.get(key); if (cached) return cached;
    const task = this.renderThumbnail(blockId, state).catch(() => this.thumbnailUrl(blockId, state));
    this.thumbnailCache.set(key, task); return task;
  }

  perspectiveItemThumbnail(item: PlaceableItemDefinition): Promise<PerspectiveThumbnailResult> {
    const key = `item-thumbnail-v2|${item.itemId}|${item.previewRecipe}|${item.previewBlocks.map((block) => `${block.id}@${block.position.x},${block.position.y},${block.position.z}|${stableBlockVisualKey(block.state)}`).join(';')}`;
    const cached = this.itemThumbnailCache.get(key); if (cached) return cached;
    const task = this.renderThumbnailBlocks(item.previewBlocks).then(async (url): Promise<PerspectiveThumbnailResult> => {
      if (url) return { url, quality: 'enhanced' };
      const itemVisual = await this.renderItemVisualThumbnail(item.itemId);
      return itemVisual.quality === 'enhanced' ? itemVisual : { url: itemVisual.url ?? this.itemThumbnailResource(item.itemId), quality: 'fallback' };
    }).catch((): PerspectiveThumbnailResult => ({ url: this.itemThumbnailResource(item.itemId) ?? this.thumbnailUrl(item.displayBlockId, item.defaultState), quality: 'fallback', retryable: true }));
    const tracked = task.then((result) => { if (result.quality === 'fallback' && result.retryable) this.itemThumbnailCache.delete(key); return result; });
    this.itemThumbnailCache.set(key, tracked); return tracked;
  }

  perspectiveItemVisualThumbnail(itemId: string, components?: Readonly<Record<string, unknown>>): Promise<PerspectiveThumbnailResult> {
    const key = `item-visual-v1|${itemId}|${components ? stableBlockVisualKey(components) : ''}`;
    const cached = this.itemVisualPreviewCache.get(key); if (cached) return cached;
    const task = this.renderItemVisualThumbnail(itemId, components).then((result) => { if (result.quality === 'fallback' && result.retryable) this.itemVisualPreviewCache.delete(key); return result; });
    this.itemVisualPreviewCache.set(key, task); return task;
  }

  resourceCount(): number { return this.thumbnailCache.size + this.itemThumbnailCache.size + this.itemVisualPreviewCache.size; }

  dispose(): void {
    this.renderer?.dispose(); this.renderer = undefined;
    for (const url of this.objectUrls) URL.revokeObjectURL?.(url);
    this.objectUrls.clear(); this.thumbnailCache.clear(); this.itemThumbnailCache.clear(); this.itemVisualPreviewCache.clear();
  }

  private async renderThumbnail(blockId: string, state: Readonly<Record<string, string>>): Promise<string | undefined> {
    return this.renderThumbnailBlocks([{ kind: 'resolved', id: blockId, namespace: blockId.split(':')[0] ?? 'minecraft', position: { x: 0, y: 0, z: 0 }, state }]);
  }

  private async renderThumbnailBlocks(blocks: readonly PlacedBlock[]): Promise<string | undefined> {
    if (typeof document === 'undefined') return undefined;
    const renderer = this.getRenderer();
    const visuals = (await Promise.all(blocks.map(async (block) => ({ block, visual: await this.source.createBlockVisual(block) })))).map(({ block, visual }) => {
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
    return this.canvasUrl(renderer.domElement);
  }

  private itemThumbnailResource(itemId: string): string | undefined {
    const resource = itemVisualResource(this.assets, itemId);
    return resource ? this.assets.textureUrl?.(resource) : undefined;
  }

  private async renderItemVisualThumbnail(itemId: string, components?: Readonly<Record<string, unknown>>): Promise<PerspectiveThumbnailResult> {
    if (typeof document === 'undefined') return { quality: 'fallback' };
    const visual = resolveItemVisual(this.assets, itemId);
    if (visual.kind === 'unsupported') {
      const special = this.specialVisuals.resolveItemVisual(itemId, components);
      if (special) {
        const fake: PlacedBlock = { kind: 'resolved', id: itemId, namespace: itemId.split(':')[0] ?? 'minecraft', position: { x: 0, y: 0, z: 0 }, state: { rotation: '0' } };
        const resource = special.textureResource?.(fake); const texture = resource ? await this.source.loadTexture(resource) : undefined;
        if (texture) {
          const root = special.create(fake, { texture }); root.userData['specialVisualFamily'] = special.family;
          root.rotation.y += thumbnailPreviewRotationY(root);
          const url = await this.renderStandaloneObject(root);
          if (url) return { url, quality: 'enhanced', adapter: 'special-static' };
        }
      }
    }
    if (visual.kind === 'block-model' && visual.model) {
      const url = await this.renderStandaloneModel(itemId, visual.model);
      return url ? { url, quality: 'enhanced' } : { quality: 'fallback' };
    }
    if (visual.kind !== 'generated-layers' || !visual.layers.length) return { quality: 'fallback' };
    const textures = await Promise.all(visual.layers.map((layer) => this.source.loadTexture(layer)));
    if (!textures.length || textures.some((texture) => !texture)) return { quality: 'fallback', retryable: true };
    const renderer = this.getRenderer(); renderer.setSize(96, 96, false); renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene(); scene.add(new THREE.HemisphereLight(0xffffff, 0x59636f, 3)); const root = new THREE.Group();
    textures.forEach((texture, index) => { if (!texture) return; const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide }); const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 1.35), material); mesh.position.z = index * .002; root.add(mesh); });
    scene.add(root); const camera = new THREE.PerspectiveCamera(35, 1, .1, 20); camera.position.set(0, 0, 3.2); camera.lookAt(0, 0, 0); renderer.render(scene, camera); scene.remove(root); return { url: await this.canvasUrl(renderer.domElement), quality: 'enhanced' };
  }

  private async renderStandaloneObject(root: THREE.Object3D): Promise<string | undefined> {
    const renderer = this.getRenderer(); renderer.setSize(96, 96, false); renderer.setClearColor(0x000000, 0); root.updateMatrixWorld(true);
    const scene = new THREE.Scene(); scene.add(new THREE.HemisphereLight(0xffffff, 0x59636f, 3)); const key = new THREE.DirectionalLight(0xffffff, 1.45); key.position.set(4, 6, 5); scene.add(key); scene.add(root);
    const bounds = new THREE.Box3().setFromObject(root); if (!validBounds(bounds)) return undefined;
    const center = bounds.getCenter(new THREE.Vector3()); const size = Math.max(...bounds.getSize(new THREE.Vector3()).toArray(), .5);
    const camera = new THREE.PerspectiveCamera(35, 1, .1, 20); camera.position.copy(center).add(new THREE.Vector3(size * 1.7, size * 1.35, size * 1.7)); camera.lookAt(center); renderer.render(scene, camera); scene.remove(root); return this.canvasUrl(renderer.domElement);
  }

  private async renderStandaloneModel(itemId: string, modelId: string): Promise<string | undefined> {
    const resolved = this.source.resolveItemModel(modelId);
    if (!resolved.parts.some((part) => part.elements.length)) return undefined;
    const renderer = this.getRenderer(); renderer.setSize(96, 96, false); renderer.setClearColor(0x000000, 0); const root = new THREE.Group();
    for (const part of resolved.parts) root.add(await this.source.createModelPart(part, itemId));
    root.updateMatrixWorld(true); const scene = new THREE.Scene(); scene.add(new THREE.HemisphereLight(0xffffff, 0x59636f, 3)); const key = new THREE.DirectionalLight(0xffffff, 1.45); key.position.set(4, 6, 5); scene.add(key); scene.add(root);
    const bounds = new THREE.Box3().setFromObject(root); if (!validBounds(bounds)) return undefined;
    const center = bounds.getCenter(new THREE.Vector3()); const size = Math.max(...bounds.getSize(new THREE.Vector3()).toArray(), .5);
    const camera = new THREE.PerspectiveCamera(35, 1, .1, 20); camera.position.copy(center).add(new THREE.Vector3(size * 1.7, size * 1.35, size * 1.7)); camera.lookAt(center); renderer.render(scene, camera); scene.remove(root); return this.canvasUrl(renderer.domElement);
  }

  private getRenderer(): THREE.WebGLRenderer {
    const renderer = this.renderer ??= new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(96, 96, false); renderer.setClearColor(0x000000, 0); return renderer;
  }

  private canvasUrl(canvas: HTMLCanvasElement): Promise<string | undefined> {
    if (typeof canvas.toBlob === 'function' && typeof URL.createObjectURL === 'function') {
      return new Promise((resolve) => canvas.toBlob((blob) => {
        if (!blob) { resolve(undefined); return; }
        const url = URL.createObjectURL(blob); this.objectUrls.add(url); resolve(url);
      }, 'image/png'));
    }
    try { return Promise.resolve(canvas.toDataURL('image/png')); } catch { return Promise.resolve(undefined); }
  }
}

export function thumbnailPreviewRotationY(object: THREE.Object3D): number {
  return object.userData['specialVisualFamily'] === 'heads-skulls' ? Math.PI : 0;
}

function validBounds(bounds: THREE.Box3): boolean { const size = bounds.getSize(new THREE.Vector3()); return bounds.min.toArray().every(Number.isFinite) && bounds.max.toArray().every(Number.isFinite) && size.lengthSq() > 0; }

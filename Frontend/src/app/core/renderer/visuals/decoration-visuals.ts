import * as THREE from 'three';
import { PlacedDecoration } from '../../decorations/decoration.types';
import { paintingTextureResource } from '../../decorations/decoration.types';
import { decorationAabb, directionVector } from '../../decorations/placement/decoration-placement';
import type { ResolvedItemVisual } from '../geometry/block-model-geometry';
import { faceGeometry } from '../geometry/block-model-geometry';
import type { ResolvedElement, ResolvedFace } from '../../blocks/resolver';

export class DecorationTextureCache {
  private readonly textures = new Map<string, THREE.Texture>();
  constructor(
    private readonly loadUrl: (resource: string) => string | undefined,
    private readonly loader = new THREE.TextureLoader(),
    private readonly onTextureReady: () => void = () => undefined,
  ) {}
  get(resource: string): THREE.Texture | undefined {
    return this.getUrl(this.loadUrl(resource));
  }
  getUrl(url: string | undefined): THREE.Texture | undefined {
    if (!url) return undefined;
    const cached = this.textures.get(url); if (cached) return cached;
    const texture = this.loader.load(url, () => this.onTextureReady()); texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter; texture.generateMipmaps = false;
    this.textures.set(url, texture); return texture;
  }
  dispose(): void { for (const texture of this.textures.values()) texture.dispose(); this.textures.clear(); }
}

export function createDecorationVisual(
  decoration: PlacedDecoration,
  textureUrl?: (resource: string) => string | undefined,
  cache?: DecorationTextureCache,
  paintingResource?: (variantId: string) => string | undefined,
  itemResources?: (itemId: string) => readonly string[],
  itemVisual?: (itemId: string) => ResolvedItemVisual | undefined,
): THREE.Group {
  const root = new THREE.Group();
  const localCache = cache ?? (textureUrl ? new DecorationTextureCache(textureUrl) : undefined);
  if (localCache && !cache) root.userData['ownedDecorationTextureCache'] = localCache;
  root.userData['decorationInstanceId'] = decoration.instanceId;
  root.userData['decoration'] = decoration;
  const aabb = decorationAabb(decoration);
  const size = { x: aabb.max.x - aabb.min.x, y: aabb.max.y - aabb.min.y, z: aabb.max.z - aabb.min.z };
  const textureResource = decoration.kind === 'painting' ? paintingResource?.(decoration.variantId ?? 'kebab') ?? paintingTextureResource(decoration.variantId ?? 'kebab') : decoration.kind === 'glow-item-frame' ? 'minecraft:block/glow_item_frame' : 'minecraft:block/item_frame';
  const texture = localCache?.get(textureResource);
  const material = new THREE.MeshLambertMaterial({ color: decoration.kind === 'painting' ? 0xffffff : decoration.kind === 'glow-item-frame' ? 0xf4d35e : 0xb07d52, map: texture, transparent: decoration.invisible ?? false, opacity: decoration.invisible ? 0.18 : 1 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(size.x, .03), Math.max(size.y, .03), Math.max(size.z, .03)), material);
  mesh.position.set((aabb.min.x + aabb.max.x) / 2, (aabb.min.y + aabb.max.y) / 2, (aabb.min.z + aabb.max.z) / 2);
  mesh.userData['decorationInstanceId'] = decoration.instanceId;
  mesh.userData['decoration'] = decoration;
  if (decoration.kind !== 'painting' && decoration.item) {
    const itemId = decoration.item.id;
    const [namespace, ...pathParts] = itemId.split(':');
    const itemPath = pathParts.join(':');
    const d = directionVector(decoration.facing);
    const resolvedVisual = itemVisual?.(itemId);
    const model = resolvedVisual?.kind === 'block-model' ? createStaticItemModel(resolvedVisual, localCache) : undefined;
    if (model) {
      model.scale.setScalar(.42);
      const frontOffset = Math.max(size.x * Math.abs(d.x), size.y * Math.abs(d.y), size.z * Math.abs(d.z)) / 2 + .008;
      model.position.set(mesh.position.x + d.x * frontOffset, mesh.position.y + d.y * frontOffset, mesh.position.z + d.z * frontOffset);
      orientItem(model, decoration.facing, decoration.rotation ?? 0);
      applyFixedDisplayTransform(model, resolvedVisual?.displayFixed);
      model.userData['decorationItem'] = decoration.item;
      model.userData['decorationInstanceId'] = decoration.instanceId;
      root.add(model);
    }
    if (!model) {
    const resolvedResources = resolvedVisual?.layers?.length ? resolvedVisual.layers : itemResources?.(itemId);
    const resources = resolvedResources?.length ? resolvedResources : [`${namespace}:item/${itemPath}`];
    const frontOffset = Math.max(size.x * Math.abs(d.x), size.y * Math.abs(d.y), size.z * Math.abs(d.z)) / 2 + .008;
    resources.forEach((resource, layerIndex) => {
      const itemUrl = textureUrl?.(resource);
      const itemTexture = localCache?.getUrl(itemUrl);
      const item = new THREE.Mesh(new THREE.PlaneGeometry(.42, .42), new THREE.MeshLambertMaterial({ color: itemTexture ? 0xffffff : 0x8e8e8e, map: itemTexture, transparent: true, side: THREE.DoubleSide }));
      const layerOffset = frontOffset + layerIndex * .001;
      item.position.set(mesh.position.x + d.x * layerOffset, mesh.position.y + d.y * layerOffset, mesh.position.z + d.z * layerOffset);
      if (decoration.facing === 'east' || decoration.facing === 'west') item.rotation.y = Math.PI / 2;
      else if (decoration.facing === 'up') item.rotation.x = Math.PI / 2;
      else if (decoration.facing === 'down') item.rotation.x = -Math.PI / 2;
      item.rotation.z = (decoration.rotation ?? 0) * Math.PI / 4;
      item.userData['decorationInstanceId'] = decoration.instanceId;
      item.userData['decorationItem'] = decoration.item;
      item.userData['decorationItemLayer'] = layerIndex;
      applyFixedDisplayTransform(item, resolvedVisual?.displayFixed);
      root.add(item);
    });
    }
  }
  if (decoration.invisible) {
    const proxy = new THREE.Mesh(mesh.geometry.clone(), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    proxy.position.copy(mesh.position); proxy.userData['decorationInstanceId'] = decoration.instanceId; proxy.userData['decoration'] = decoration; root.add(proxy);
    mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose();
  } else root.add(mesh);
  return root;
}

function applyFixedDisplayTransform(object: THREE.Object3D, display: Readonly<Record<string, unknown>> | undefined): void {
  if (!display) return;
  const rotation = vector3(display['rotation']); if (rotation) { object.rotation.x += THREE.MathUtils.degToRad(rotation.x); object.rotation.y += THREE.MathUtils.degToRad(rotation.y); object.rotation.z += THREE.MathUtils.degToRad(rotation.z); }
  const translation = vector3(display['translation']); if (translation) object.position.add(new THREE.Vector3(translation.x / 16, translation.y / 16, translation.z / 16));
  const scale = vector3(display['scale']); if (scale) object.scale.multiply(new THREE.Vector3(scale.x, scale.y, scale.z));
}

function vector3(value: unknown): { readonly x: number; readonly y: number; readonly z: number } | undefined {
  if (!Array.isArray(value) || value.length < 3 || value.some((item) => typeof item !== 'number')) return undefined;
  return { x: Number(value[0]), y: Number(value[1]), z: Number(value[2]) };
}

function orientItem(item: THREE.Object3D, facing: PlacedDecoration['facing'], rotation: number): void {
  if (facing === 'east' || facing === 'west') item.rotation.y = Math.PI / 2;
  else if (facing === 'up') item.rotation.x = Math.PI / 2;
  else if (facing === 'down') item.rotation.x = -Math.PI / 2;
  item.rotation.z = rotation * Math.PI / 4;
}

function createStaticItemModel(visual: ResolvedItemVisual, cache: DecorationTextureCache | undefined): THREE.Group | undefined {
  if (!visual.elements?.length) return undefined;
  const root = new THREE.Group();
  for (const rawElement of visual.elements) {
    if (!isRecord(rawElement) || !isNumberArray(rawElement['from']) || !isNumberArray(rawElement['to']) || !isRecord(rawElement['faces'])) continue;
    const element: ResolvedElement = { from: rawElement['from'].slice(0, 3) as [number, number, number], to: rawElement['to'].slice(0, 3) as [number, number, number], faces: {} };
    const elementGroup = new THREE.Group();
    for (const [direction, rawFace] of Object.entries(rawElement['faces'])) {
      if (!isRecord(rawFace) || typeof rawFace['texture'] !== 'string') continue;
      const key = rawFace['texture'].startsWith('#') ? rawFace['texture'].slice(1) : rawFace['texture'];
      const texture = visual.textures?.[key] ?? rawFace['texture'];
      const face: ResolvedFace = { texture, ...(isNumberArray(rawFace['uv']) ? { uv: rawFace['uv'].slice(0, 4) as [number, number, number, number] } : {}), ...(typeof rawFace['rotation'] === 'number' ? { rotation: rawFace['rotation'] } : {}) };
      const geometry = faceGeometry(element, direction, face);
      const material = new THREE.MeshLambertMaterial({ map: cache?.get(texture), transparent: true, alphaTest: .1, side: THREE.DoubleSide });
      elementGroup.add(new THREE.Mesh(geometry, material));
    }
    const rotation = isRecord(rawElement['rotation']) ? rawElement['rotation'] : undefined;
    if (rotation && isNumberArray(rotation['origin']) && typeof rotation['axis'] === 'string' && typeof rotation['angle'] === 'number') {
      elementGroup.position.set(Number(rotation['origin'][0]) / 16, Number(rotation['origin'][1]) / 16, Number(rotation['origin'][2]) / 16);
      elementGroup.rotation[rotation['axis'] as 'x' | 'y' | 'z'] = THREE.MathUtils.degToRad(Number(rotation['angle']));
      if (rotation['rescale'] === true) { const scale = 1 / Math.cos(THREE.MathUtils.degToRad(Number(rotation['angle']))); if (rotation['axis'] !== 'x') elementGroup.scale.x = scale; if (rotation['axis'] !== 'y') elementGroup.scale.y = scale; if (rotation['axis'] !== 'z') elementGroup.scale.z = scale; }
    }
    if (elementGroup.children.length) root.add(elementGroup);
  }
  return root.children.length ? root : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function isNumberArray(value: unknown): value is number[] { return Array.isArray(value) && value.length >= 3 && value.every((entry) => typeof entry === 'number'); }

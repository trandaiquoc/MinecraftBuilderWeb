import * as THREE from 'three';
import { PlacedDecoration } from '../../decorations/decoration.types';
import { paintingTextureResource } from '../../decorations/decoration.types';
import { decorationAabb, directionVector } from '../../decorations/placement/decoration-placement';
import type { ResolvedItemVisual } from '../geometry/block-model-geometry';

const ITEM_FRAME_SPRITE_SIZE = .42;
const ITEM_FRAME_LAYER_EPSILON = .001;
const ITEM_FRAME_FRONT_EPSILON = .008;

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
    const d = directionVector(decoration.facing);
    const resolvedVisual = itemVisual?.(itemId);
    const resolvedResources = resolvedVisual?.layers?.length ? resolvedVisual.layers : itemResources?.(itemId);
    const resources = resolvedResources?.length ? resolvedResources : [undefined];
    const frontOffset = Math.max(size.x * Math.abs(d.x), size.y * Math.abs(d.y), size.z * Math.abs(d.z)) / 2 + ITEM_FRAME_FRONT_EPSILON;
    const sprite = new THREE.Group();
    sprite.position.set(mesh.position.x + d.x * frontOffset, mesh.position.y + d.y * frontOffset, mesh.position.z + d.z * frontOffset);
    orientItemSprite(sprite, decoration.facing, decoration.rotation ?? 0);
    sprite.userData['decorationInstanceId'] = decoration.instanceId;
    sprite.userData['decorationItem'] = decoration.item;
    sprite.userData['decorationItemId'] = itemId;
    sprite.userData['itemVisualKind'] = resolvedVisual?.kind ?? (resolvedResources?.length ? 'generated-layers' : 'unsupported');
    resources.forEach((resource, layerIndex) => {
      const itemUrl = resource ? textureUrl?.(resource) : undefined;
      const itemTexture = localCache?.getUrl(itemUrl);
      const item = new THREE.Mesh(new THREE.PlaneGeometry(ITEM_FRAME_SPRITE_SIZE, ITEM_FRAME_SPRITE_SIZE), new THREE.MeshBasicMaterial({ color: itemTexture ? 0xffffff : 0x8e8e8e, map: itemTexture, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      item.position.z = layerIndex * ITEM_FRAME_LAYER_EPSILON;
      item.userData['decorationInstanceId'] = decoration.instanceId;
      item.userData['decorationItem'] = decoration.item;
      item.userData['decorationItemLayer'] = layerIndex;
      sprite.add(item);
    });
    root.add(sprite);
  }
  if (decoration.invisible) {
    const proxy = new THREE.Mesh(mesh.geometry.clone(), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    proxy.position.copy(mesh.position); proxy.userData['decorationInstanceId'] = decoration.instanceId; proxy.userData['decoration'] = decoration; root.add(proxy);
    mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose();
  } else root.add(mesh);
  return root;
}

function orientItemSprite(sprite: THREE.Object3D, facing: PlacedDecoration['facing'], rotation: number): void {
  const direction = directionVector(facing);
  const normal = new THREE.Vector3(direction.x, direction.y, direction.z).normalize();
  const facingRotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  const roll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rotation * Math.PI / 4);
  sprite.quaternion.copy(facingRotation).multiply(roll);
}

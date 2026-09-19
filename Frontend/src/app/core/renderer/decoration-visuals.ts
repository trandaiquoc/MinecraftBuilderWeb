import * as THREE from 'three';
import { PlacedDecoration } from '../decorations/decoration.types';
import { decorationAabb, directionVector } from '../decorations/decoration-placement';

const textureCache = new Map<string, THREE.Texture>();

export function createDecorationVisual(decoration: PlacedDecoration, textureUrl?: (resource: string) => string | undefined): THREE.Group {
  const root = new THREE.Group();
  root.userData['decorationInstanceId'] = decoration.instanceId;
  root.userData['decoration'] = decoration;
  const aabb = decorationAabb(decoration);
  const size = { x: aabb.max.x - aabb.min.x, y: aabb.max.y - aabb.min.y, z: aabb.max.z - aabb.min.z };
  const textureResource = decoration.kind === 'painting' ? `minecraft:painting/${decoration.variantId ?? 'kebab'}` : decoration.kind === 'glow-item-frame' ? 'minecraft:block/glow_item_frame' : 'minecraft:block/item_frame';
  const url = textureUrl?.(textureResource);
  let texture = url ? textureCache.get(url) : undefined;
  if (url && !texture) { texture = new THREE.TextureLoader().load(url); textureCache.set(url, texture); }
  if (texture) texture.magFilter = THREE.NearestFilter;
  const material = new THREE.MeshLambertMaterial({ color: decoration.kind === 'painting' ? 0xffffff : decoration.kind === 'glow-item-frame' ? 0xf4d35e : 0xb07d52, map: texture, transparent: decoration.invisible ?? false, opacity: decoration.invisible ? 0.18 : 1 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(size.x, .03), Math.max(size.y, .03), Math.max(size.z, .03)), material);
  mesh.position.set((aabb.min.x + aabb.max.x) / 2, (aabb.min.y + aabb.max.y) / 2, (aabb.min.z + aabb.max.z) / 2);
  mesh.userData['decorationInstanceId'] = decoration.instanceId;
  mesh.userData['decoration'] = decoration;
  if (decoration.kind !== 'painting') {
    const item = new THREE.Mesh(new THREE.BoxGeometry(.42, .42, .04), new THREE.MeshLambertMaterial({ color: decoration.item ? 0x6fb1ff : 0x8e8e8e }));
    const d = directionVector(decoration.facing);
    item.position.set(mesh.position.x - d.x * .04, mesh.position.y - d.y * .04, mesh.position.z - d.z * .04);
    item.userData['decorationInstanceId'] = decoration.instanceId;
    root.add(item);
  }
  if (decoration.invisible) {
    const proxy = new THREE.Mesh(mesh.geometry.clone(), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    proxy.position.copy(mesh.position); proxy.userData['decorationInstanceId'] = decoration.instanceId; proxy.userData['decoration'] = decoration; root.add(proxy);
    mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose();
  } else root.add(mesh);
  return root;
}

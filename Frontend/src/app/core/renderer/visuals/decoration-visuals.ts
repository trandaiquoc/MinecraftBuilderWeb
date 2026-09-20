import * as THREE from 'three';
import { PlacedDecoration } from '../../decorations/decoration.types';
import { decorationAabb, directionVector } from '../../decorations/decoration-placement';

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
  if (decoration.kind !== 'painting' && decoration.item) {
    const itemUrl = decoration.item && textureUrl ? (textureUrl(`${decoration.item.id.split(':')[0]}:item/${decoration.item.id.split(':').slice(1).join(':')}`) ?? textureUrl(`${decoration.item.id.split(':')[0]}:block/${decoration.item.id.split(':').slice(1).join(':')}`)) : undefined;
    let itemTexture = itemUrl ? textureCache.get(itemUrl) : undefined;
    if (itemUrl && !itemTexture) { itemTexture = new THREE.TextureLoader().load(itemUrl); textureCache.set(itemUrl, itemTexture); }
    if (itemTexture) itemTexture.magFilter = THREE.NearestFilter;
    const item = new THREE.Mesh(new THREE.PlaneGeometry(.42, .42), new THREE.MeshLambertMaterial({ color: itemTexture ? 0xffffff : 0x8e8e8e, map: itemTexture, transparent: true, side: THREE.DoubleSide }));
    const d = directionVector(decoration.facing);
    item.position.set(mesh.position.x - d.x * (decoration.invisible ? .5 : .4375), mesh.position.y - d.y * (decoration.invisible ? .5 : .4375), mesh.position.z - d.z * (decoration.invisible ? .5 : .4375));
    if (decoration.facing === 'east' || decoration.facing === 'west') item.rotation.y = Math.PI / 2;
    else if (decoration.facing === 'up') item.rotation.x = Math.PI / 2;
    else if (decoration.facing === 'down') item.rotation.x = -Math.PI / 2;
    item.rotation.z = (decoration.rotation ?? 0) * Math.PI / 4;
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

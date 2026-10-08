import * as THREE from 'three';
import { ModelPartFace, SpecialCuboidDescriptor, SpecialModelDescriptor, SpecialModelPartDescriptor } from './special-model-descriptor';

export type ModelPartUv = Readonly<Record<ModelPartFace, readonly [number, number, number, number]>>;

/** Minecraft ModelPart's unfolded cuboid atlas layout, in source texture pixels. */
export function modelPartCuboidUv(cuboid: SpecialCuboidDescriptor): ModelPartUv {
  const [u, v] = cuboid.uv;
  const [width, height, depth] = cuboid.size;
  return {
    down: [u + depth, v, u + depth + width, v + depth],
    up: [u + depth + width, v + depth, u + depth + width + width, v],
    west: [u, v + depth, u + depth, v + depth + height],
    north: [u + depth, v + depth, u + depth + width, v + depth + height],
    east: [u + depth + width, v + depth, u + depth + width + depth, v + depth + height],
    south: [u + depth + width + depth, v + depth, u + depth + width + depth + width, v + depth + height],
  };
}

/** Builds shared entity-style cuboid geometry from renderer-independent ModelPart descriptors. */
export function createSpecialModel(descriptor: SpecialModelDescriptor, texture?: THREE.Texture): THREE.Group {
  const root = new THREE.Group();
  const content = descriptor.localTransform ? new THREE.Group() : root;
  for (const part of descriptor.parts) content.add(createModelPart(part, descriptor.textureSize, texture));
  if (descriptor.localTransform) {
    const transform = descriptor.localTransform;
    // Descriptor-level translations are in block units; cuboid coordinates are model pixels.
    if (transform.translation) content.position.set(...transform.translation);
    if (transform.rotation) content.rotation.set(...transform.rotation.map((value) => THREE.MathUtils.degToRad(value)) as [number, number, number]);
    if (transform.scale) content.scale.set(...transform.scale);
    root.add(content);
  }
  return root;
}

function createModelPart(part: SpecialModelPartDescriptor, textureSize: readonly [number, number], texture: THREE.Texture | undefined): THREE.Group {
  const group = new THREE.Group();
  group.visible = part.visible ?? true;
  const pivot = part.pivot ?? [0, 0, 0];
  group.position.set(part.applyPivot ? pivot[0] / 16 : 0, part.applyPivot ? pivot[1] / 16 : 0, part.applyPivot ? pivot[2] / 16 : 0);
  const [pitch = 0, yaw = 0, roll = 0] = part.rotation ?? [];
  // This matches JOML rotationZYX(roll, yaw, pitch) used by ModelPart.
  group.quaternion.setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(pitch), THREE.MathUtils.degToRad(yaw), THREE.MathUtils.degToRad(roll), 'ZYX'));
  for (const cuboid of part.cuboids) group.add(createModelPartCuboid(cuboid, textureSize, texture));
  for (const child of part.children ?? []) group.add(createModelPart(child, textureSize, texture));
  return group;
}

function createModelPartCuboid(cuboid: SpecialCuboidDescriptor, textureSize: readonly [number, number], texture: THREE.Texture | undefined): THREE.Group {
  const group = new THREE.Group();
  const [x, y, z] = cuboid.from;
  const [width, height, depth] = cuboid.size;
  const dilation = cuboid.dilation ?? 0;
  const uv = modelPartCuboidUv(cuboid);
  // Dilation expands geometry only; the atlas footprint uses the base size.
  const minX = (x - dilation) / 16;
  const maxX = (x + width + dilation) / 16;
  const min: readonly [number, number, number] = [cuboid.mirror ? maxX : minX, (y - dilation) / 16, (z - dilation) / 16];
  const max: readonly [number, number, number] = [cuboid.mirror ? minX : maxX, (y + height + dilation) / 16, (z + depth + dilation) / 16];
  const directions: readonly ModelPartFace[] = cuboid.faces ?? ['north', 'south', 'east', 'west', 'up', 'down'];
  for (const direction of directions) {
    const geometry = specialFaceGeometry(min, max, direction, uv[direction], textureSize, cuboid.mirror === true);
    const material = new THREE.MeshLambertMaterial({ ...(texture ? { map: texture } : {}), color: texture ? 0xffffff : 0xaf3d35, transparent: true, alphaTest: .1, side: THREE.DoubleSide });
    group.add(new THREE.Mesh(geometry, material));
  }
  return group;
}

function specialFaceGeometry(min: readonly [number, number, number], max: readonly [number, number, number], direction: ModelPartFace, uv: readonly [number, number, number, number], textureSize: readonly [number, number], mirror: boolean): THREE.BufferGeometry {
  const [x1, y1, z1] = min;
  const [x2, y2, z2] = max;
  const positions = (mirror ? [...specialFacePositions(direction, x1, y1, z1, x2, y2, z2)].reverse() : specialFacePositions(direction, x1, y1, z1, x2, y2, z2)).flat();
  const [u1, v1, u2, v2] = uv;
  const [textureWidth, textureHeight] = textureSize;
  const uvCoordinates = mirror
    ? [u2 / textureWidth, 1 - v2 / textureHeight, u1 / textureWidth, 1 - v2 / textureHeight, u1 / textureWidth, 1 - v1 / textureHeight, u2 / textureWidth, 1 - v1 / textureHeight]
    : [u2 / textureWidth, 1 - v1 / textureHeight, u1 / textureWidth, 1 - v1 / textureHeight, u1 / textureWidth, 1 - v2 / textureHeight, u2 / textureWidth, 1 - v2 / textureHeight];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvCoordinates, 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  return geometry;
}

function specialFacePositions(direction: ModelPartFace, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): readonly (readonly [number, number, number])[] {
  switch (direction) {
    case 'north': return [[x2, y1, z1], [x1, y1, z1], [x1, y2, z1], [x2, y2, z1]];
    case 'south': return [[x1, y1, z2], [x2, y1, z2], [x2, y2, z2], [x1, y2, z2]];
    case 'west': return [[x1, y1, z1], [x1, y1, z2], [x1, y2, z2], [x1, y2, z1]];
    case 'east': return [[x2, y1, z2], [x2, y1, z1], [x2, y2, z1], [x2, y2, z2]];
    case 'down': return [[x1, y1, z1], [x2, y1, z1], [x2, y1, z2], [x1, y1, z2]];
    case 'up': return [[x1, y2, z2], [x2, y2, z2], [x2, y2, z1], [x1, y2, z1]];
  }
}

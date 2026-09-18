/** Renderer-independent normalized subset of Minecraft ModelPart data. */
export interface SpecialCuboidDescriptor {
  readonly id: string;
  readonly uv: readonly [number, number];
  readonly from: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  /** ModelPart cube dilation; UVs continue to use the undilated size. */
  readonly dilation?: number;
  readonly mirror?: boolean;
}

export interface SpecialModelPartDescriptor {
  readonly id: string;
  readonly cuboids: readonly SpecialCuboidDescriptor[];
  readonly pivot?: readonly [number, number, number];
  /** Apply the Java ModelPart pivot before child cuboids; legacy descriptors remain origin-based. */
  readonly applyPivot?: boolean;
  /** Minecraft ModelPart angles in pitch, yaw, roll order, measured in degrees. */
  readonly rotation?: readonly [number, number, number];
  readonly visible?: boolean;
  readonly children?: readonly SpecialModelPartDescriptor[];
}

export interface SpecialModelDescriptor {
  readonly id: string;
  readonly textureSize: readonly [number, number];
  readonly parts: readonly SpecialModelPartDescriptor[];
  readonly localTransform?: { readonly translation?: readonly [number, number, number]; readonly rotation?: readonly [number, number, number]; };
  readonly bounds?: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number]; };
}

export type ModelPartFace = 'north' | 'south' | 'east' | 'west' | 'up' | 'down';
export type ModelPartUv = Readonly<Record<ModelPartFace, readonly [number, number, number, number]>>;

/** Minecraft ModelPart's unfolded cuboid atlas layout, in source texture pixels. */
export function modelPartCuboidUv(cuboid: SpecialCuboidDescriptor): ModelPartUv {
  const [u, v] = cuboid.uv; const [width, height, depth] = cuboid.size;
  const faces: ModelPartUv = {
    north: [u + depth, v + depth, u + depth + width, v + depth + height],
    south: [u + depth + width + depth, v + depth, u + depth + width + depth + width, v + depth + height],
    west: [u, v + depth, u + depth, v + depth + height],
    east: [u + depth + width, v + depth, u + depth + width + depth, v + depth + height],
    up: [u + depth, v, u + depth + width, v + depth],
    down: [u + depth + width, v, u + depth + width + width, v + depth],
  };
  return cuboid.mirror ? { ...faces, north: faces.south, south: faces.north, east: faces.west, west: faces.east } : faces;
}

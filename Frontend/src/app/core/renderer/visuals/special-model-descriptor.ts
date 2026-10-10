/** Renderer-independent normalized subset of Minecraft ModelPart data. */
export interface SpecialCuboidDescriptor {
  readonly id: string;
  readonly uv: readonly [number, number];
  readonly from: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  /** ModelPart cube dilation; UVs continue to use the undilated size. */
  readonly dilation?: number;
  readonly mirror?: boolean;
  /** Optional ModelPart face mask; omitted means all six cuboid faces. */
  readonly faces?: readonly ModelPartFace[];
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
  /** Optional renderer-level transform in block/world units, applied around the model parts. */
  readonly localTransform?: {
    readonly translation?: readonly [number, number, number];
    readonly rotation?: readonly [number, number, number];
    readonly scale?: readonly [number, number, number];
  };
  readonly bounds?: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
}

export type ModelPartFace = 'north' | 'south' | 'east' | 'west' | 'up' | 'down';

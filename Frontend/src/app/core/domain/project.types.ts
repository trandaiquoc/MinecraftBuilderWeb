/** Current persisted project format version. Increment when the JSON shape changes. */
export const CURRENT_PROJECT_SCHEMA_VERSION = 3 as const;
export const DEFAULT_MINECRAFT_VERSION = '1.21.1' as const;
export type MinecraftVersion = string;

export type ProjectSchemaVersion = 1 | 2 | typeof CURRENT_PROJECT_SCHEMA_VERSION;

export type StructureMode = 'vanilla-structure-block' | 'huge-structure-blocks';

export interface ProjectSize {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface VoxelCoordinate {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type BlockStateValue = string;
export type BlockState = Readonly<Record<string, BlockStateValue>>;

export interface SignSide {
  readonly lines: readonly [string, string, string, string];
  /** Preserved verbatim when imported data includes Minecraft's filtered messages. */
  readonly filteredMessages?: readonly [string, string, string, string];
  readonly color: string;
  readonly glowing: boolean;
}
export interface SignBlockEntityData { readonly kind: 'sign'; readonly front: SignSide; readonly back: SignSide; readonly waxed: boolean; readonly raw?: Readonly<Record<string, unknown>>; }
export interface DecoratedPotDecorations { readonly back: string; readonly left: string; readonly right: string; readonly front: string; }
export interface DecoratedPotBlockEntityData { readonly kind: 'decorated-pot'; readonly decorations: DecoratedPotDecorations; readonly raw?: Readonly<Record<string, unknown>>; }
export type ItemContainerBlockEntityData = import('../block-entities/item-display/item-container').ItemContainerBlockEntityData;
export type ProjectBlockEntityData = Readonly<Record<string, unknown>> | SignBlockEntityData | DecoratedPotBlockEntityData | ItemContainerBlockEntityData;

export interface BlockId {
  readonly id: string;
  readonly namespace: string;
}

export interface ResolvedPlacedBlock extends BlockId {
  readonly kind: 'resolved';
  readonly position: VoxelCoordinate;
  readonly state: BlockState;
  readonly blockEntityData?: ProjectBlockEntityData;
  /** Legacy schema v1 membership. Migrated to groupIds when a project is opened. */
  readonly groupId?: string;
  readonly groupIds?: readonly string[];
}

export interface MissingPlacedBlock extends BlockId {
  readonly kind: 'missing';
  readonly position: VoxelCoordinate;
  readonly state: BlockState;
  readonly blockEntityData?: ProjectBlockEntityData;
  /** Legacy schema v1 membership. Migrated to groupIds when a project is opened. */
  readonly groupId?: string;
  readonly groupIds?: readonly string[];
}

export type PlacedBlock = ResolvedPlacedBlock | MissingPlacedBlock;

export interface ProjectGroup {
  readonly id: string;
  readonly name: string;
  readonly visible: boolean;
  readonly locked: boolean;
}

export type LayerVisibilityMode =
  | 'current-only'
  | 'current-previous'
  | 'current-next'
  | 'previous-current-next'
  | 'all-below'
  | 'whole-structure';

export interface EditorSettings {
  readonly currentY: number;
  readonly layerVisibility: LayerVisibilityMode;
  readonly referenceLayerOpacity: number;
}

export interface ProjectMetadata {
  readonly name: string;
  readonly minecraftVersion: MinecraftVersion;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProjectDocument {
  readonly schemaVersion: ProjectSchemaVersion;
  readonly id: string;
  readonly metadata: ProjectMetadata;
  readonly size: ProjectSize;
  readonly structureMode: StructureMode;
  readonly blocks: readonly PlacedBlock[];
  readonly groups: readonly ProjectGroup[];
  readonly editorSettings: EditorSettings;
  /** Entity-like decorations are kept separate from voxel blocks. Optional for v1/v2 compatibility. */
  readonly decorations?: readonly import('../decorations/decoration.types').PlacedDecoration[];
}

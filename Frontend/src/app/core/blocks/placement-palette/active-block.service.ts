import { Injectable, signal } from '@angular/core';
import { PlacedBlock } from '../../domain/project.types';
import { BlockDefinition, BlockSupportLevel } from '../catalog/block-definition.types';
import { PlaceableItemDefinition } from './placeable-item';

export interface ActiveBlock {
  readonly id: string;
  readonly itemId?: string;
  readonly placementKind?: PlaceableItemDefinition['placementKind'];
  readonly state: Readonly<Record<string, string>>;
  readonly support: BlockSupportLevel | 'unknown';
  readonly sourceId?: string;
}

@Injectable({ providedIn: 'root' })
export class ActiveBlockService {
  readonly active = signal<ActiveBlock | undefined>(undefined);

  select(definition: BlockDefinition | PlaceableItemDefinition): void {
    const item = 'itemId' in definition;
    const id = item ? definition.displayBlockId : definition.id;
    const sourceId = definition.sourceId;
    this.active.set({ id, ...(item && definition.itemId !== id ? { itemId: definition.itemId } : {}), ...(item && definition.placementKind !== 'direct' ? { placementKind: definition.placementKind } : {}), ...(sourceId ? { sourceId } : {}), state: { ...definition.defaultState }, support: definition.support });
  }

  pick(block: PlacedBlock, definition?: BlockDefinition, item?: PlaceableItemDefinition): void {
    const id = item?.displayBlockId ?? block.id;
    const sourceId = item?.sourceId ?? definition?.sourceId;
    this.active.set({ id, ...(item && item.itemId !== id ? { itemId: item.itemId } : {}), ...(item && item.placementKind !== 'direct' ? { placementKind: item.placementKind } : {}), ...(sourceId ? { sourceId } : {}), state: { ...block.state }, support: definition?.support ?? item?.support ?? (block.kind === 'missing' ? 'unknown' : 'fallback') });
  }
  set(active: ActiveBlock): void { this.active.set({ id: active.id, ...(active.itemId && active.itemId !== active.id ? { itemId: active.itemId } : {}), ...(active.placementKind ? { placementKind: active.placementKind } : {}), ...(active.sourceId ? { sourceId: active.sourceId } : {}), state: { ...active.state }, support: active.support }); }
  clear(): void { this.active.set(undefined); }
}

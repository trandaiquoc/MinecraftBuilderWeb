import { Injectable, signal } from '@angular/core';
import { PlacedBlock } from '../domain/project.types';
import { BlockDefinition, BlockSupportLevel } from './block-definition.types';

export interface ActiveBlock {
  readonly id: string;
  readonly state: Readonly<Record<string, string>>;
  readonly support: BlockSupportLevel | 'unknown';
}

@Injectable({ providedIn: 'root' })
export class ActiveBlockService {
  readonly active = signal<ActiveBlock | undefined>(undefined);

  select(definition: BlockDefinition): void {
    this.active.set({ id: definition.id, state: { ...definition.defaultState }, support: definition.support });
  }

  pick(block: PlacedBlock, definition?: BlockDefinition): void {
    this.active.set({ id: block.id, state: { ...block.state }, support: definition?.support ?? (block.kind === 'missing' ? 'unknown' : 'fallback') });
  }
  set(active: ActiveBlock): void { this.active.set({ id: active.id, state: { ...active.state }, support: active.support }); }
}

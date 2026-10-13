import { Injectable, effect, inject, signal } from '@angular/core';
import {
  ActiveBlock,
  ActiveBlockService,
} from '../../blocks/placement-palette/active-block.service';
import { WorkspaceStateService } from '../../workspace/workspace-state.service';
import { canonicalPlaceableItemId } from '../../blocks/placement-palette/placeable-item-resolution';
import { DecorationService } from '../../decorations/decoration.service';
import { BlockLibraryService } from '../../blocks/catalog/block-library.service';
import { stableValueKey } from '../../domain/stable-value-key';

export interface QuickBlockEntry extends ActiveBlock {
  readonly itemId: string;
  readonly displayName: string;
}
const slots = 10;
export const QUICK_BLOCKS_KEY_PREFIX = 'the-block-laundromat.quick-blocks.';
export const LEGACY_QUICK_BLOCKS_KEY_PREFIX = 'minecraft-builder.quick-blocks.';

/** Canonical item identity shared by Block Browser, Pick Block, and Quick Bar. */
export function activeItemId(
  active: Pick<ActiveBlock, 'id' | 'itemId'> | undefined,
  items?: readonly import('../../blocks/placement-palette/placeable-item').PlaceableItemDefinition[],
): string | undefined {
  return active ? canonicalPlaceableItemId(active.itemId ?? active.id, items) : undefined;
}

export function quickEntryMatchesActive(
  entry: Pick<QuickBlockEntry, 'id' | 'itemId' | 'state'>,
  active: Pick<ActiveBlock, 'id' | 'itemId' | 'state'> | undefined,
  available = true,
  items?: readonly import('../../blocks/placement-palette/placeable-item').PlaceableItemDefinition[],
): boolean {
  if (!active || !available) return false;
  return (
    activeItemId(active, items) === canonicalPlaceableItemId(entry.itemId || entry.id, items) &&
    quickStateKey(active.state) === quickStateKey(entry.state)
  );
}

@Injectable({ providedIn: 'root' })
export class QuickBlockBarService {
  private readonly workspace = inject(WorkspaceStateService);
  private readonly activeBlock = inject(ActiveBlockService);
  private readonly decorations = inject(DecorationService);
  private readonly library = inject(BlockLibraryService);
  readonly active = this.activeBlock.active;
  private readonly entriesState = signal<readonly QuickBlockEntry[]>([]);
  readonly entries = this.entriesState.asReadonly();
  readonly capacity = slots;
  private readonly collapsedState = signal(false);
  readonly collapsed = this.collapsedState.asReadonly();
  private activeProjectId?: string;
  constructor() {
    effect(() => {
      const id = this.workspace.project()?.id;
      if (id !== this.activeProjectId) {
        this.activeProjectId = id;
        this.entriesState.set(id ? load(id) : []);
      }
    });
  }
  has(entry: Pick<QuickBlockEntry, 'itemId' | 'id' | 'state'>): boolean {
    const itemId = this.canonical(entry.itemId || entry.id);
    const state = quickStateKey(entry.state);
    return this.entries().some(
      (item) => item.itemId === itemId && quickStateKey(item.state) === state,
    );
  }
  canAdd(entry: Pick<QuickBlockEntry, 'itemId' | 'id' | 'state'>): boolean {
    return this.has(entry) || this.entries().length < slots;
  }
  isFull(): boolean {
    return this.entries().length >= slots;
  }
  add(entry: QuickBlockEntry): boolean {
    const canonical = { ...entry, itemId: this.canonical(entry.itemId || entry.id) };
    if (this.has(canonical)) return false;
    if (this.isFull()) return false;
    this.save([...this.entries(), canonical]);
    return true;
  }
  remove(index: number): void {
    this.save(this.entries().filter((_, current) => current !== index));
  }
  toggleCollapsed(): void {
    this.collapsedState.update((value) => !value);
  }
  select(entry: QuickBlockEntry): void {
    // A persisted slot can outlive the content source that provided it. Never
    // reactivate an entry whose item definition is no longer available.
    const item = this.library.getItem(entry.itemId) ?? this.library.itemForBlock(entry.id);
    if (!item) {
      this.activeBlock.clear();
      return;
    }
    this.decorations.clearActive();
    this.activeBlock.set({ ...entry, id: item.itemId, itemId: item.itemId });
  }
  private save(entries: readonly QuickBlockEntry[]): void {
    this.entriesState.set(entries);
    const id = this.activeProjectId;
    if (!id) return;
    try {
      localStorage.setItem(key(id), JSON.stringify(entries));
    } catch {
      /* The palette remains useful for this session. */
    }
  }
  private canonical(id: string): string {
    return canonicalPlaceableItemId(id, this.library.allItems());
  }
}

function key(projectId: string): string {
  return `${QUICK_BLOCKS_KEY_PREFIX}${projectId}`;
}
function legacyKey(projectId: string): string {
  return `${LEGACY_QUICK_BLOCKS_KEY_PREFIX}${projectId}`;
}
export function quickStateKey(state: Readonly<Record<string, string>>): string {
  return stableValueKey(state);
}
function load(projectId: string): readonly QuickBlockEntry[] {
  const canonicalKey = key(projectId);
  let current: string | null;
  let raw: string | null;
  try {
    current = localStorage.getItem(canonicalKey);
    raw = current ?? localStorage.getItem(legacyKey(projectId));
  } catch {
    return [];
  }
  try {
    let value: unknown;
    try {
      value = raw ? JSON.parse(raw) : [];
    } catch {
      value = undefined;
    }
    if (current !== null && !Array.isArray(value)) {
      raw = localStorage.getItem(legacyKey(projectId));
      value = raw ? JSON.parse(raw) : [];
    }
    const entries = Array.isArray(value)
      ? value
          .filter(isPersistedQuickEntry)
          .map((entry) => {
            const itemId = canonicalPlaceableItemId(entry.itemId ?? entry.id);
            return { ...entry, id: itemId, itemId };
          })
          .slice(0, slots)
      : [];
    if (current === null && raw !== null) {
      const serialized = JSON.stringify(entries);
      try {
        localStorage.setItem(canonicalKey, serialized);
        localStorage.getItem(canonicalKey);
      } catch {
        /* The old key remains available and the in-memory entries stay usable. */
      }
    }
    return entries;
  } catch {
    return [];
  }
}
function isPersistedQuickEntry(value: unknown): value is QuickBlockEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<QuickBlockEntry>;
  const state = entry.state;
  return (
    typeof entry.id === 'string' &&
    typeof entry.displayName === 'string' &&
    (entry.itemId === undefined || typeof entry.itemId === 'string') &&
    !!state &&
    typeof state === 'object' &&
    !Array.isArray(state) &&
    Object.values(state).every((value) => typeof value === 'string')
  );
}

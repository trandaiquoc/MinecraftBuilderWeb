import { Signal, signal } from '@angular/core';
import type { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import type { PlaceableItemDefinition } from '../../blocks/placement-palette/placeable-item.types';
import { previewBlocksForItem } from '../../blocks/placement-palette/logical-placement-preview';
import type { BlockLibraryService } from '../../blocks/catalog/block-library.service';
import type { VanillaBlockVisualProvider } from '../../renderer/geometry/vanilla-block-visual-provider';
import type { PerspectiveThumbnailResult } from '../../renderer/visuals/block-visual-provider-contract';
import type { VanillaAssetProvider } from './vanilla-asset-provider';
import { ThumbnailTaskQueue, type ThumbnailTaskPriority } from './thumbnail-task-queue';

export type ThumbnailPreviewQuality = 'none' | 'fallback' | 'enhanced';
export type ThumbnailEnhancementStatus = 'idle' | 'queued' | 'running' | 'complete' | 'failed' | 'unavailable';
export interface ThumbnailPreviewState { readonly quality: ThumbnailPreviewQuality; readonly enhancement: ThumbnailEnhancementStatus; }

interface ThumbnailRuntimeState {
  readonly generation: number;
  readonly provider?: VanillaAssetProvider;
  readonly visualProvider?: VanillaBlockVisualProvider;
  readonly restoringExternalMods: boolean;
}

/** Owns thumbnail work, stale-result invalidation, URL references, and UI state. */
export class AssetThumbnailService {
  private readonly urls = new Map<string, string>();
  private readonly states = new Map<string, ThumbnailPreviewState>();
  private readonly version = signal(0);
  private readonly queue = new ThumbnailTaskQueue(4);
  private readonly epochState = signal(0);
  readonly epoch: Signal<number> = this.epochState.asReadonly();

  constructor(
    private readonly library: Pick<BlockLibraryService, 'getItem'>,
    private readonly runtime: () => ThumbnailRuntimeState,
  ) {}

  prepareBlocks(blocks: readonly BlockDefinition[]): void {
    for (const block of blocks) this.prepareBlock(block.id, block.defaultState);
  }

  prepareItems(items: readonly PlaceableItemDefinition[]): void {
    for (const item of items) this.prepareItem(item);
  }

  requestItem(item: PlaceableItemDefinition, priority: ThumbnailTaskPriority = 'visible'): void {
    const runtime = this.runtime();
    if (runtime.restoringExternalMods) return;
    const visual = runtime.visualProvider;
    if (!visual) return;
    const provider = runtime.provider;
    const generation = runtime.generation;
    const epoch = this.epochState();
    const previewState = item.previewState ?? item.defaultState;
    const previewItem = { ...item, previewBlocks: previewBlocksForItem(item, previewState) };
    const key = thumbnailIdentityForItem(generation, provider?.gameVersion ?? 'unavailable', item, previewState);
    const current = this.states.get(key);
    if (current?.quality === 'enhanced' || current?.enhancement === 'unavailable') return;
    if (this.queue.has(key)) {
      if (priority === 'selected') this.queue.promote(key, priority);
      return;
    }
    const fallback = visual.thumbnailUrl(item.displayBlockId, previewState);
    if (fallback) this.setPreview(key, fallback, 'fallback');
    if (!visual.perspectiveItemThumbnail) {
      this.setState(key, { quality: fallback ? 'fallback' : 'none', enhancement: 'unavailable' });
      return;
    }
    this.setState(key, { quality: fallback ? 'fallback' : 'none', enhancement: 'queued' });
    this.queue.enqueue(key, priority, async () => {
      if (!this.isCurrentRequest(generation, epoch, provider, visual, item, previewState, key)) return;
      this.setState(key, { quality: this.states.get(key)?.quality ?? 'none', enhancement: 'running' });
      try {
        const result = await visual.perspectiveItemThumbnail!(previewItem);
        if (!this.isCurrentRequest(generation, epoch, provider, visual, item, previewState, key)) return;
        this.applyPerspectiveResult(key, result);
      } catch {
        if (!this.isCurrentRequest(generation, epoch, provider, visual, item, previewState, key)) return;
        this.setState(key, { quality: this.states.get(key)?.quality ?? 'none', enhancement: 'failed' });
      }
    });
  }

  invalidateQueued(): void { this.queue.invalidate(); }

  prepareItem(item: PlaceableItemDefinition): void { this.requestItem(item, 'visible'); }

  prepareBlock(blockId: string, state: Readonly<Record<string, string>>): void {
    const runtime = this.runtime();
    if (runtime.restoringExternalMods) return;
    const item = this.library.getItem(blockId);
    if (item) { this.prepareItem({ ...item, defaultState: { ...state }, previewState: { ...state } }); return; }
    const visual = runtime.visualProvider;
    if (!visual) return;
    const provider = runtime.provider;
    const generation = runtime.generation;
    const epoch = this.epochState();
    const key = thumbnailKey(generation, provider?.gameVersion ?? 'unavailable', blockId, state);
    if (this.urls.has(key) && !this.queue.has(key)) return;
    const fallback = visual.thumbnailUrl(blockId, state);
    if (fallback) this.setUrl(key, fallback);
    if (visual.perspectiveThumbnail) void visual.perspectiveThumbnail(blockId, state).then((url) => {
      if (!url || !this.isCurrentBlockRequest(generation, epoch, provider, visual)) return;
      if (this.urls.get(key) === url) return;
      this.setUrl(key, url);
    }).catch(() => undefined);
  }

  urlForBlock(blockId: string, state: Readonly<Record<string, string>> = {}): string | undefined {
    const item = this.library.getItem(blockId);
    if (item) return this.urlForItem({ ...item, defaultState: { ...state }, previewState: { ...state } });
    this.version();
    const runtime = this.runtime();
    return this.urls.get(thumbnailKey(runtime.generation, runtime.provider?.gameVersion ?? 'unavailable', blockId, state));
  }

  urlForItem(item: PlaceableItemDefinition): string | undefined {
    const state = item.previewState ?? item.defaultState;
    this.version();
    return this.urls.get(this.itemKey(item, state));
  }

  stateForItem(item: PlaceableItemDefinition): ThumbnailPreviewState {
    const state = item.previewState ?? item.defaultState;
    this.version();
    return this.states.get(this.itemKey(item, state)) ?? { quality: 'none', enhancement: 'idle' };
  }

  clearForContentGeneration(): void {
    this.queue.invalidate();
    this.urls.clear();
    this.states.clear();
    this.version.update((value) => value + 1);
    this.epochState.update((value) => value + 1);
  }

  advanceEpoch(): void {
    this.queue.invalidate();
    this.epochState.update((value) => value + 1);
  }

  private itemKey(item: PlaceableItemDefinition, state: Readonly<Record<string, string>>): string {
    const runtime = this.runtime();
    return thumbnailIdentityForItem(runtime.generation, runtime.provider?.gameVersion ?? 'unavailable', item, state);
  }

  private isCurrentRequest(generation: number, epoch: number, provider: VanillaAssetProvider | undefined, visual: VanillaBlockVisualProvider, item: PlaceableItemDefinition, state: Readonly<Record<string, string>>, key: string): boolean {
    const runtime = this.runtime();
    return generation === runtime.generation && epoch === this.epochState()
      && provider === runtime.provider && visual === runtime.visualProvider && key === this.itemKey(item, state);
  }

  private isCurrentBlockRequest(generation: number, epoch: number, provider: VanillaAssetProvider | undefined, visual: VanillaBlockVisualProvider): boolean {
    const runtime = this.runtime();
    return generation === runtime.generation && epoch === this.epochState() && provider === runtime.provider && visual === runtime.visualProvider;
  }

  private setUrl(key: string, url: string): void {
    if (this.urls.get(key) === url) return;
    this.urls.set(key, url);
    this.version.update((value) => value + 1);
  }

  private setPreview(key: string, url: string, quality: ThumbnailPreviewQuality): void {
    this.setUrl(key, url);
    const current = this.states.get(key);
    this.setState(key, { quality, enhancement: current?.enhancement ?? 'idle' });
  }

  private setState(key: string, state: ThumbnailPreviewState): void {
    const previous = this.states.get(key);
    if (previous?.quality === state.quality && previous.enhancement === state.enhancement) return;
    this.states.set(key, state);
    this.version.update((value) => value + 1);
  }

  private applyPerspectiveResult(key: string, result: PerspectiveThumbnailResult): void {
    const current = this.states.get(key);
    if (result.url && result.quality === 'enhanced') this.setPreview(key, result.url, 'enhanced');
    else if (result.url && current?.quality !== 'enhanced') this.setPreview(key, result.url, 'fallback');
    const quality = result.quality === 'enhanced' && result.url ? 'enhanced' : current?.quality ?? 'none';
    this.setState(key, { quality, enhancement: result.quality === 'enhanced' && result.url ? 'complete' : result.retryable ? 'failed' : 'unavailable' });
  }
}

export function thumbnailKey(generation: number, gameVersion: string, blockId: string, state: Readonly<Record<string, string>>, recipe = 'single', concreteBlockIds: readonly string[] = []): string {
  const serializedState = Object.entries(state).sort(([left], [right]) => left.localeCompare(right)).map(([name, value]) => `${name}=${value}`).join(',');
  return `thumbnail-v6|${generation}|${gameVersion}|item-preview-v3|${recipe}|${blockId}|${concreteBlockIds.slice().sort().join(',')}|${serializedState}`;
}

export function thumbnailIdentityForItem(generation: number, gameVersion: string, item: Pick<PlaceableItemDefinition, 'itemId' | 'previewRecipe' | 'concreteBlockIds'>, previewState: Readonly<Record<string, string>>): string {
  return thumbnailKey(generation, gameVersion, item.itemId, previewState, item.previewRecipe, item.concreteBlockIds);
}

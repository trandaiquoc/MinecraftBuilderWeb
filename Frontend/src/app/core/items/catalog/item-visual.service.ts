import { Injectable, inject, signal } from '@angular/core';
import type { ItemStackData } from '../item-stack.types';
import type { ItemCatalogEntry, ItemVisualInfo } from './item-catalog';
import { resolveCatalogItemVisual } from './item-visual';
import { VanillaAssetsService } from '../../assets/vanilla/vanilla-assets.service';

export type ItemVisualLoadState = 'idle' | 'queued' | 'loading' | 'available' | 'unsupported' | 'missing-resource' | 'error';
export interface ItemVisualState {
  readonly status: ItemVisualLoadState;
  readonly info?: ItemVisualInfo;
  readonly diagnostics: readonly string[];
  readonly generation: number;
}

interface WorkItem { readonly key: string; readonly itemId: string; readonly components?: Readonly<Record<string, unknown>>; readonly generation: number; readonly priority: 'high' | 'normal'; readonly resolve: (info: ItemVisualInfo) => void; readonly reject: (error: unknown) => void; }

/** Demand-driven static Item visual cache. The identity catalog never calls this service. */
@Injectable({ providedIn: 'root' })
export class ItemVisualService {
  private readonly assets = inject(VanillaAssetsService);
  private readonly cache = new Map<string, ItemVisualInfo>();
  private readonly states = new Map<string, ItemVisualState>();
  private readonly pending = new Map<string, Promise<ItemVisualInfo>>();
  private readonly queue: WorkItem[] = [];
  private running = 0;
  private generation = -1;
  readonly revision = signal(0);

  state(item: string | ItemStackData | ItemCatalogEntry): ItemVisualState {
    this.ensureGeneration();
    const itemId = typeof item === 'string' ? item : item.id;
    const key = this.key(item);
    return this.states.get(key) ?? { status: 'idle', diagnostics: [], generation: this.generation };
  }

  request(item: string | ItemStackData | ItemCatalogEntry, priority: 'high' | 'normal' = 'normal'): Promise<ItemVisualInfo> {
    this.ensureGeneration();
    const itemId = typeof item === 'string' ? item : item.id;
    const key = this.key(item);
    const cached = this.cache.get(key);
    if (cached) return Promise.resolve(cached);
    const existing = this.pending.get(key);
    if (existing) return existing;
    this.setState(key, { status: 'queued', diagnostics: [], generation: this.generation });
    const promise = new Promise<ItemVisualInfo>((resolve, reject) => {
      const components = typeof item === 'string' || !('components' in item) ? undefined : item.components;
      this.queue.push({ key, itemId, components, generation: this.generation, priority, resolve, reject });
      this.queue.sort((left, right) => (left.priority === right.priority ? 0 : left.priority === 'high' ? -1 : 1));
      this.pump();
    });
    this.pending.set(key, promise);
    return promise;
  }

  invalidate(): void {
    this.generation = this.assets.generation();
    for (const work of this.queue.splice(0)) work.reject(new Error('stale item visual request'));
    this.cache.clear();
    this.pending.clear();
    this.states.clear();
    this.revision.update((value) => value + 1);
  }

  private ensureGeneration(): void {
    const generation = this.assets.generation();
    if (this.generation === -1) { this.generation = generation; return; }
    if (generation !== this.generation) this.invalidate();
  }

  private pump(): void {
    while (this.running < 4 && this.queue.length) {
      const work = this.queue.shift()!;
      if (work.generation !== this.generation) { work.reject(new Error('stale item visual request')); continue; }
      this.running += 1;
      this.setState(work.key, { status: 'loading', diagnostics: [], generation: work.generation });
      Promise.resolve().then(async () => {
        const info = resolveCatalogItemVisual(this.assets.sources.resources, work.itemId);
        const visualProvider = this.assets.visualProvider();
        const rasterizer = visualProvider?.perspectiveItemVisualThumbnail;
        if (!rasterizer) return info;
        const preview = work.components === undefined
          ? await rasterizer.call(visualProvider, work.itemId)
          : await rasterizer.call(visualProvider, work.itemId, work.components);
        if (!preview.url || (info.kind === 'unsupported' && !preview.adapter)) return info;
        const kind = preview.adapter ?? info.kind;
        const adapter: NonNullable<NonNullable<ItemVisualInfo['trace']>['adapter']> = kind === 'special-static' ? 'special-static' : kind === 'generated-layers' ? 'generated-layers' : kind === 'block-model' ? 'static-model' : 'runtime-unsupported';
        return {
          ...info,
          kind,
          status: 'available' as const,
          previewUrls: [preview.url],
          trace: info.trace ? { ...info.trace, adapter, previewStatus: 'available' as const } : info.trace,
        };
      }).then((info) => {
        if (work.generation !== this.generation) { work.reject(new Error('stale item visual request')); return; }
        this.cache.set(work.key, info);
        const status: ItemVisualLoadState = info.status === 'available' ? 'available' : info.status === 'unsupported' ? 'unsupported' : 'missing-resource';
        this.setState(work.key, { status, info, diagnostics: info.diagnostics, generation: work.generation });
        work.resolve(info);
      }).catch((error) => {
        if (work.generation === this.generation) this.setState(work.key, { status: 'error', diagnostics: [error instanceof Error ? error.message : String(error)], generation: work.generation });
        work.reject(error);
      }).finally(() => { this.pending.delete(work.key); this.running -= 1; this.pump(); });
    }
  }

  private key(item: string | ItemStackData | ItemCatalogEntry): string {
    if (typeof item === 'string') return `${this.generation}|${item}`;
    if ('components' in item && item.components) return `${this.generation}|${item.id}|${stableVisualComponents(item.components)}`;
    return `${this.generation}|${item.id}`;
  }

  private setState(key: string, state: ItemVisualState): void { this.states.set(key, state); this.revision.update((value) => value + 1); }
}

/** Stable component identity for visual caches. Unknown components are retained
 * deliberately: a future adapter may make any component visual-significant. */
export function stableVisualComponents(components: Readonly<Record<string, unknown>>): string {
  return stableVisualValue(components);
}

function stableVisualValue(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableVisualValue).join(',')}]`;
  const record = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableVisualValue(record[key])}`).join(',')}}`;
}

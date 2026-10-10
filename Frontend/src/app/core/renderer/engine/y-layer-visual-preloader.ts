import type { PlacedBlock } from '../../domain/project.types';
import { yieldToBrowser } from '../../assets/cooperative-yield';

export const Y_LAYER_PRELOAD_SLICE_MS = 6;
export const Y_LAYER_PRELOAD_MAX_VARIANTS = 4096;
export const Y_LAYER_PRELOAD_MAX_TEMPLATE_BYTES = 64 * 1024 * 1024;

export type YLayerVisualPreloadState = 'idle' | 'preparing' | 'templates-ready' | 'partial' | 'cancelled' | 'failed';

export interface YLayerVisualPreloadEvidence {
  readonly state: YLayerVisualPreloadState;
  readonly blocksTotal: number;
  readonly blocksVisited: number;
  readonly layersTotal: number;
  /** Layers whose reusable visual templates are available, not GPU-ready presentations. */
  readonly layersReady: number;
  readonly templateState: 'idle' | 'preparing' | 'ready' | 'partial' | 'cancelled' | 'failed';
  readonly representationState: 'viewport-lazy';
  readonly gpuPresentationState: 'viewport-dependent';
  readonly reusableVariantsPrepared: number;
  readonly reusableVariantsReused: number;
  readonly reusableVariantsSkipped: number;
  readonly estimatedTemplateBytes: number;
}

interface PreloadResource<T> {
  readonly value: T;
  readonly estimatedBytes: number;
  readonly alreadyCached?: boolean;
}

export interface YLayerVisualPreloaderPorts<T> {
  readonly hasCached: (key: string) => boolean;
  readonly reusableKey: (block: PlacedBlock) => string | undefined;
  readonly create: (block: PlacedBlock, key: string) => Promise<PreloadResource<T> | undefined>;
  readonly commit: (key: string, resource: PreloadResource<T>) => boolean | void;
  readonly dispose: (resource: PreloadResource<T>) => void;
  readonly isCurrent: (blocks: readonly PlacedBlock[], providerGeneration: number) => boolean;
  readonly providerGeneration: () => number;
  readonly yieldToBrowser: () => Promise<void>;
  readonly now?: () => number;
}

/** Prepares reusable model resources across occupied layers without adding scene objects. */
export class YLayerVisualPreloader<T> {
  private runToken = 0;
  private active?: { readonly blocks: readonly PlacedBlock[]; readonly providerGeneration: number; readonly scopeKey: string; readonly completion: Promise<YLayerVisualPreloadEvidence> };
  private evidenceValue: YLayerVisualPreloadEvidence = emptyEvidence();

  constructor(private readonly ports: YLayerVisualPreloaderPorts<T>) {}

  get evidence(): YLayerVisualPreloadEvidence { return this.evidenceValue; }

  start(blocks: readonly PlacedBlock[], providerGeneration: number, scopeKey = ''): Promise<YLayerVisualPreloadEvidence> {
    if (this.active?.blocks === blocks && this.active.providerGeneration === providerGeneration
      && this.active.scopeKey === scopeKey && this.evidenceValue.state !== 'cancelled') return this.active.completion;

    this.cancel();
    const token = this.runToken;
    this.evidenceValue = { ...emptyEvidence(), state: 'preparing', templateState: 'preparing', blocksTotal: blocks.length };
    const completion = this.prepare(blocks, providerGeneration, token).catch(() =>
      this.finishFailed(blocks.length, token),
    );
    this.active = { blocks, providerGeneration, scopeKey, completion };
    return completion;
  }

  cancel(): void {
    this.runToken += 1;
    if (this.evidenceValue.state === 'preparing') this.evidenceValue = { ...this.evidenceValue, state: 'cancelled', templateState: 'cancelled' };
    this.active = undefined;
  }

  dispose(): void { this.cancel(); this.evidenceValue = emptyEvidence(); }

  private async prepare(blocks: readonly PlacedBlock[], providerGeneration: number, token: number): Promise<YLayerVisualPreloadEvidence> {
    const seenKeys = new Map<string, boolean>();
    const readyByLayer = new Map<number, number>();
    const totalByLayer = new Map<number, number>();
    const failedLayers = new Set<number>();
    let variantsPrepared = 0;
    let variantsReused = 0;
    let variantsSkipped = 0;
    let estimatedTemplateBytes = 0;
    let blocksVisited = 0;

    let sliceStartedAt: number;
    await this.ports.yieldToBrowser();
    sliceStartedAt = this.currentTime();
    for (let index = 0; index < blocks.length; index += 1) {
      if (index % 128 === 0) {
        if (index > 0 && this.currentTime() - sliceStartedAt >= Y_LAYER_PRELOAD_SLICE_MS) {
          this.publishProgress(blocks.length, blocksVisited, totalByLayer, readyByLayer, failedLayers, variantsPrepared, variantsReused, variantsSkipped, estimatedTemplateBytes);
          if (!this.isCurrent(blocks, providerGeneration, token)) return this.finishCancelled(blocks.length, token);
          await this.ports.yieldToBrowser();
          sliceStartedAt = this.currentTime();
        } else if (!this.isCurrent(blocks, providerGeneration, token)) {
          return this.finishCancelled(blocks.length, token);
        }
      }
      const block = blocks[index];
      const layer = block.position.y;
      totalByLayer.set(layer, (totalByLayer.get(layer) ?? 0) + 1);
      blocksVisited += 1;
      const key = this.ports.reusableKey(block);
      if (!key) {
        failedLayers.add(layer);
        variantsSkipped += 1;
        continue;
      }

      let ready = seenKeys.get(key);
      if (ready === undefined) {
        if (this.ports.hasCached(key)) {
          ready = true;
          variantsReused += 1;
        } else if (variantsPrepared >= Y_LAYER_PRELOAD_MAX_VARIANTS || estimatedTemplateBytes >= Y_LAYER_PRELOAD_MAX_TEMPLATE_BYTES) {
          ready = false;
          variantsSkipped += 1;
        } else {
          let resource: PreloadResource<T> | undefined;
          try {
            resource = await this.ports.create(block, key);
          } catch {
            resource = undefined;
          }
          if (!this.isCurrent(blocks, providerGeneration, token)) {
            if (resource && !resource.alreadyCached) this.ports.dispose(resource);
            return this.finishCancelled(blocks.length, token);
          }
          const fitsBudget = !!resource
            && variantsPrepared < Y_LAYER_PRELOAD_MAX_VARIANTS
            && estimatedTemplateBytes + resource.estimatedBytes <= Y_LAYER_PRELOAD_MAX_TEMPLATE_BYTES;
          if (resource && fitsBudget) {
            let committed = resource.alreadyCached === true;
            try {
              if (!committed) committed = this.ports.commit(key, resource) !== false;
            } catch (error) {
              if (!resource.alreadyCached) this.ports.dispose(resource);
              throw error;
            }
            if (committed) {
              estimatedTemplateBytes += resource.estimatedBytes;
              variantsPrepared += 1;
              ready = true;
            } else {
              this.ports.dispose(resource);
              ready = false;
              variantsSkipped += 1;
            }
          } else {
            if (resource && !resource.alreadyCached) this.ports.dispose(resource);
            ready = false;
            variantsSkipped += 1;
          }
        }
        seenKeys.set(key, ready);
      }

      if (ready) readyByLayer.set(layer, (readyByLayer.get(layer) ?? 0) + 1);
      else failedLayers.add(layer);
    }

    if (!this.isCurrent(blocks, providerGeneration, token)) return this.finishCancelled(blocks.length, token);
    const layersReady = countReadyLayers(totalByLayer, readyByLayer, failedLayers);
    this.evidenceValue = {
      ...this.evidenceValue,
      state: layersReady === totalByLayer.size ? 'templates-ready' : 'partial',
      templateState: layersReady === totalByLayer.size ? 'ready' : 'partial',
      representationState: 'viewport-lazy',
      gpuPresentationState: 'viewport-dependent',
      blocksVisited,
      layersTotal: totalByLayer.size,
      layersReady,
      reusableVariantsPrepared: variantsPrepared,
      reusableVariantsReused: variantsReused,
      reusableVariantsSkipped: variantsSkipped,
      estimatedTemplateBytes,
    };
    return this.evidenceValue;
  }

  private publishProgress(
    blocksTotal: number,
    blocksVisited: number,
    totalByLayer: ReadonlyMap<number, number>,
    readyByLayer: ReadonlyMap<number, number>,
    failedLayers: ReadonlySet<number>,
    variantsPrepared: number,
    variantsReused: number,
    variantsSkipped: number,
    estimatedTemplateBytes: number,
  ): void {
    this.evidenceValue = {
      state: 'preparing', templateState: 'preparing', representationState: 'viewport-lazy', gpuPresentationState: 'viewport-dependent',
      blocksTotal, blocksVisited, layersTotal: totalByLayer.size,
      layersReady: countReadyLayers(totalByLayer, readyByLayer, failedLayers),
      reusableVariantsPrepared: variantsPrepared, reusableVariantsReused: variantsReused,
      reusableVariantsSkipped: variantsSkipped, estimatedTemplateBytes,
    };
  }

  private isCurrent(blocks: readonly PlacedBlock[], providerGeneration: number, token: number): boolean {
    return token === this.runToken && providerGeneration === this.ports.providerGeneration()
      && this.ports.isCurrent(blocks, providerGeneration);
  }

  private currentTime(): number { return this.ports.now?.() ?? now(); }

  private finishCancelled(blocksTotal: number, token: number): YLayerVisualPreloadEvidence {
    if (token !== this.runToken) return terminalEvidence('cancelled', blocksTotal);
    if (this.evidenceValue.state === 'preparing')
      this.evidenceValue = { ...this.evidenceValue, state: 'cancelled', templateState: 'cancelled' };
    return this.evidenceValue;
  }

  private finishFailed(blocksTotal: number, token: number): YLayerVisualPreloadEvidence {
    if (token !== this.runToken) return terminalEvidence('cancelled', blocksTotal);
    if (this.evidenceValue.state === 'preparing')
      this.evidenceValue = { ...this.evidenceValue, state: 'failed', templateState: 'failed' };
    return this.evidenceValue;
  }
}

function now(): number { return typeof performance === 'undefined' ? Date.now() : performance.now(); }

function countReadyLayers(
  totalByLayer: ReadonlyMap<number, number>,
  readyByLayer: ReadonlyMap<number, number>,
  failedLayers: ReadonlySet<number>,
): number {
  let ready = 0;
  for (const [layer, total] of totalByLayer) {
    if (!failedLayers.has(layer) && readyByLayer.get(layer) === total) ready += 1;
  }
  return ready;
}

function emptyEvidence(): YLayerVisualPreloadEvidence {
  return { state: 'idle', templateState: 'idle', representationState: 'viewport-lazy', gpuPresentationState: 'viewport-dependent', blocksTotal: 0, blocksVisited: 0, layersTotal: 0, layersReady: 0, reusableVariantsPrepared: 0, reusableVariantsReused: 0, reusableVariantsSkipped: 0, estimatedTemplateBytes: 0 };
}

function terminalEvidence(
  state: 'cancelled',
  blocksTotal: number,
): YLayerVisualPreloadEvidence {
  return { ...emptyEvidence(), state, templateState: state, blocksTotal };
}

export function yieldYLayerPreloadToBrowser(): Promise<void> { return yieldToBrowser(); }

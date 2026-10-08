import * as THREE from 'three';
import type { ProjectDocument } from '../../domain/project.types';
import { isDecorationVisible } from '../../editor/groups/decoration-membership';
import type { YLayerVisibility } from '../../editor/viewport/y-layer';
import type { ProjectMetadataDecorationChange } from '../../editor/mutations/project-mutation-hint';
import type { PlacedDecoration } from '../../decorations/decoration.types';
import type { ItemStackData } from '../../items/item-stack.types';
import { applyDecorationItemPreview, createDecorationVisual, DecorationTextureCache } from './decoration-visuals';
import type { ResolvedItemVisual } from './item-visual-resolver';
import { disposeObject } from '../presentation/renderer-resource-disposal';
import { decorationRenderSignature } from './decoration-render-signature';

export interface DecorationRenderEntry {
  readonly id: string;
  readonly decoration: PlacedDecoration;
  readonly signature: string;
  readonly object: THREE.Object3D;
}

interface DecorationHydrationJob {
  readonly token: number;
  readonly id: string;
  readonly decoration: PlacedDecoration;
  readonly signature: string;
}

export interface DecorationRenderFilter {
  readonly layerY?: number;
  readonly visibility?: YLayerVisibility;
}

export interface DecorationRenderLifecyclePorts {
  readonly group: THREE.Group;
  readonly textureUrl: () => ((resource: string) => string | undefined) | undefined;
  readonly textureCache: () => DecorationTextureCache | undefined;
  readonly paintingResource: () => ((variantId: string) => string | undefined) | undefined;
  readonly itemResources: () => ((itemId: string) => readonly string[]) | undefined;
  readonly itemVisual: () => ((itemId: string) => ResolvedItemVisual | undefined) | undefined;
  readonly itemPreview: () => ((item: ItemStackData) => Promise<string | undefined>) | undefined;
  readonly isSelected: (id: string) => boolean;
  readonly providerGeneration: () => number;
  readonly scheduleRender: () => void;
  readonly scheduleHydration: () => void;
  readonly complete: (generation: number, id: string) => void;
  readonly record: (metric: DecorationRenderMetric) => void;
}

export type DecorationRenderMetric = 'decorationAdds' | 'decorationUpdates' | 'decorationRemovals' | 'decorationVisualCreations';

/** Owns placed-decoration render entries and their independent preview queue. */
export class DecorationRenderLifecycle {
  private readonly rendered = new Map<string, DecorationRenderEntry>();
  private queue: DecorationHydrationJob[] = [];
  private queueHead = 0;
  private readonly pendingSignatures = new Map<string, string>();
  private currentRevision = 0;

  constructor(private readonly ports: DecorationRenderLifecyclePorts) {}

  get revision(): number { return this.currentRevision; }
  get size(): number { return this.rendered.size; }
  get pendingCount(): number { return this.pendingSignatures.size; }
  get queuedCount(): number { return this.queue.length - this.queueHead; }

  get(id: string): Readonly<DecorationRenderEntry> | undefined { return this.rendered.get(id); }
  values(): IterableIterator<Readonly<DecorationRenderEntry>> { return this.rendered.values(); }
  keys(): IterableIterator<string> { return this.rendered.keys(); }
  hasPending(id: string): boolean { return this.pendingSignatures.has(id); }
  pendingKeys(): IterableIterator<string> { return this.pendingSignatures.keys(); }

  advanceRevision(): void { this.currentRevision += 1; }

  reconcile(project: ProjectDocument | undefined, filter: DecorationRenderFilter, generation: number, full = false): readonly PlacedDecoration[] {
    if (!project) {
      this.clear();
      return [];
    }

    const visible = (project.decorations ?? []).filter((decoration) => isVisibleInViewport(decoration, project.groups, filter));
    const byId = new Map(visible.map((decoration) => [decoration.instanceId, decoration] as const));
    this.queue = this.queue.slice(this.queueHead).filter((job) => decorationRenderSignature(byId.get(job.id)) === decorationRenderSignature(job.decoration));
    this.queueHead = 0;

    for (const [id, entry] of this.rendered) {
      if (!byId.has(id)) {
        this.remove(id, entry);
        this.pendingSignatures.delete(id);
        this.ports.record('decorationRemovals');
      }
    }
    for (const id of this.pendingSignatures.keys()) if (!byId.has(id)) this.pendingSignatures.delete(id);

    for (const [id, decoration] of byId) {
      const signature = this.signature(decoration);
      const current = this.rendered.get(id);
      const pending = this.pendingSignatures.get(id);
      if ((!full && current?.signature === signature) || (!current && pending === signature)) continue;
      if (current) {
        this.remove(id, current);
        this.ports.record('decorationUpdates');
      } else if (pending === undefined) this.ports.record('decorationAdds');
      else this.ports.record('decorationUpdates');
      this.enqueue({ token: generation, id, decoration, signature });
    }
    this.ports.scheduleHydration();
    return visible;
  }

  applyMetadataChanges(
    changes: readonly ProjectMetadataDecorationChange[],
    previousProject: ProjectDocument,
    previousFilter: DecorationRenderFilter,
    project: ProjectDocument,
    filter: DecorationRenderFilter,
    generation: number,
  ): void {
    for (const change of changes) {
      const beforeVisible = isVisibleInViewport(change.before, previousProject.groups, previousFilter);
      const afterVisible = isVisibleInViewport(change.after, project.groups, filter);
      const current = this.rendered.get(change.id);
      if (beforeVisible && afterVisible && current && change.after) this.rendered.set(change.id, { ...current, decoration: change.after });
      else if (beforeVisible && !afterVisible && current) {
        this.remove(change.id, current);
        this.pendingSignatures.delete(change.id);
        this.queue = this.queue.slice(this.queueHead).filter((job) => job.id !== change.id);
      } else if (!beforeVisible && afterVisible && change.after && !current) {
        const signature = this.signature(change.after);
        this.enqueue({ token: generation, id: change.id, decoration: change.after, signature });
      }
    }
    this.queueHead = 0;
    if (this.queuedCount) this.ports.scheduleHydration();
  }

  processBatch(generation: number, deadline: number, maxJobs: number): number {
    let processed = 0;
    while (processed < maxJobs && this.queuedCount > 0 && performance.now() < deadline) {
      const job = this.queue[this.queueHead++];
      if (job.token !== generation) continue;
      this.pendingSignatures.delete(job.id);
      this.ports.record('decorationVisualCreations');
      const visual = createDecorationVisual(
        job.decoration,
        this.ports.textureUrl(),
        this.ports.textureCache(),
        this.ports.paintingResource(),
        this.ports.itemResources(),
        this.ports.itemVisual(),
        false,
      );
      visual.userData['decorationInstanceId'] = job.id;
      visual.userData['decoration'] = job.decoration;
      visual.traverse((child) => {
        child.userData['decorationInstanceId'] = job.id;
        child.userData['decoration'] = job.decoration;
      });
      this.ports.group.add(visual);
      const entry: DecorationRenderEntry = { id: job.id, decoration: job.decoration, signature: job.signature, object: visual };
      this.rendered.set(job.id, entry);
      this.hydrateItemPreview(entry);
      this.ports.complete(job.token, job.id);
      processed += 1;
    }
    if (processed) this.ports.scheduleRender();
    return processed;
  }

  hydrateSelectedItemPreview(id: string): void {
    const entry = this.rendered.get(id);
    if (entry) this.hydrateItemPreview(entry);
  }

  compactQueue(): void {
    if (this.queueHead === 0) return;
    if (this.queueHead >= this.queue.length) this.queue = [];
    else this.queue = this.queue.slice(this.queueHead);
    this.queueHead = 0;
  }

  cancelPending(): void {
    this.queue = [];
    this.queueHead = 0;
    this.pendingSignatures.clear();
  }

  clear(): void {
    for (const [id, entry] of this.rendered) this.remove(id, entry);
    this.cancelPending();
  }

  private enqueue(job: DecorationHydrationJob): void {
    this.pendingSignatures.set(job.id, job.signature);
    this.queue.push(job);
  }

  private signature(decoration: PlacedDecoration): string {
    return `${decorationRenderSignature(decoration)}|${this.currentRevision}`;
  }

  private remove(id: string, entry: DecorationRenderEntry): void {
    if (entry.object.parent === this.ports.group) this.ports.group.remove(entry.object);
    disposeObject(entry.object);
    if (this.rendered.get(id) === entry) this.rendered.delete(id);
  }

  private hydrateItemPreview(entry: Readonly<DecorationRenderEntry>): void {
    if (!this.ports.isSelected(entry.id)) return;
    const provider = this.ports.itemPreview();
    const item = entry.decoration.item;
    if (!provider || !item) return;
    const sprite = entry.object.children.find((child) => child.userData['decorationItemId'] === item.id);
    if (!sprite) return;
    const generation = this.ports.providerGeneration();
    void provider(item).then((url) => {
      if (!url || generation !== this.ports.providerGeneration() || this.rendered.get(entry.id) !== entry) return;
      if (sprite.userData['itemVisualPreview'] === url) return;
      if (applyDecorationItemPreview(sprite, url, this.ports.textureCache())) this.ports.scheduleRender();
    }).catch(() => undefined);
  }
}

function isVisibleInViewport(decoration: PlacedDecoration | undefined, groups: ProjectDocument['groups'], filter: DecorationRenderFilter): decoration is PlacedDecoration {
  return !!decoration
    && isDecorationVisible(decoration, groups)
    && (filter.layerY === undefined
      || decoration.anchor.y === filter.layerY
      || filter.visibility === 'whole-structure'
      || filter.visibility === 'all-below' && decoration.anchor.y <= filter.layerY);
}

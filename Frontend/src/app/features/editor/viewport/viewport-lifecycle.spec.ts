import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Type } from '@angular/core';
import { ThreeViewportEngine } from '../../../core/renderer/engine/three-viewport-engine';
import { ContentAssetRuntimeService } from '../../../core/assets/content-asset-runtime.service';
import { BlockLibraryService } from '../../../core/blocks/catalog/block-library.service';
import { PaintingVariantCatalogService } from '../../../core/decorations/catalog/painting-variant-catalog.service';
import { WorkspaceStateService } from '../../../core/workspace/workspace-state.service';
import { rendererBenchmarkProject } from '../../../core/renderer/benchmark/renderer-benchmark-fixtures';
import { ViewportPreparationScheduler } from './shared/viewport-preparation-scheduler';
import type { YLayerPrewarmTerminalNotification } from '../../../core/renderer/engine/viewport-engine-contracts';
import { ViewportComponent } from './three-d-viewport/viewport.component';
import { YLayerComponent } from './y-layer-viewport/y-layer.component';

describe('editor viewport engine teardown', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('disposes the 3D engine once when the real viewport component is destroyed', async () => {
    await TestBed.configureTestingModule({ imports: [ViewportComponent] })
      .overrideComponent(ViewportComponent, { set: { template: '<div #host></div>' } })
      .compileComponents();
    const mount = vi
      .spyOn(ThreeViewportEngine.prototype, 'mount')
      .mockImplementation(() => undefined);
    vi.spyOn(ThreeViewportEngine.prototype, 'update').mockImplementation(() => undefined);
    const setVisualProvider = vi
      .spyOn(ThreeViewportEngine.prototype, 'setVisualProvider')
      .mockImplementation(() => undefined);
    const setSpecialResolver = vi
      .spyOn(ThreeViewportEngine.prototype, 'setSpecialVisualDescriptorResolver')
      .mockImplementation(() => undefined);
    const dispose = vi
      .spyOn(ThreeViewportEngine.prototype, 'dispose')
      .mockImplementation(() => undefined);
    const fixture = TestBed.createComponent(ViewportComponent);
    fixture.detectChanges();
    const assets = TestBed.inject(ContentAssetRuntimeService);
    const library = TestBed.inject(BlockLibraryService);
    expect(setVisualProvider).toHaveBeenCalledWith(assets.visualProvider());
    const resolverCall = setSpecialResolver.mock.calls.at(-1);
    expect(resolverCall?.[1]).toBe(library.catalogRevision());
    expect(resolverCall?.[0]?.('minecraft:stone')).toBe(
      library.get('minecraft:stone')?.specialVisual,
    );
    fixture.destroy();
    fixture.destroy();

    expect(mount).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('disposes the Y-Layer engine once when the real viewport component is destroyed', async () => {
    await TestBed.configureTestingModule({ imports: [YLayerComponent] })
      .overrideComponent(YLayerComponent, { set: { template: '<div #host></div>' } })
      .compileComponents();
    const mount = vi
      .spyOn(ThreeViewportEngine.prototype, 'mount')
      .mockImplementation(() => undefined);
    vi.spyOn(ThreeViewportEngine.prototype, 'update').mockImplementation(() => undefined);
    const dispose = vi
      .spyOn(ThreeViewportEngine.prototype, 'dispose')
      .mockImplementation(() => undefined);
    const fixture = TestBed.createComponent(YLayerComponent);
    fixture.detectChanges();
    fixture.destroy();
    fixture.destroy();

    expect(mount).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('retries only current non-cancelled prewarm terminals and releases the listener on destroy', async () => {
    await TestBed.configureTestingModule({ imports: [YLayerComponent] })
      .overrideComponent(YLayerComponent, { set: { template: '<div #host></div>' } })
      .compileComponents();
    vi.spyOn(ThreeViewportEngine.prototype, 'mount').mockImplementation(() => undefined);
    vi.spyOn(ThreeViewportEngine.prototype, 'update').mockImplementation(() => undefined);
    vi.spyOn(ThreeViewportEngine.prototype, 'setVisualProvider').mockImplementation(
      () => undefined,
    );
    vi.spyOn(ThreeViewportEngine.prototype, 'dispose').mockImplementation(() => undefined);
    let publishTerminal: ((notification: YLayerPrewarmTerminalNotification) => void) | undefined;
    const unsubscribe = vi.fn();
    vi.spyOn(ThreeViewportEngine.prototype, 'onYLayerPrewarmTerminal').mockImplementation(
      (listener) => {
        publishTerminal = listener;
        return unsubscribe;
      },
    );

    const fixture = TestBed.createComponent(YLayerComponent);
    fixture.detectChanges();
    const project = rendererBenchmarkProject('small');
    const provider = { dispose: vi.fn() } as never;
    TestBed.inject(WorkspaceStateService).project.set(project);
    TestBed.inject(ContentAssetRuntimeService).visualProvider.set(provider);
    const retry = vi.spyOn(TestBed.inject(ViewportPreparationScheduler), 'retry');
    const notify = publishTerminal!;
    const base = {
      attemptId: 1,
      projectId: project.id,
      blocks: project.blocks,
      provider,
      providerGeneration: 1,
      phase: 'representations' as const,
    };

    notify({ ...base, outcome: 'partial' });
    expect(retry).toHaveBeenCalledTimes(1);
    expect(retry).toHaveBeenCalledWith('y-layer');
    notify({ ...base, outcome: 'cancelled' });
    notify({ ...base, blocks: [], outcome: 'ready' });
    expect(retry).toHaveBeenCalledTimes(1);

    fixture.destroy();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['3D', ViewportComponent],
    ['Y-layer', YLayerComponent],
  ] as const)(
    'does not mount an inactive %s GPU viewport until it becomes active',
    async (_label, component) => {
      const componentType = component as unknown as Type<unknown>;
      await TestBed.configureTestingModule({ imports: [componentType] })
        .overrideComponent(componentType, { set: { template: '<div #host></div>' } })
        .compileComponents();
      const mount = vi
        .spyOn(ThreeViewportEngine.prototype, 'mount')
        .mockImplementation(() => undefined);
      vi.spyOn(ThreeViewportEngine.prototype, 'update').mockImplementation(() => undefined);
      vi.spyOn(ThreeViewportEngine.prototype, 'dispose').mockImplementation(() => undefined);
      const fixture = TestBed.createComponent(componentType);
      fixture.componentRef.setInput('viewportActive', false);
      fixture.detectChanges();
      expect(mount).not.toHaveBeenCalled();

      fixture.componentRef.setInput('viewportActive', true);
      fixture.detectChanges();
      expect(mount).toHaveBeenCalledTimes(1);
      fixture.destroy();
    },
  );

  it.each([
    ['3D', ViewportComponent],
    ['Y-Layer', YLayerComponent],
  ] as const)(
    'keeps resolver callbacks stable while refreshing %s content revisions',
    async (_mode, component) => {
      const componentType = component as unknown as Type<unknown>;
      await TestBed.configureTestingModule({ imports: [componentType] })
        .overrideComponent(componentType, { set: { template: '<div #host></div>' } })
        .compileComponents();

      vi.spyOn(ThreeViewportEngine.prototype, 'mount').mockImplementation(() => undefined);
      vi.spyOn(ThreeViewportEngine.prototype, 'update').mockImplementation(() => undefined);
      vi.spyOn(ThreeViewportEngine.prototype, 'dispose').mockImplementation(() => undefined);
      const special = vi
        .spyOn(ThreeViewportEngine.prototype, 'setSpecialVisualDescriptorResolver')
        .mockImplementation(() => undefined);
      const definitions = vi
        .spyOn(ThreeViewportEngine.prototype, 'setBlockDefinitionResolver')
        .mockImplementation(() => undefined);
      const textures = vi
        .spyOn(ThreeViewportEngine.prototype, 'setDecorationTextureProvider')
        .mockImplementation(() => undefined);
      const itemResources = vi
        .spyOn(ThreeViewportEngine.prototype, 'setDecorationItemResourceProvider')
        .mockImplementation(() => undefined);
      const itemVisual = vi
        .spyOn(ThreeViewportEngine.prototype, 'setDecorationItemVisualProvider')
        .mockImplementation(() => undefined);
      const itemPreview = vi
        .spyOn(ThreeViewportEngine.prototype, 'setDecorationItemPreviewProvider')
        .mockImplementation(() => undefined);
      const paintingResolver = vi
        .spyOn(ThreeViewportEngine.prototype, 'setPaintingTextureResolver')
        .mockImplementation(() => undefined);

      const fixture = TestBed.createComponent(componentType);
      fixture.detectChanges();
      const assets = TestBed.inject(ContentAssetRuntimeService);
      const library = TestBed.inject(BlockLibraryService);
      const paintingCatalog = TestBed.inject(PaintingVariantCatalogService);
      const firstCallbacks = [
        special,
        definitions,
        textures,
        itemResources,
        itemVisual,
        itemPreview,
        paintingResolver,
      ].map((spy) => spy.mock.calls.at(-1)?.[0]);
      const firstPaintingRevision = paintingResolver.mock.calls.at(-1)?.[1];

      assets.generation.update((value) => value + 1);
      library.replaceSource({ minecraftVersion: '1.21.1', sourceId: 'resolver-test', blocks: [] });
      paintingCatalog.replaceSource('resolver-test', [
        { id: 'resolver-test:painting', width: 1, height: 1, assetPath: 'resolver-test:painting' },
      ]);
      fixture.detectChanges();

      expect(special.mock.calls.at(-1)?.[0]).toBe(firstCallbacks[0]);
      expect(definitions.mock.calls.at(-1)?.[0]).toBe(firstCallbacks[1]);
      expect(textures.mock.calls.at(-1)?.[0]).toBe(firstCallbacks[2]);
      expect(itemResources.mock.calls.at(-1)?.[0]).toBe(firstCallbacks[3]);
      expect(itemVisual.mock.calls.at(-1)?.[0]).toBe(firstCallbacks[4]);
      expect(itemPreview.mock.calls.at(-1)?.[0]).toBe(firstCallbacks[5]);
      expect(paintingResolver.mock.calls.at(-1)?.[0]).toBe(firstCallbacks[6]);
      expect(textures.mock.calls.at(-1)?.[1]).toBe(assets.generation());
      expect(definitions.mock.calls.at(-1)?.[1]).toBe(library.catalogRevision());
      expect(special.mock.calls.at(-1)?.[1]).toBe(library.catalogRevision());
      expect(paintingResolver.mock.calls.at(-1)?.[1]).not.toBe(firstPaintingRevision);
      expect(itemResources.mock.calls.at(-1)?.[1]).toBe(
        `${assets.generation()}:${library.catalogRevision()}`,
      );
      expect(itemVisual.mock.calls.at(-1)?.[1]).toBe(
        `${assets.generation()}:${library.catalogRevision()}`,
      );
      expect(itemPreview.mock.calls.at(-1)?.[1]).toBe(
        `${assets.generation()}:${library.catalogRevision()}`,
      );
      fixture.destroy();
    },
  );
});

import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThreeViewportEngine } from '../../../core/renderer/engine/three-viewport-engine';
import { ContentAssetRuntimeService } from '../../../core/assets/content-asset-runtime.service';
import { BlockLibraryService } from '../../../core/blocks/catalog/block-library.service';
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
    const mount = vi.spyOn(ThreeViewportEngine.prototype, 'mount').mockImplementation(() => undefined);
    vi.spyOn(ThreeViewportEngine.prototype, 'update').mockImplementation(() => undefined);
    const setVisualProvider = vi.spyOn(ThreeViewportEngine.prototype, 'setVisualProvider').mockImplementation(() => undefined);
    const setSpecialResolver = vi.spyOn(ThreeViewportEngine.prototype, 'setSpecialVisualDescriptorResolver').mockImplementation(() => undefined);
    const dispose = vi.spyOn(ThreeViewportEngine.prototype, 'dispose').mockImplementation(() => undefined);
    const fixture = TestBed.createComponent(ViewportComponent);
    fixture.detectChanges();
    const assets = TestBed.inject(ContentAssetRuntimeService);
    const library = TestBed.inject(BlockLibraryService);
    expect(setVisualProvider).toHaveBeenCalledWith(assets.visualProvider());
    const resolverCall = setSpecialResolver.mock.calls.at(-1);
    expect(resolverCall?.[1]).toBe(library.catalogRevision());
    expect(resolverCall?.[0]?.('minecraft:stone')).toBe(library.get('minecraft:stone')?.specialVisual);
    fixture.destroy();
    fixture.destroy();

    expect(mount).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('disposes the Y-Layer engine once when the real viewport component is destroyed', async () => {
    await TestBed.configureTestingModule({ imports: [YLayerComponent] })
      .overrideComponent(YLayerComponent, { set: { template: '<div #host></div>' } })
      .compileComponents();
    const mount = vi.spyOn(ThreeViewportEngine.prototype, 'mount').mockImplementation(() => undefined);
    vi.spyOn(ThreeViewportEngine.prototype, 'update').mockImplementation(() => undefined);
    const dispose = vi.spyOn(ThreeViewportEngine.prototype, 'dispose').mockImplementation(() => undefined);
    const fixture = TestBed.createComponent(YLayerComponent);
    fixture.detectChanges();
    fixture.destroy();
    fixture.destroy();

    expect(mount).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

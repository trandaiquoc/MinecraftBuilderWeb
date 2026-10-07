import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThreeViewportEngine } from '../../../core/renderer/engine/three-viewport-engine';
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
    const dispose = vi.spyOn(ThreeViewportEngine.prototype, 'dispose').mockImplementation(() => undefined);
    const fixture = TestBed.createComponent(ViewportComponent);
    fixture.detectChanges();
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

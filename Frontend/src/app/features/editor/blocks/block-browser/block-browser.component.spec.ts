import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { VanillaAssetsService } from '../../../../core/assets/vanilla/vanilla-assets.service';
import { BlockBrowserComponent, blockGridColumnCount, groupBlockItemsIntoRows } from './block-browser.component';

describe('BlockBrowser grid sizing', () => {
  it('returns a bounded responsive column count', () => {
    expect(blockGridColumnCount(0)).toBe(1);
    expect(blockGridColumnCount(Number.NaN)).toBe(1);
    expect(blockGridColumnCount(240)).toBe(2);
    expect(blockGridColumnCount(500)).toBe(4);
    expect(blockGridColumnCount(650)).toBe(5);
    expect(blockGridColumnCount(800)).toBe(6);
    expect(blockGridColumnCount(800)).toBeGreaterThan(blockGridColumnCount(500));
  });

  it('groups items into deterministic virtual rows', () => {
    expect(groupBlockItemsIntoRows(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'], 4)).toEqual([
      ['a', 'b', 'c', 'd'], ['e', 'f', 'g', 'h'], ['i', 'j'],
    ]);
    expect(groupBlockItemsIntoRows(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'], 2)).toHaveLength(5);
    expect(groupBlockItemsIntoRows(['a', 'b'], 0)).toEqual([['a'], ['b']]);
  });
});

describe('BlockBrowserComponent bootstrap presentation', () => {
  it('keeps the block catalog visible while Mods restore and has no loading panel', async () => {
    await TestBed.configureTestingModule({ imports: [BlockBrowserComponent] }).compileComponents();
    const fixture = TestBed.createComponent(BlockBrowserComponent);
    const assets = TestBed.inject(VanillaAssetsService);
    assets.status.set('ready');
    assets.contentRestore.set({ phase: 'restoring-mods', current: 0, total: 1, failed: 0 });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.asset-loading-state')).toBeNull();
    // jsdom has no layout engine, so CDK does not calculate a rendered range;
    // the viewport itself is the stable bootstrap contract. Browser coverage
    // verifies that rows are materialized once it has real dimensions.
    expect(fixture.nativeElement.querySelector('cdk-virtual-scroll-viewport.results')).not.toBeNull();
  });

  it('retains the fatal no-assets recovery surface', async () => {
    await TestBed.configureTestingModule({ imports: [BlockBrowserComponent] }).compileComponents();
    const fixture = TestBed.createComponent(BlockBrowserComponent);
    const assets = TestBed.inject(VanillaAssetsService);
    assets.status.set('no-assets');
    assets.contentRestore.set({ phase: 'error', current: 0, total: 0, failed: 1 });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.asset-empty-state')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.asset-loading-state')).toBeNull();
  });

  it('keeps All/Vanilla source identities unique and updates Active Block immediately', async () => {
    await TestBed.configureTestingModule({ imports: [BlockBrowserComponent] }).compileComponents();
    const fixture = TestBed.createComponent(BlockBrowserComponent);
    const component = fixture.componentInstance;
    const sources = component['sources']();
    expect(sources.filter((source) => source.id === '__minecraftbuilder_all__')).toHaveLength(1);
    expect(sources.filter((source) => source.id === 'vanilla')).toHaveLength(1);
    const item = component['library'].allItems()[0];
    component['select'](item);
    expect(component['library'].activeBlock.active()?.id).toBe(item.displayBlockId);
    expect(component['activePreviewItem']()?.itemId).toBe(item.itemId);
    expect(component['isActive'](item)).toBe(true);
  });
});

import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { VanillaAssetsService } from '../../../../core/assets/vanilla/vanilla-assets.service';
import { BlockBrowserComponent } from './block-browser.component';

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
});

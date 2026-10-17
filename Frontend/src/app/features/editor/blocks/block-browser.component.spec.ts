import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { ContentAssetRuntimeService } from '../../../core/assets/content-asset-runtime.service';
import { ContentSourceRegistry } from '../../../core/assets/content-source/content-source-registry';
import { I18nService } from '../../../core/ui/localization/i18n.service';
import type {
  ContentRestoreState,
  VanillaAssetStatus,
} from '../../../core/assets/content-asset-runtime.service';
import { BLOCK_CATALOG_ROW_HEIGHT, BlockBrowserComponent } from './block-browser.component';

function createAssetRuntimeStub() {
  return {
    status: signal<VanillaAssetStatus>('loading-cache'),
    contentRestore: signal<ContentRestoreState>({
      phase: 'vanilla',
      current: 0,
      total: 0,
      failed: 0,
    }),
    message: signal(''),
    thumbnailEpoch: signal(0),
    sources: new ContentSourceRegistry(),
    redownload: vi.fn(async () => undefined),
    requestItemThumbnail: vi.fn(),
    thumbnailUrlForItem: vi.fn(() => undefined),
  };
}

describe('BlockBrowser list sizing', () => {
  it('uses a consistent virtual row height for full-width block rows', () => {
    expect(BLOCK_CATALOG_ROW_HEIGHT).toBe(80);
  });
});

describe('BlockBrowserComponent bootstrap presentation', () => {
  it('keeps the block catalog visible while Mods restore and has no loading panel', async () => {
    const assets = createAssetRuntimeStub();
    await TestBed.configureTestingModule({
      imports: [BlockBrowserComponent],
      providers: [{ provide: ContentAssetRuntimeService, useValue: assets }],
    }).compileComponents();
    const fixture = TestBed.createComponent(BlockBrowserComponent);
    assets.status.set('ready');
    assets.contentRestore.set({ phase: 'restoring-mods', current: 0, total: 1, failed: 0 });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.asset-loading-state')).toBeNull();
    // jsdom has no layout engine, so CDK does not calculate a rendered range;
    // the viewport itself is the stable bootstrap contract. Browser coverage
    // verifies that rows are materialized once it has real dimensions.
    expect(
      fixture.nativeElement.querySelector('cdk-virtual-scroll-viewport.results'),
    ).not.toBeNull();
  });

  it('retains the fatal no-assets recovery surface', async () => {
    const assets = createAssetRuntimeStub();
    await TestBed.configureTestingModule({
      imports: [BlockBrowserComponent],
      providers: [{ provide: ContentAssetRuntimeService, useValue: assets }],
    }).compileComponents();
    const fixture = TestBed.createComponent(BlockBrowserComponent);
    assets.status.set('no-assets');
    assets.contentRestore.set({ phase: 'error', current: 0, total: 0, failed: 1 });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.asset-empty-state')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.asset-empty-state p')?.getAttribute('role')).toBe(
      'alert',
    );
    expect(fixture.nativeElement.querySelector('.asset-loading-state')).toBeNull();
  });

  it('keeps All/Vanilla source identities unique and updates Active Block immediately', async () => {
    await TestBed.configureTestingModule({ imports: [BlockBrowserComponent] }).compileComponents();
    const fixture = TestBed.createComponent(BlockBrowserComponent);
    const component = fixture.componentInstance;
    const sources = component['sources']();
    expect(sources.filter((source) => source.id === '__theblocklaundromat_all__')).toHaveLength(1);
    expect(sources.filter((source) => source.id === 'vanilla')).toHaveLength(1);
    const item = component['library'].allItems()[0];
    component['select'](item);
    expect(component['library'].activeBlock.active()?.id).toBe(item.displayBlockId);
    expect(component['isActive'](item)).toBe(true);
  });

  it('keeps the search as a single full-width structure without an active preview card', async () => {
    await TestBed.configureTestingModule({ imports: [BlockBrowserComponent] }).compileComponents();
    const fixture = TestBed.createComponent(BlockBrowserComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#block-search')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.active-block')).toBeNull();
    expect(fixture.nativeElement.querySelector('.search-active-row')).toBeNull();
  });

  it('offers a clear-search action for empty results and returns focus to search', async () => {
    await TestBed.configureTestingModule({ imports: [BlockBrowserComponent] }).compileComponents();
    const fixture = TestBed.createComponent(BlockBrowserComponent);
    const component = fixture.componentInstance;
    const search = fixture.nativeElement.querySelector('#block-search') as HTMLInputElement | null;
    if (!search) throw new Error('Block search is missing');
    document.body.append(fixture.nativeElement);

    component['library'].setQuery('zzzzzz-no-such-block');
    fixture.detectChanges();

    const emptyState = fixture.nativeElement.querySelector(
      '.block-empty-state',
    ) as HTMLElement | null;
    const clearButton = emptyState?.querySelector('button') as HTMLButtonElement | null;
    expect(emptyState?.getAttribute('role')).toBe('status');
    expect(clearButton?.textContent?.trim()).toBe(TestBed.inject(I18nService).t('clearSearch'));
    clearButton?.click();
    fixture.detectChanges();

    expect(component['library'].query()).toBe('');
    expect(document.activeElement).toBe(search);
    expect(fixture.nativeElement.querySelector('.block-empty-state')).toBeNull();
    fixture.destroy();
    fixture.nativeElement.remove();
  });
});

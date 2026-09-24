import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { ItemStackPickerComponent } from './item-stack-picker.component';
import { ItemVisualService } from '../../../core/items/catalog/item-visual.service';

describe('ItemStackPickerComponent', () => {
  it('emits count-one stacks, empty selections, and preserves an existing stack when reselected', async () => {
    await TestBed.configureTestingModule({ imports: [ItemStackPickerComponent] }).compileComponents();
    const fixture = TestBed.createComponent(ItemStackPickerComponent);
    fixture.componentRef.setInput('entries', [{ id: 'minecraft:stone', displayName: 'Stone', namespace: 'minecraft', sourceId: 'vanilla', sourceName: 'Minecraft', sourceFormat: 'authoritative-registry', referencedModels: [], referencedResources: [] }]);
    const values: unknown[] = [];
    fixture.componentInstance.stackChange.subscribe((value) => values.push(value));
    fixture.detectChanges();
    fixture.componentInstance['choose']('minecraft:stone');
    fixture.componentInstance['choose']('');
    expect(values).toEqual([{ id: 'minecraft:stone', count: 1 }, undefined]);
  });

  it('keeps a selected item visible when its source is no longer available', async () => {
    await TestBed.configureTestingModule({ imports: [ItemStackPickerComponent] }).compileComponents();
    const fixture = TestBed.createComponent(ItemStackPickerComponent);
    fixture.componentRef.setInput('selectedStack', { id: 'example:gem', count: 2, components: { custom: true } });
    fixture.detectChanges();
    expect(fixture.componentInstance['options']()).toContainEqual({ id: 'example:gem', label: 'example:gem', secondary: 'Unavailable', status: 'Visual unavailable', thumbnail: { urls: [], alt: 'example:gem', fallback: true } });
  });

  it('exposes thumbnails, visual status and source filtering for item entries', async () => {
    await TestBed.configureTestingModule({ imports: [ItemStackPickerComponent] }).compileComponents();
    const fixture = TestBed.createComponent(ItemStackPickerComponent);
    fixture.componentRef.setInput('entries', [
      { id: 'minecraft:stone', displayName: 'Stone', namespace: 'minecraft', sourceId: 'vanilla', sourceName: 'Minecraft', sourceFormat: 'authoritative-registry', referencedModels: [], referencedResources: [], visual: { status: 'available', kind: 'generated-layers', resourcePaths: ['minecraft:item/stone'], previewUrls: ['stone.png'], diagnostics: [] } },
      { id: 'example:gem', displayName: 'Gem', namespace: 'example', sourceId: 'example', sourceName: 'Example Mod', sourceFormat: 'modern-item-definition', referencedModels: [], referencedResources: [], visual: { status: 'unsupported', kind: 'unsupported', resourcePaths: [], previewUrls: [], diagnostics: ['runtime'] } },
    ]);
    fixture.detectChanges();
    expect(fixture.componentInstance['options']()[0]?.thumbnail?.urls).toEqual(['stone.png']);
    fixture.componentInstance['selectSource']('example');
    expect(fixture.componentInstance['options']().map((option) => option.id)).toEqual(['example:gem']);
  });

  it('rebuilds the option cache when an explicitly selected visual resolves', async () => {
    const revision = signal(0);
    let resolved = false;
    const info = { status: 'available' as const, kind: 'generated-layers' as const, resourcePaths: ['example:item/gem'], previewUrls: ['blob:gem-preview'], diagnostics: [] };
    const fakeVisuals = {
      revision,
      request: vi.fn(async () => info),
      state: () => resolved ? { status: 'available' as const, info, diagnostics: [], generation: 1 } : { status: 'idle' as const, diagnostics: [], generation: 1 },
    };
    await TestBed.configureTestingModule({ imports: [ItemStackPickerComponent], providers: [{ provide: ItemVisualService, useValue: fakeVisuals }] }).compileComponents();
    const fixture = TestBed.createComponent(ItemStackPickerComponent);
    fixture.componentRef.setInput('entries', [{ id: 'example:gem', displayName: 'Gem', namespace: 'example', sourceId: 'example', sourceName: 'Example', sourceFormat: 'modern-item-definition', referencedModels: [], referencedResources: [] }]);
    fixture.componentRef.setInput('selectedStack', { id: 'example:gem', count: 1 });
    fixture.detectChanges();
    expect(fixture.componentInstance['options']()[0]?.thumbnail).toEqual({ urls: [], alt: 'Gem', fallback: true });

    resolved = true;
    revision.update((value) => value + 1);
    fixture.detectChanges();
    expect(fixture.componentInstance['options']()[0]?.thumbnail).toEqual({ urls: ['blob:gem-preview'], alt: 'Gem', fallback: false });
    expect(fakeVisuals.request).toHaveBeenCalledWith({ id: 'example:gem', count: 1 }, 'high');
  });

  it('keeps browsing metadata-only until an item is explicitly selected', async () => {
    const revision = signal(0);
    const request = vi.fn(async () => ({ status: 'available' as const, kind: 'generated-layers' as const, resourcePaths: [], previewUrls: ['blob:unexpected'], diagnostics: [] }));
    const fakeVisuals = { revision, request, state: () => ({ status: 'idle' as const, diagnostics: [], generation: 1 }) };
    await TestBed.configureTestingModule({ imports: [ItemStackPickerComponent], providers: [{ provide: ItemVisualService, useValue: fakeVisuals }] }).compileComponents();
    const fixture = TestBed.createComponent(ItemStackPickerComponent);
    fixture.componentRef.setInput('entries', [
      { id: 'example:one', displayName: 'One', namespace: 'example', sourceId: 'example', sourceName: 'Example', sourceFormat: 'legacy-item-model', referencedModels: [], referencedResources: [] },
      { id: 'example:two', displayName: 'Two', namespace: 'example', sourceId: 'example', sourceName: 'Example', sourceFormat: 'legacy-item-model', referencedModels: [], referencedResources: [] },
    ]);
    fixture.detectChanges();
    fixture.componentInstance['options']();
    expect(request).not.toHaveBeenCalled();
  });

  it('re-requests the selected visual when its source entry is restored', async () => {
    const revision = signal(0);
    const request = vi.fn(async () => ({ status: 'available' as const, kind: 'generated-layers' as const, resourcePaths: [], previewUrls: ['blob:restored'], diagnostics: [] }));
    const fakeVisuals = { revision, request, state: () => ({ status: 'idle' as const, diagnostics: [], generation: 1 }) };
    await TestBed.configureTestingModule({ imports: [ItemStackPickerComponent], providers: [{ provide: ItemVisualService, useValue: fakeVisuals }] }).compileComponents();
    const fixture = TestBed.createComponent(ItemStackPickerComponent);
    fixture.componentRef.setInput('selectedStack', { id: 'example:gem', count: 1 });
    fixture.detectChanges();
    request.mockClear();
    fixture.componentRef.setInput('entries', [{ id: 'example:gem', displayName: 'Gem', namespace: 'example', sourceId: 'example', sourceName: 'Example', sourceFormat: 'legacy-item-model', referencedModels: [], referencedResources: [] }]);
    fixture.detectChanges();
    expect(request).toHaveBeenCalledWith({ id: 'example:gem', count: 1 }, 'high');
  });
});

import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ItemStackPickerComponent } from './item-stack-picker.component';

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
});

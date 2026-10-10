import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import type { ImportedModSummary } from '../../../../core/assets/content-asset-runtime.service';
import { ContentAssetRuntimeService } from '../../../../core/assets/content-asset-runtime.service';
import { ModSupportCatalog } from '../../../../core/assets/mod/mod-support-catalog';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import { ItemCatalogService } from '../../../../core/items/catalog/item-catalog.service';
import type { ItemCatalogEntry } from '../../../../core/items/catalog/item-catalog';
import { ItemVisualService } from '../../../../core/items/catalog/item-visual.service';
import { AssetManagerModDetailsComponent } from './asset-manager-mod-details.component';

const item = (id: string, displayName: string, sourceId: string): ItemCatalogEntry => ({
  id,
  displayName,
  namespace: id.split(':')[0],
  sourceId,
  sourceName: sourceId,
  sourceFormat: 'authoritative-registry',
  referencedModels: [],
  referencedResources: [],
});

const mod: ImportedModSummary = {
  sourceId: 'mod-a',
  modId: 'mod_a',
  displayName: 'Mod A',
  version: '1.0',
  namespaces: ['mod_a'],
  candidateBlockCount: 0,
  report: {
    metadataFormat: 'fabric',
    loader: 'fabric',
    loaderSupported: true,
    namespaces: ['mod_a'],
    retainedResourceCount: 0,
    candidateBlockCount: 0,
    blocks: { detected: 0, imported: 0, partial: 0, unsupported: 0 },
    items: { detected: 2, indexed: 2, unsupportedVisuals: 0 },
    decorations: { detected: 0, imported: 0, partial: 0, unsupported: 0 },
    conflicts: [],
    warnings: [],
    diagnostics: [],
    runtimeDependencies: {},
    nestedJarCount: 0,
  },
};

describe('AssetManagerModDetailsComponent', () => {
  it('filters items by source and search while requesting only visible item previews', async () => {
    const entries = [
      item('mod_a:sky_stone', 'Sky Stone', 'mod-a'),
      item('mod_a:sky_dust', 'Sky Dust', 'mod-a'),
      item('other:sky_stone', 'Other Sky Stone', 'other'),
    ];
    const catalog = { generation: signal(1), all: () => entries };
    const states = new Map<string, { status: string }>();
    const request = vi.fn((id: string) => {
      states.set(id, { status: 'queued' });
      return Promise.resolve({});
    });
    const visuals = {
      revision: signal(0),
      state: (id: string) => states.get(id) ?? { status: 'idle' },
      request,
    };
    await TestBed.configureTestingModule({
      imports: [AssetManagerModDetailsComponent],
      providers: [
        {
          provide: I18nService,
          useValue: {
            t: (key: string) => key,
            modDiagnostic: (_code: string, message: string) => message,
            modDiagnosticGroup: (kind: string) => kind,
          },
        },
        { provide: ContentAssetRuntimeService, useValue: { activeVersion: () => '1.21.1' } },
        { provide: ModSupportCatalog, useValue: { certificationFor: () => undefined } },
        { provide: ItemCatalogService, useValue: catalog },
        { provide: ItemVisualService, useValue: visuals },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AssetManagerModDetailsComponent);
    fixture.componentRef.setInput('mod', mod);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(
      [...fixture.nativeElement.querySelectorAll('.details-item-copy code')].map(
        (node: Element) => node.textContent,
      ),
    ).toEqual(['mod_a:sky_stone', 'mod_a:sky_dust']);
    expect(request.mock.calls.map(([id]) => id)).toEqual(['mod_a:sky_stone', 'mod_a:sky_dust']);

    const search = fixture.nativeElement.querySelector('input[type="search"]') as HTMLInputElement;
    search.value = 'dust';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.details-item-row').length).toBe(1);
    expect(fixture.nativeElement.querySelector('.details-item-copy code')?.textContent).toBe(
      'mod_a:sky_dust',
    );
    expect(request).toHaveBeenCalledTimes(2);
  });
});

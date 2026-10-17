import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { BlockLibraryService } from '../../../core/blocks/catalog/block-library.service';
import { ContentAssetRuntimeService } from '../../../core/assets/content-asset-runtime.service';
import { I18nService } from '../../../core/ui/localization/i18n.service';
import { QuickBlockBarService } from '../../../core/editor/quick-bar/quick-block-bar.service';
import { QuickBlockBarComponent } from './quick-block-bar.component';

describe('QuickBlockBarComponent disclosure', () => {
  it('exposes the expanded state while retaining an actionable button name', async () => {
    const collapsed = signal(false);
    const entry = {
      id: 'minecraft:stone',
      itemId: 'minecraft:stone',
      displayName: 'Stone',
      state: {},
      support: 'full',
    } as const;
    await TestBed.configureTestingModule({
      imports: [QuickBlockBarComponent],
      providers: [
        {
          provide: QuickBlockBarService,
          useValue: {
            active: signal(undefined),
            entries: signal([entry]),
            collapsed,
            toggleCollapsed: () => collapsed.update((value) => !value),
          },
        },
        {
          provide: BlockLibraryService,
          useValue: { allItems: () => [], getItem: () => undefined, itemForBlock: () => undefined },
        },
        {
          provide: ContentAssetRuntimeService,
          useValue: {
            generation: signal(0),
            thumbnailUrl: () => undefined,
            prepareItemThumbnail: () => undefined,
            prepareThumbnail: () => undefined,
          },
        },
        { provide: I18nService, useValue: { t: (key: string) => key } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(QuickBlockBarComponent);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('.collapse') as HTMLButtonElement;
    expect(button.getAttribute('aria-label')).toBe('collapse');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(fixture.nativeElement.querySelector('.slots')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.slot-select')?.getAttribute('aria-label')).toBe(
      '1: Stone, minecraft:stone',
    );

    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-label')).toBe('expand');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(fixture.nativeElement.querySelector('.slots')).toBeNull();

    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-label')).toBe('collapse');
    expect(button.getAttribute('aria-expanded')).toBe('true');
  });
});

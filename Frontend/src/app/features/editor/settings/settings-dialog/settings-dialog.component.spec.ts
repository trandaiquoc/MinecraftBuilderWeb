import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContentAssetRuntimeService } from '../../../../core/assets/content-asset-runtime.service';
import {
  REALITY_SKY_BACKGROUND_COLORS,
  REALITY_SKY_PRESETS,
} from '../../../../core/editor/appearance/editor-background-contract';
import { UiPreferencesService } from '../../../../core/ui/preferences/ui-preferences.service';
import { SettingsDialogComponent } from './settings-dialog.component';
import { SettingsDialogSession } from './settings-dialog-session';

interface SettingsAppearanceView {
  setSection(section: 'appearance'): void;
  groundOptions(): readonly {
    id: string;
    availability: string;
    previewUrl: string | undefined;
  }[];
}

describe('SettingsDialogComponent Reality previews', () => {
  afterEach(() => localStorage.removeItem('the-block-laundromat.ui-preferences'));

  it('marks the current Settings section as the dialog initial focus target', async () => {
    localStorage.removeItem('the-block-laundromat.ui-preferences');
    await TestBed.configureTestingModule({
      imports: [SettingsDialogComponent],
      providers: [
        {
          provide: ContentAssetRuntimeService,
          useValue: {
            generation: signal(0),
            resourceAvailabilitySettled: signal(true),
            sources: { resources: { textureUrl: () => undefined } },
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(SettingsDialogComponent);
    fixture.detectChanges();
    const currentSection = fixture.nativeElement.querySelector(
      '.settings-nav button[aria-current="page"]',
    );
    const cancel = fixture.nativeElement.querySelector('.settings-close');
    expect(currentSection.hasAttribute('cdkfocusinitial')).toBe(true);
    expect(cancel.hasAttribute('cdkfocusinitial')).toBe(false);
    expect(fixture.nativeElement.querySelector('.settings-dialog').hasAttribute('autofocus')).toBe(
      false,
    );

    fixture.destroy();
  });

  it('uses actual ground resources, availability state, and the renderer sky palette', async () => {
    localStorage.removeItem('the-block-laundromat.ui-preferences');
    const generation = signal(0);
    const resourceAvailabilitySettled = signal(false);
    let sandTextureUrl: string | undefined;
    const assetRuntime = {
      generation,
      resourceAvailabilitySettled,
      sources: {
        resources: {
          textureUrl: (resource: string) =>
            resource === 'minecraft:block/sand' ? sandTextureUrl : undefined,
        },
      },
    };
    await TestBed.configureTestingModule({
      imports: [SettingsDialogComponent],
      providers: [{ provide: ContentAssetRuntimeService, useValue: assetRuntime }],
    }).compileComponents();

    const preferences = TestBed.inject(UiPreferencesService);
    preferences.setAppearance({
      editorBackground: 'reality',
      reality: { groundPreset: 'sand', skyPreset: 'nether' },
    });
    const fixture = TestBed.createComponent(SettingsDialogComponent);
    const component = fixture.componentInstance as unknown as SettingsAppearanceView;
    component.setSection('appearance');
    fixture.detectChanges();
    const appearanceTabs = fixture.nativeElement.querySelectorAll(
      '.appearance-tabs [role="tab"]',
    ) as NodeListOf<HTMLButtonElement>;
    expect(appearanceTabs).toHaveLength(2);
    expect(appearanceTabs[0].getAttribute('aria-selected')).toBe('true');
    expect(fixture.nativeElement.querySelector('#appearance-interface-panel')).toBeTruthy();
    appearanceTabs[1].click();
    fixture.detectChanges();
    expect(appearanceTabs[1].getAttribute('aria-selected')).toBe('true');
    expect(
      fixture.nativeElement.querySelector('#appearance-workspace-background-panel'),
    ).toBeTruthy();

    expect(component.groundOptions().find(({ id }) => id === 'sand')).toMatchObject({
      availability: 'loading',
      previewUrl: undefined,
    });
    const skyPreviews = Array.from(
      fixture.nativeElement.querySelectorAll('.sky-preview') as NodeListOf<HTMLElement>,
    );
    expect(skyPreviews).toHaveLength(REALITY_SKY_PRESETS.length);
    expect(
      skyPreviews.map((preview) => preview.style.getPropertyValue('--reality-sky-background')),
    ).toEqual(REALITY_SKY_PRESETS.map((preset) => REALITY_SKY_BACKGROUND_COLORS[preset]));
    expect(
      fixture.nativeElement
        .querySelector('.reality-sky-grid .selected')
        ?.getAttribute('aria-pressed'),
    ).toBe('true');

    sandTextureUrl = 'blob:sand-texture';
    resourceAvailabilitySettled.set(true);
    generation.set(1);
    fixture.detectChanges();
    const sandOption = fixture.nativeElement.querySelector(
      '.reality-ground-grid .selected',
    ) as HTMLButtonElement;
    expect(sandOption.disabled).toBe(false);
    expect(sandOption.querySelector('img')?.getAttribute('src')).toBe('blob:sand-texture');

    sandOption.querySelector('img')?.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    const unavailableSand = fixture.nativeElement.querySelector(
      '.reality-ground-grid .selected',
    ) as HTMLButtonElement;
    expect(unavailableSand.disabled).toBe(true);
    expect(unavailableSand.classList.contains('unavailable')).toBe(true);
    expect(unavailableSand.querySelector('small')).toBeTruthy();

    fixture.destroy();
  });

  it('renders independent Appearance resets and keeps each operation in the draft', async () => {
    localStorage.removeItem('the-block-laundromat.ui-preferences');
    await TestBed.configureTestingModule({
      imports: [SettingsDialogComponent],
      providers: [
        {
          provide: ContentAssetRuntimeService,
          useValue: {
            generation: signal(0),
            resourceAvailabilitySettled: signal(true),
            sources: { resources: { textureUrl: () => undefined } },
          },
        },
      ],
    }).compileComponents();

    const preferences = TestBed.inject(UiPreferencesService);
    preferences.setAppearance({
      preset: 'raccoon',
      font: 'pangolin',
      fontSize: 'large',
      editorBackground: 'reality',
      reality: { groundPreset: 'snow', skyPreset: 'nether' },
    });
    const fixture = TestBed.createComponent(SettingsDialogComponent);
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    fixture.detectChanges();
    const component = fixture.componentInstance as unknown as {
      setSection(section: 'appearance'): void;
      appearanceTab: { set(value: 'interface' | 'workspace-background'): void };
    };
    const session = fixture.debugElement.injector.get(SettingsDialogSession);
    component.setSection('appearance');
    fixture.detectChanges();

    const reset = (index: number) => {
      const buttons = fixture.nativeElement.querySelectorAll(
        '.appearance-settings-pane .section-reset',
      ) as NodeListOf<HTMLButtonElement>;
      expect(buttons).toHaveLength(1);
      buttons[index]?.click();
      fixture.detectChanges();
    };

    reset(0);
    expect(session.draft().appearance).toMatchObject({
      preset: 'craft',
      font: 'comfortaa',
      fontSize: 'normal',
      editorBackground: 'reality',
      reality: { groundPreset: 'snow', skyPreset: 'nether' },
    });
    expect(preferences.preferences().appearance.preset).toBe('raccoon');

    component.appearanceTab.set('workspace-background');
    fixture.detectChanges();
    reset(0);
    expect(session.draft().appearance).toMatchObject({
      preset: 'craft',
      font: 'comfortaa',
      fontSize: 'normal',
      editorBackground: 'dark',
      reality: { groundPreset: 'plains-grass', skyPreset: 'overworld-day' },
    });
    expect(preferences.preferences().appearance.editorBackground).toBe('reality');
    const saveAndClose = fixture.nativeElement.querySelector(
      '.settings-dialog-footer .primary',
    ) as HTMLButtonElement;
    saveAndClose.click();
    fixture.detectChanges();
    expect(closed).toHaveBeenCalledOnce();
    expect(preferences.preferences().appearance).toMatchObject({
      preset: 'craft',
      font: 'comfortaa',
      fontSize: 'normal',
      editorBackground: 'dark',
      reality: { groundPreset: 'plains-grass', skyPreset: 'overworld-day' },
    });
    fixture.destroy();
  });
});

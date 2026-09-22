import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { VanillaAssetsService } from '../../../../core/assets/vanilla/vanilla-assets.service';
import { ProjectAutosaveService } from '../../../../core/persistence/autosave/project-autosave.service';
import { EditorStatusBarComponent } from './editor-status-bar.component';

describe('EditorStatusBarComponent asset bootstrap status', () => {
  it('renders determinate Mod restore progress and removes it when ready', async () => {
    await TestBed.configureTestingModule({ imports: [EditorStatusBarComponent], providers: [{ provide: ProjectAutosaveService, useValue: { status: signal('saved'), error: signal(undefined) } }] }).compileComponents();
    const fixture = TestBed.createComponent(EditorStatusBarComponent);
    const assets = TestBed.inject(VanillaAssetsService);
    assets.status.set('downloading');
    assets.downloadProgress.set({ phase: 'download', loaded: 42, total: 100 });
    fixture.detectChanges();
    const downloadProgress = fixture.nativeElement.querySelector('.asset-progress-track') as HTMLElement | null;
    expect(downloadProgress?.getAttribute('aria-valuenow')).toBe('42');
    expect(downloadProgress?.getAttribute('aria-valuemax')).toBe('100');

    assets.status.set('ready');
    assets.contentRestore.set({ phase: 'restoring-mods', current: 1, total: 2, failed: 0, sourceName: 'Example Mod' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.asset-status')?.textContent).toContain('1 / 2');
    const progress = fixture.nativeElement.querySelector('.asset-progress-track') as HTMLElement | null;
    expect(progress?.getAttribute('aria-valuenow')).toBe('50');
    expect(progress?.getAttribute('aria-valuemax')).toBe('100');

    assets.contentRestore.set({ phase: 'ready', current: 2, total: 2, failed: 0 });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.asset-progress-track')).toBeNull();
    expect(fixture.nativeElement.querySelector('.asset-status')?.textContent).toContain('Assets ready');
  });

  it('renders indeterminate loading and partial warning states without a loading bar when complete', async () => {
    await TestBed.configureTestingModule({ imports: [EditorStatusBarComponent], providers: [{ provide: ProjectAutosaveService, useValue: { status: signal('saved'), error: signal(undefined) } }] }).compileComponents();
    const fixture = TestBed.createComponent(EditorStatusBarComponent);
    const assets = TestBed.inject(VanillaAssetsService);
    assets.status.set('loading-cache');
    assets.contentRestore.set({ phase: 'vanilla', current: 0, total: 0, failed: 0 });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.asset-progress-track')).not.toBeNull();
    expect((fixture.nativeElement.querySelector('.asset-progress-fill') as HTMLElement).classList.contains('indeterminate')).toBe(true);

    assets.status.set('ready');
    assets.contentRestore.set({ phase: 'partial', current: 2, total: 2, failed: 1 });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.asset-progress-track')).toBeNull();
    expect(fixture.nativeElement.querySelector('.asset-status')?.textContent).toContain('1');
  });
});

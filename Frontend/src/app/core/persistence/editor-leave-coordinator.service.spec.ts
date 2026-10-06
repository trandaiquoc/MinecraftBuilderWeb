import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetActivityService } from '../assets/asset-activity.service';
import { DialogService } from '../ui/dialog/dialog.service';
import { I18nService } from '../ui/localization/i18n.service';
import { ProjectAutosaveService } from './autosave/project-autosave.service';
import { EditorLeaveCoordinator } from './editor-leave-coordinator.service';

describe('EditorLeaveCoordinator', () => {
  const state = { dirty: false };
  const autosave = { get isUnsafeDirty(): boolean { return state.dirty; }, flush: vi.fn(async () => { state.dirty = false; }) };
  const activity = { hasProtectedOperation: vi.fn(() => false) };
  const dialogs = { confirm: vi.fn(async () => true) };

  beforeEach(() => {
    state.dirty = false; autosave.flush.mockClear(); activity.hasProtectedOperation.mockReturnValue(false); dialogs.confirm.mockClear();
    TestBed.configureTestingModule({ providers: [EditorLeaveCoordinator, { provide: ProjectAutosaveService, useValue: autosave }, { provide: AssetActivityService, useValue: activity }, { provide: DialogService, useValue: dialogs }, { provide: I18nService, useValue: { t: (key: string) => key } }] });
  });

  it('leaves clean editors without opening a dialog', async () => {
    await expect(TestBed.inject(EditorLeaveCoordinator).canLeave()).resolves.toBe(true);
    expect(dialogs.confirm).not.toHaveBeenCalled();
  });

  it('flushes unsafe revisions before leaving', async () => {
    state.dirty = true;
    await expect(TestBed.inject(EditorLeaveCoordinator).canLeave()).resolves.toBe(true);
    expect(autosave.flush).toHaveBeenCalledTimes(1);
    expect(dialogs.confirm).not.toHaveBeenCalled();
  });

  it('offers stay or leave-anyway when flushing fails', async () => {
    state.dirty = true;
    autosave.flush.mockImplementationOnce(async () => { throw new Error('quota'); });
    dialogs.confirm.mockResolvedValueOnce(false);
    await expect(TestBed.inject(EditorLeaveCoordinator).canLeave()).resolves.toBe(false);
    expect(dialogs.confirm).toHaveBeenCalledTimes(1);
  });

  it('deduplicates concurrent leave decisions', async () => {
    state.dirty = true;
    let release!: () => void;
    autosave.flush.mockImplementationOnce(() => new Promise<void>((resolve) => { release = () => { state.dirty = false; resolve(); }; }));
    const coordinator = TestBed.inject(EditorLeaveCoordinator);
    const first = coordinator.canLeave(); const second = coordinator.canLeave();
    expect(first).toBe(second); release();
    await expect(first).resolves.toBe(true);
    expect(autosave.flush).toHaveBeenCalledTimes(1);
  });

  it('keeps the protected asset warning after autosave is safe', async () => {
    activity.hasProtectedOperation.mockReturnValue(true);
    await expect(TestBed.inject(EditorLeaveCoordinator).canLeave()).resolves.toBe(true);
    expect(dialogs.confirm).toHaveBeenCalledTimes(1);
  });
});

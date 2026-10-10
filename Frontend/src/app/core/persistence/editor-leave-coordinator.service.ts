import { Injectable, inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { AssetActivityService } from '../assets/asset-activity.service';
import { DialogService } from '../ui/dialog/dialog.service';
import { I18nService } from '../ui/localization/i18n.service';
import { ProjectAutosaveService } from './autosave/project-autosave.service';

@Injectable({ providedIn: 'root' })
export class EditorLeaveCoordinator {
  private readonly autosave = inject(ProjectAutosaveService);
  private readonly activity = inject(AssetActivityService);
  private readonly dialogs = inject(DialogService);
  private readonly i18n = inject(I18nService);
  private inFlight?: Promise<boolean>;

  canLeave(): Promise<boolean> {
    if (this.inFlight) return this.inFlight;
    const decision = this.evaluate();
    let wrapped!: Promise<boolean>;
    wrapped = decision.finally(() => {
      if (this.inFlight === wrapped) this.inFlight = undefined;
    });
    this.inFlight = wrapped;
    return wrapped;
  }

  private async evaluate(): Promise<boolean> {
    let flushFailed = false;
    if (this.autosave.isUnsafeDirty) {
      try {
        await this.autosave.flush();
      } catch {
        flushFailed = true;
      }
    }
    if (flushFailed || this.autosave.isUnsafeDirty) {
      const leave = await this.dialogs.confirm({
        title: this.i18n.t('unsavedChangesTitle'),
        text: this.i18n.t(flushFailed ? 'unsavedChangesSaveFailedText' : 'unsavedChangesText'),
        confirmButtonText: this.i18n.t('leaveAnyway'),
        cancelButtonText: this.i18n.t('stay'),
        icon: 'warning',
        destructive: true,
      });
      if (!leave) return false;
    }
    if (this.activity.hasProtectedOperation()) {
      return this.dialogs.confirm({
        title: this.i18n.t('assetOperationLeaveTitle'),
        text: this.i18n.t('assetOperationLeaveText'),
        confirmButtonText: this.i18n.t('leave'),
        cancelButtonText: this.i18n.t('stay'),
        icon: 'warning',
        destructive: true,
      });
    }
    return true;
  }
}

export const editorCanDeactivate: CanDeactivateFn<unknown> = () =>
  inject(EditorLeaveCoordinator).canLeave();

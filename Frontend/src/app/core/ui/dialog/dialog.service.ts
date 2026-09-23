import { Injectable, inject } from '@angular/core';
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { UiAlertDialogComponent, UiAlertKind, UiAlertModel } from '../../../shared/ui/dialog/ui-alert-dialog.component';

export interface DialogConfirmOptions {
  readonly title: string;
  readonly text?: string;
  readonly confirmButtonText?: string;
  readonly cancelButtonText?: string;
  readonly icon?: 'warning' | 'error' | 'success' | 'info' | 'question';
  readonly destructive?: boolean;
}

@Injectable({ providedIn: 'root' })
export class DialogService {
  private readonly overlay = inject(Overlay);

  confirm(options: DialogConfirmOptions): Promise<boolean> {
    return this.open({ kind: options.icon === 'error' ? 'error' : 'confirm', title: options.title, text: options.text, confirmButtonText: options.confirmButtonText ?? 'Confirm', cancelButtonText: options.cancelButtonText ?? 'Cancel', destructive: options.destructive === true, showCancel: true });
  }
  success(title: string, text?: string): Promise<boolean> { return this.open(this.notice('success', title, text)); }
  warning(title: string, text?: string): Promise<boolean> { return this.open(this.notice('warning', title, text)); }
  error(title: string, text?: string): Promise<boolean> { return this.open(this.notice('error', title, text)); }
  info(title: string, text?: string): Promise<boolean> { return this.open(this.notice('info', title, text)); }

  private notice(kind: UiAlertKind, title: string, text?: string): UiAlertModel { return { kind, title, text, confirmButtonText: 'OK', cancelButtonText: 'Cancel', destructive: kind === 'error', showCancel: false }; }
  private open(model: UiAlertModel): Promise<boolean> {
    const previous = typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const ref = this.overlay.create({
      hasBackdrop: true,
      backdropClass: 'ui-dialog-backdrop',
      panelClass: 'ui-dialog-overlay-pane',
      scrollStrategy: this.overlay.scrollStrategies.block(),
      positionStrategy: this.overlay.position().global().centerHorizontally().centerVertically(),
    });
    const component = ref.attach(new ComponentPortal(UiAlertDialogComponent));
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (confirmed: boolean): void => {
        if (settled) return;
        settled = true;
        ref.dispose();
        queueMicrotask(() => previous?.focus());
        resolve(confirmed);
      };
      component.instance.configure(model, finish);
      component.changeDetectorRef.detectChanges();
      ref.backdropClick().subscribe(() => finish(false));
      ref.keydownEvents().subscribe((event) => { if (event.key === 'Escape') { event.preventDefault(); finish(false); } });
    });
  }
}

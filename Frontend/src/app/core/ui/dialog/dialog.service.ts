import { Injectable, inject } from '@angular/core';
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { UiAlertAction, UiAlertActionKind, UiAlertDialogComponent, UiAlertKind, UiAlertModel } from '../../../shared/ui/dialog/ui-alert-dialog.component';

export interface DialogConfirmOptions {
  readonly title: string;
  readonly text?: string;
  readonly confirmButtonText?: string;
  readonly cancelButtonText?: string;
  readonly icon?: 'warning' | 'error' | 'success' | 'info' | 'question';
  readonly destructive?: boolean;
}

export interface DialogChoiceOption<T> {
  readonly id: string;
  readonly label: string;
  readonly value: T;
  readonly kind?: UiAlertActionKind;
}

export interface DialogChoiceOptions<T> {
  readonly title: string;
  readonly text?: string;
  readonly options: readonly DialogChoiceOption<T>[];
  readonly icon?: 'warning' | 'error' | 'success' | 'info' | 'question';
}

@Injectable({ providedIn: 'root' })
export class DialogService {
  private readonly overlay = inject(Overlay);

  confirm(options: DialogConfirmOptions): Promise<boolean> {
    return this.open({ kind: options.icon === 'error' ? 'error' : 'confirm', title: options.title, text: options.text, confirmButtonText: options.confirmButtonText ?? 'Confirm', cancelButtonText: options.cancelButtonText ?? 'Cancel', destructive: options.destructive === true, showCancel: true, cancelValue: false }).then((value) => value === true);
  }
  choice<T>(options: DialogChoiceOptions<T>): Promise<T | undefined> {
    const actions: readonly UiAlertAction[] = options.options.map((option) => ({ id: option.id, label: option.label, value: option.value, kind: option.kind }));
    return this.open({ kind: options.icon === 'error' ? 'error' : options.icon === 'warning' ? 'warning' : 'confirm', title: options.title, text: options.text, confirmButtonText: '', cancelButtonText: '', destructive: false, showCancel: false, actions, cancelValue: undefined }).then((value) => value as T | undefined);
  }
  success(title: string, text?: string): Promise<boolean> { return this.open(this.notice('success', title, text)).then((value) => value === true); }
  warning(title: string, text?: string): Promise<boolean> { return this.open(this.notice('warning', title, text)).then((value) => value === true); }
  error(title: string, text?: string): Promise<boolean> { return this.open(this.notice('error', title, text)).then((value) => value === true); }
  info(title: string, text?: string): Promise<boolean> { return this.open(this.notice('info', title, text)).then((value) => value === true); }

  private notice(kind: UiAlertKind, title: string, text?: string): UiAlertModel { return { kind, title, text, confirmButtonText: 'OK', cancelButtonText: 'Cancel', destructive: kind === 'error', showCancel: false, cancelValue: false }; }
  private open(model: UiAlertModel): Promise<unknown> {
    const previous = typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const ref = this.overlay.create({
      hasBackdrop: true,
      backdropClass: 'ui-dialog-backdrop',
      panelClass: 'ui-dialog-overlay-pane',
      scrollStrategy: this.overlay.scrollStrategies.block(),
      positionStrategy: this.overlay.position().global().centerHorizontally().centerVertically(),
    });
    const component = ref.attach(new ComponentPortal(UiAlertDialogComponent));
    return new Promise<unknown>((resolve) => {
      let settled = false;
      const finish = (value: unknown): void => {
        if (settled) return;
        settled = true;
        ref.dispose();
        queueMicrotask(() => previous?.focus());
        resolve(value);
      };
      component.instance.configure(model, finish);
      component.changeDetectorRef.detectChanges();
      ref.backdropClick().subscribe(() => finish(model.cancelValue));
      ref.keydownEvents().subscribe((event) => { if (event.key === 'Escape') { event.preventDefault(); finish(model.cancelValue); } });
    });
  }
}

import { Injectable, inject } from '@angular/core';
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import {
  UiAlertAction,
  UiAlertActionKind,
  UiAlertDialogComponent,
  UiAlertKind,
  UiAlertModel,
} from '../../../shared/ui/dialog/ui-alert-dialog.component';

const DIALOG_EXIT_FALLBACK_MS = 180;

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
    return this.open({
      kind: options.icon === 'error' ? 'error' : 'confirm',
      title: options.title,
      text: options.text,
      confirmButtonText: options.confirmButtonText ?? 'Confirm',
      cancelButtonText: options.cancelButtonText ?? 'Cancel',
      destructive: options.destructive === true,
      showCancel: true,
      cancelValue: false,
    }).then((value) => value === true);
  }
  choice<T>(options: DialogChoiceOptions<T>): Promise<T | undefined> {
    const actions: readonly UiAlertAction[] = options.options.map((option) => ({
      id: option.id,
      label: option.label,
      value: option.value,
      kind: option.kind,
    }));
    return this.open({
      kind: options.icon === 'error' ? 'error' : options.icon === 'warning' ? 'warning' : 'confirm',
      title: options.title,
      text: options.text,
      confirmButtonText: '',
      cancelButtonText: '',
      destructive: false,
      showCancel: false,
      actions,
      cancelValue: undefined,
    }).then((value) => value as T | undefined);
  }
  success(title: string, text?: string): Promise<boolean> {
    return this.open(this.notice('success', title, text)).then((value) => value === true);
  }
  warning(title: string, text?: string): Promise<boolean> {
    return this.open(this.notice('warning', title, text)).then((value) => value === true);
  }
  error(title: string, text?: string): Promise<boolean> {
    return this.open(this.notice('error', title, text)).then((value) => value === true);
  }
  info(title: string, text?: string): Promise<boolean> {
    return this.open(this.notice('info', title, text)).then((value) => value === true);
  }

  private notice(kind: UiAlertKind, title: string, text?: string): UiAlertModel {
    return {
      kind,
      title,
      text,
      confirmButtonText: 'OK',
      cancelButtonText: 'Cancel',
      destructive: kind === 'error',
      showCancel: false,
      cancelValue: false,
    };
  }
  private open(model: UiAlertModel): Promise<unknown> {
    const previous =
      typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : undefined;
    const ref = this.overlay.create({
      hasBackdrop: true,
      backdropClass: 'ui-dialog-backdrop',
      panelClass: 'ui-dialog-overlay-pane',
      scrollStrategy: this.overlay.scrollStrategies.block(),
      positionStrategy: this.overlay.position().global().centerHorizontally().centerVertically(),
    });
    const component = ref.attach(new ComponentPortal(UiAlertDialogComponent));
    const dialogHost = component.location.nativeElement as HTMLElement;
    dialogHost.classList.add('workspace-dialog-enter');
    const backdrop = ref.backdropElement;
    backdrop?.classList.add('workspace-dialog-backdrop-enter');
    return new Promise<unknown>((resolve) => {
      let closing = false;
      let disposed = false;
      let exitFallbackTimer: ReturnType<typeof setTimeout> | undefined;
      const finish = (value: unknown): void => {
        if (closing) return;
        closing = true;
        dialogHost.classList.remove('workspace-dialog-enter');
        dialogHost.classList.add('workspace-dialog-exit');
        backdrop?.classList.remove('workspace-dialog-backdrop-enter');
        backdrop?.classList.add('workspace-dialog-backdrop-exit');
        const resolveAfterExit = (): void => {
          if (disposed) return;
          disposed = true;
          if (exitFallbackTimer !== undefined) clearTimeout(exitFallbackTimer);
          dialogHost.removeEventListener('animationend', handleAnimationEnd);
          ref.dispose();
          queueMicrotask(() => previous?.focus());
          resolve(value);
        };
        const handleAnimationEnd = (event: Event): void => {
          if (event.target === dialogHost) resolveAfterExit();
        };
        dialogHost.addEventListener('animationend', handleAnimationEnd);
        exitFallbackTimer = setTimeout(resolveAfterExit, DIALOG_EXIT_FALLBACK_MS);
      };
      component.instance.configure(model, finish);
      component.changeDetectorRef.detectChanges();
      ref.keydownEvents().subscribe((event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          finish(model.cancelValue);
        }
      });
    });
  }
}

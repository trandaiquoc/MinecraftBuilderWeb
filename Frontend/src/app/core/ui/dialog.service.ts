import { Injectable, inject } from '@angular/core';
import type { SweetAlertIcon, SweetAlertOptions } from 'sweetalert2';
import { ThemeService } from './theme.service';

export interface DialogConfirmOptions {
  readonly title: string;
  readonly text?: string;
  readonly confirmButtonText?: string;
  readonly cancelButtonText?: string;
  readonly icon?: SweetAlertIcon;
}

@Injectable({ providedIn: 'root' })
export class DialogService {
  private readonly theme = inject(ThemeService);

  private async fire(options: SweetAlertOptions): Promise<Awaited<ReturnType<(typeof import('sweetalert2'))['default']['fire']>>> {
    const module = await import('sweetalert2');
    const craft = this.theme.preset() === 'craft';
    return module.default.fire({
      ...options,
      buttonsStyling: false,
      customClass: {
        popup: `minecraft-dialog-popup${craft ? ' minecraft-dialog-craft' : ''}${this.theme.font() === 'minecraft-style' ? ' minecraft-dialog-pixel' : ''}`,
        title: 'minecraft-dialog-title',
        htmlContainer: 'minecraft-dialog-body',
        confirmButton: `minecraft-dialog-confirm${options.icon === 'error' ? ' minecraft-dialog-danger' : ''}`,
        cancelButton: 'minecraft-dialog-cancel',
      },
    });
  }

  async confirm(options: DialogConfirmOptions): Promise<boolean> {
    const result = await this.fire({
      title: options.title,
      text: options.text,
      icon: options.icon ?? 'warning',
      showCancelButton: true,
      confirmButtonText: options.confirmButtonText ?? 'Confirm',
      cancelButtonText: options.cancelButtonText ?? 'Cancel',
      reverseButtons: true,
      theme: this.theme.effectiveBase() === 'dark' ? 'dark' : 'light',
    });
    return result.isConfirmed;
  }

  success(title: string, text?: string): Promise<unknown> { return this.fire({ title, text, icon: 'success', theme: this.theme.effectiveBase() === 'dark' ? 'dark' : 'light' }); }
  warning(title: string, text?: string): Promise<unknown> { return this.fire({ title, text, icon: 'warning', theme: this.theme.effectiveBase() === 'dark' ? 'dark' : 'light' }); }
  error(title: string, text?: string): Promise<unknown> { return this.fire({ title, text, icon: 'error', theme: this.theme.effectiveBase() === 'dark' ? 'dark' : 'light' }); }
  info(title: string, text?: string): Promise<unknown> { return this.fire({ title, text, icon: 'info', theme: this.theme.effectiveBase() === 'dark' ? 'dark' : 'light' }); }
}

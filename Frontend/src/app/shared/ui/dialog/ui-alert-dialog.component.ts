import { CdkTrapFocus } from '@angular/cdk/a11y';
import { Component, signal } from '@angular/core';
import { LucideAlertTriangle, LucideCheckCircle2, LucideInfo, LucideX } from '@lucide/angular';

export type UiAlertKind = 'confirm' | 'success' | 'warning' | 'error' | 'info';
export type UiAlertActionKind = 'primary' | 'secondary' | 'danger';
export interface UiAlertAction {
  readonly id: string;
  readonly label: string;
  readonly value: unknown;
  readonly kind?: UiAlertActionKind;
}
export interface UiAlertModel {
  readonly kind: UiAlertKind;
  readonly title: string;
  readonly text?: string;
  readonly confirmButtonText: string;
  readonly cancelButtonText: string;
  readonly destructive: boolean;
  readonly showCancel: boolean;
  readonly actions?: readonly UiAlertAction[];
  readonly cancelValue?: unknown;
}

@Component({
  selector: 'app-ui-alert-dialog',
  imports: [CdkTrapFocus, LucideAlertTriangle, LucideCheckCircle2, LucideInfo, LucideX],
  template: `
    <section
      class="ui-alert-dialog"
      cdkTrapFocus
      [cdkTrapFocusAutoCapture]="true"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      [attr.aria-labelledby]="titleId"
      (keydown)="onKeydown($event)"
    >
      <header class="ui-alert-dialog__header">
        <div class="ui-alert-dialog__icon" [attr.data-kind]="model().kind" aria-hidden="true">
          @switch (model().kind) {
            @case ('success') {
              <svg lucideCheckCircle2></svg>
            }
            @case ('info') {
              <svg lucideInfo></svg>
            }
            @default {
              <svg lucideAlertTriangle></svg>
            }
          }
        </div>
        <h2 [id]="titleId">{{ model().title }}</h2>
        <button type="button" class="ui-close-button" aria-label="Close" (click)="cancel()">
          <svg lucideX aria-hidden="true"></svg>
        </button>
      </header>
      @if (model().text) {
        <p class="ui-alert-dialog__text">{{ model().text }}</p>
      }
      <footer class="ui-alert-dialog__actions">
        @if (model().actions; as actions) {
          @for (action of actions; track action.id) {
            <button
              type="button"
              class="ui-button"
              [class.ui-button--danger]="action.kind === 'danger'"
              [class.ui-button--secondary]="action.kind === 'secondary' || !action.kind"
              [class.ui-button--primary]="action.kind === 'primary'"
              (click)="choose(action.value)"
            >
              {{ action.label }}
            </button>
          }
        } @else {
          @if (model().showCancel) {
            <button type="button" class="ui-button ui-button--secondary" (click)="cancel()">
              {{ model().cancelButtonText }}
            </button>
          }
          <button
            type="button"
            class="ui-button"
            [class.ui-button--danger]="model().destructive || model().kind === 'error'"
            [class.ui-button--primary]="!model().destructive && model().kind !== 'error'"
            (click)="confirm()"
          >
            {{ model().confirmButtonText }}
          </button>
        }
      </footer>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        width: min(30rem, calc(100vw - 2rem));
      }
      .ui-alert-dialog {
        display: grid;
        gap: 1rem;
        padding: 1.1rem;
        border: 0;
        border-radius: var(--radius-lg);
        background: var(--surface-raised);
        color: var(--text);
        box-shadow: var(--shadow-dialog);
      }
      .ui-alert-dialog__header {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: 0.65rem;
      }
      .ui-alert-dialog__header h2 {
        margin: 0;
        font: 650 1rem/1.2 var(--font-ui);
      }
      .ui-alert-dialog__icon {
        display: grid;
        place-items: center;
        color: var(--accent);
      }
      .ui-alert-dialog__icon[data-kind='warning'] {
        color: var(--warning);
      }
      .ui-alert-dialog__icon[data-kind='error'] {
        color: var(--danger);
      }
      .ui-alert-dialog__icon svg {
        width: 1.15rem;
        height: 1.15rem;
      }
      .ui-alert-dialog__text {
        margin: 0;
        color: var(--text-muted);
        line-height: 1.45;
        white-space: pre-wrap;
      }
      .ui-alert-dialog__actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
      }
      @media (prefers-reduced-motion: reduce) {
        .ui-alert-dialog * {
          transition: none;
        }
      }
    `,
  ],
})
export class UiAlertDialogComponent {
  readonly model = signal<UiAlertModel>({
    kind: 'info',
    title: '',
    confirmButtonText: 'OK',
    cancelButtonText: 'Cancel',
    destructive: false,
    showCancel: false,
    cancelValue: false,
  });
  readonly titleId = `ui-alert-title-${Math.random().toString(36).slice(2)}`;
  private finish?: (value: unknown) => void;
  configure(model: UiAlertModel, finish: (value: unknown) => void): void {
    this.model.set(model);
    this.finish = finish;
  }
  protected confirm(): void {
    this.finish?.(true);
  }
  protected choose(value: unknown): void {
    this.finish?.(value);
  }
  protected cancel(): void {
    this.finish?.(this.model().cancelValue);
  }
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancel();
    }
  }
}

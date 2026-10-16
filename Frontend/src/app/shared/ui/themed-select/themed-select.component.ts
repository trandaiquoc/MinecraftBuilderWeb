import { CdkConnectedOverlay, CdkOverlayOrigin } from '@angular/cdk/overlay';
import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { LucideCheck, LucideChevronDown } from '@lucide/angular';

export interface ThemedSelectOption {
  readonly id: string;
  readonly label: string;
}

let nextThemedSelectId = 0;

@Component({
  selector: 'app-themed-select',
  imports: [LucideCheck, LucideChevronDown, CdkConnectedOverlay, CdkOverlayOrigin],
  templateUrl: './themed-select.component.html',
  styleUrl: './themed-select.component.scss',
})
export class ThemedSelectComponent {
  @Input() options: readonly ThemedSelectOption[] = [];
  @Input() selectedId = '';
  @Input() ariaLabel = '';
  @Input() disabled = false;
  @Output() readonly selectionChange = new EventEmitter<string>();
  protected readonly open = signal(false);
  protected readonly activeIndex = signal(0);
  protected readonly listboxId = `themed-select-listbox-${++nextThemedSelectId}`;

  protected get selectedLabel(): string {
    return this.options.find((option) => option.id === this.selectedId)?.label ?? '';
  }
  protected optionId(index: number): string {
    return `${this.listboxId}-option-${index}`;
  }
  protected activeOptionId(): string | null {
    return this.open() && this.options[this.activeIndex()]
      ? this.optionId(this.activeIndex())
      : null;
  }
  protected toggle(): void {
    if (this.disabled) return;
    const opening = !this.open();
    this.open.set(opening);
    if (opening) this.activeIndex.set(this.selectedOptionIndex());
  }
  protected close(): void {
    this.open.set(false);
  }
  protected preserveTriggerFocus(event: MouseEvent): void {
    event.preventDefault();
  }
  protected choose(id: string): void {
    this.selectionChange.emit(id);
    this.close();
  }
  protected onTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!this.open()) {
        this.activeIndex.set(this.selectedOptionIndex(event.key));
        this.open.set(true);
        return;
      }
      const optionCount = this.options.length;
      this.activeIndex.update(
        (index) =>
          (index + (event.key === 'ArrowDown' ? 1 : -1) + optionCount) % Math.max(1, optionCount),
      );
      return;
    }
    if (event.key === 'Escape') {
      if (!this.open()) return;
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }
    if (this.open() && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      const option = this.options[this.activeIndex()];
      if (option) this.choose(option.id);
      return;
    }
    if (this.open() && (event.key === 'Home' || event.key === 'End')) {
      event.preventDefault();
      this.activeIndex.set(event.key === 'Home' ? 0 : Math.max(0, this.options.length - 1));
      return;
    }
  }
  private selectedOptionIndex(openingKey?: string): number {
    const selectedIndex = this.options.findIndex((option) => option.id === this.selectedId);
    if (selectedIndex >= 0) return selectedIndex;
    return openingKey === 'ArrowUp' ? Math.max(0, this.options.length - 1) : 0;
  }
}

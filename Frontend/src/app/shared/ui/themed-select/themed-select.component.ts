import { CdkConnectedOverlay, CdkOverlayOrigin } from '@angular/cdk/overlay';
import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { LucideCheck, LucideChevronDown } from '@lucide/angular';

export interface ThemedSelectOption { readonly id: string; readonly label: string; }

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

  protected get selectedLabel(): string { return this.options.find((option) => option.id === this.selectedId)?.label ?? ''; }
  protected toggle(): void { if (this.disabled) return; this.open.update((open) => !open); this.activeIndex.set(Math.max(0, this.options.findIndex((option) => option.id === this.selectedId))); }
  protected choose(id: string): void { this.selectionChange.emit(id); this.open.set(false); }
  protected onTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); this.open.set(true); this.activeIndex.update((index) => (index + (event.key === 'ArrowDown' ? 1 : -1) + this.options.length) % Math.max(1, this.options.length)); return; }
    if (event.key === 'Escape') { event.preventDefault(); this.open.set(false); }
    if (event.key === 'Enter' && this.open()) { event.preventDefault(); const option = this.options[this.activeIndex()]; if (option) this.choose(option.id); }
  }
}

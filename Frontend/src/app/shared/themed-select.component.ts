import { Component, ElementRef, HostListener, Input, Output, EventEmitter, inject, signal } from '@angular/core';
import { LucideCheck, LucideChevronDown } from '@lucide/angular';

export interface ThemedSelectOption { readonly id: string; readonly label: string; }

@Component({
  selector: 'app-themed-select',
  imports: [LucideCheck, LucideChevronDown],
  templateUrl: './themed-select.component.html',
  styleUrl: './themed-select.component.scss',
  host: { '(document:pointerdown)': 'outsidePointer($event)', '(document:keydown)': 'documentKeydown($event)' },
})
export class ThemedSelectComponent {
  @Input() options: readonly ThemedSelectOption[] = [];
  @Input() selectedId = '';
  @Input() ariaLabel = '';
  @Output() readonly selectionChange = new EventEmitter<string>();
  protected readonly open = signal(false);
  protected readonly activeIndex = signal(0);
  private readonly host = inject(ElementRef<HTMLElement>);

  protected get selectedLabel(): string { return this.options.find((option) => option.id === this.selectedId)?.label ?? ''; }
  protected toggle(): void { this.open.update((open) => !open); this.activeIndex.set(Math.max(0, this.options.findIndex((option) => option.id === this.selectedId))); }
  protected choose(id: string): void { this.selectionChange.emit(id); this.open.set(false); }
  protected onTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); this.open.set(true); this.activeIndex.update((index) => (index + (event.key === 'ArrowDown' ? 1 : -1) + this.options.length) % Math.max(1, this.options.length)); return; }
    if (event.key === 'Escape') { event.preventDefault(); this.open.set(false); }
  }
  protected outsidePointer(event: PointerEvent): void { if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.open.set(false); }
  protected documentKeydown(event: KeyboardEvent): void {
    if (!this.open()) return;
    if (event.key === 'Escape') { event.preventDefault(); this.open.set(false); }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); this.activeIndex.update((index) => (index + (event.key === 'ArrowDown' ? 1 : -1) + this.options.length) % Math.max(1, this.options.length)); }
    else if (event.key === 'Enter') { event.preventDefault(); const option = this.options[this.activeIndex()]; if (option) this.choose(option.id); }
  }
}

import { TestBed } from '@angular/core/testing';
import { SearchableDropdownComponent } from './searchable-dropdown.component';

describe('SearchableDropdownComponent', () => {
  it('opens, filters, selects, and closes with Escape', async () => {
    await TestBed.configureTestingModule({ imports: [SearchableDropdownComponent] }).compileComponents();
    const fixture = TestBed.createComponent(SearchableDropdownComponent);
    fixture.componentRef.setInput('options', [
      { id: 'minecraft:diamond', label: 'Diamond', secondary: 'minecraft:diamond' },
      { id: 'minecraft:oak_log', label: 'Oak Log', secondary: 'minecraft:oak_log' },
    ]);
    fixture.componentRef.setInput('placeholder', 'Search items');
    fixture.componentRef.setInput('emptyLabel', 'Empty frame');
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.dropdown-popover')).toBeNull();
    (host.querySelector('.dropdown-trigger') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(host.querySelector('.dropdown-popover')).toBeTruthy();
    const input = host.querySelector('.dropdown-search') as HTMLInputElement;
    input.value = 'oak'; input.dispatchEvent(new Event('input')); fixture.detectChanges();
    expect(host.textContent).toContain('Oak Log');
    expect(host.textContent).not.toContain('Diamond');
    (host.querySelector('.dropdown-option:not(.active-option)') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(host.querySelector('.dropdown-popover')).toBeNull();
    (host.querySelector('.dropdown-trigger') as HTMLButtonElement).click(); fixture.detectChanges();
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); fixture.detectChanges();
    expect(host.querySelector('.dropdown-popover')).toBeNull();
  });

  it('keeps the selected row separate from keyboard focus on open', async () => {
    await TestBed.configureTestingModule({ imports: [SearchableDropdownComponent] }).compileComponents();
    const fixture = TestBed.createComponent(SearchableDropdownComponent);
    fixture.componentRef.setInput('options', [
      { id: 'minecraft:diamond', label: 'Diamond' },
      { id: 'minecraft:oak_log', label: 'Oak Log' },
    ]);
    fixture.componentRef.setInput('selectedId', 'minecraft:oak_log');
    let selected = '';
    fixture.componentInstance.selectionChange.subscribe((id) => selected = id);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    (host.querySelector('.dropdown-trigger') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(host.querySelector('.dropdown-option.selected')?.textContent).toContain('Oak Log');
    expect(host.querySelector('.dropdown-option.active-option')).toBeNull();

    const input = host.querySelector('.dropdown-search') as HTMLInputElement;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
    expect(selected).toBe('');
    expect(host.querySelector('.dropdown-popover')).toBeTruthy();

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();
    expect(host.querySelector('.dropdown-option.active-option')).toBeTruthy();
  });
});

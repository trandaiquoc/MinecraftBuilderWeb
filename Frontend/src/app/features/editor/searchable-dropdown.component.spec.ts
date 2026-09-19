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
});

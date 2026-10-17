import { TestBed } from '@angular/core/testing';
import { SearchableDropdownComponent } from './searchable-dropdown.component';

describe('SearchableDropdownComponent', () => {
  it('names the current selection alongside the control context', async () => {
    await TestBed.configureTestingModule({
      imports: [SearchableDropdownComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(SearchableDropdownComponent);
    fixture.componentRef.setInput('options', [
      {
        id: '1.21.1',
        label: 'Java 1.21.1',
        secondary: 'Verified support',
      },
    ]);
    fixture.componentRef.setInput('selectedId', '1.21.1');
    fixture.componentRef.setInput('ariaLabel', 'Minecraft version');
    fixture.detectChanges();

    const trigger = fixture.nativeElement.querySelector('.dropdown-trigger') as HTMLButtonElement;
    expect(trigger.getAttribute('role')).toBe('combobox');
    expect(trigger.getAttribute('aria-label')).toBe(
      'Minecraft version, Java 1.21.1, Verified support',
    );
    fixture.destroy();
  });

  it('opens, filters, selects, and closes with Escape', async () => {
    await TestBed.configureTestingModule({
      imports: [SearchableDropdownComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(SearchableDropdownComponent);
    fixture.componentRef.setInput('options', [
      { id: 'minecraft:diamond', label: 'Diamond', secondary: 'minecraft:diamond' },
      { id: 'minecraft:oak_log', label: 'Oak Log', secondary: 'minecraft:oak_log' },
    ]);
    fixture.componentRef.setInput('placeholder', 'Search items');
    fixture.componentRef.setInput('emptyLabel', 'Empty frame');
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const trigger = host.querySelector('.dropdown-trigger') as HTMLButtonElement;
    expect(host.querySelector('.dropdown-popover')).toBeNull();
    trigger.click();
    fixture.detectChanges();
    const overlay = () => document.body.querySelector('.dropdown-popover');
    expect(overlay()).toBeTruthy();
    const input = document.body.querySelector('.dropdown-search') as HTMLInputElement;
    input.value = 'oak';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(document.body.textContent).toContain('Oak Log');
    expect(document.body.textContent).not.toContain('Diamond');
    (
      document.body.querySelector('.dropdown-option:not(.active-option)') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(overlay()).toBeNull();
    expect(document.activeElement).toBe(trigger);
    trigger.click();
    fixture.detectChanges();
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(overlay()).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('keeps the selected row separate from keyboard focus on open', async () => {
    await TestBed.configureTestingModule({
      imports: [SearchableDropdownComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(SearchableDropdownComponent);
    fixture.componentRef.setInput('options', [
      { id: 'minecraft:diamond', label: 'Diamond' },
      { id: 'minecraft:oak_log', label: 'Oak Log' },
    ]);
    fixture.componentRef.setInput('selectedId', 'minecraft:oak_log');
    let selected = '';
    fixture.componentInstance.selectionChange.subscribe((id) => (selected = id));
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    (host.querySelector('.dropdown-trigger') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(document.body.querySelector('.dropdown-option.selected')?.textContent).toContain(
      'Oak Log',
    );
    expect(document.body.querySelector('.dropdown-option.active-option')).toBeNull();

    const input = document.body.querySelector('.dropdown-search') as HTMLInputElement;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
    expect(selected).toBe('');
    expect(document.body.querySelector('.dropdown-popover')).toBeTruthy();

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();
    expect(document.body.querySelector('.dropdown-option.active-option')).toBeTruthy();
  });

  it('returns focus to the combobox after keyboard selection closes the popover', async () => {
    await TestBed.configureTestingModule({
      imports: [SearchableDropdownComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(SearchableDropdownComponent);
    fixture.componentRef.setInput('options', [{ id: 'minecraft:diamond', label: 'Diamond' }]);
    fixture.detectChanges();
    const trigger = fixture.nativeElement.querySelector('.dropdown-trigger') as HTMLButtonElement;
    trigger.focus();
    trigger.click();
    fixture.detectChanges();

    const search = document.body.querySelector('.dropdown-search') as HTMLInputElement;
    search.focus();
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.body.querySelector('.dropdown-popover')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    fixture.destroy();
  });

  it('caps prepared search results for large option sets', async () => {
    await TestBed.configureTestingModule({
      imports: [SearchableDropdownComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(SearchableDropdownComponent);
    fixture.componentRef.setInput(
      'options',
      Array.from({ length: 10000 }, (_, index) => ({
        id: `example:${index}`,
        label: `Block ${index}`,
        secondary: 'Example Mod',
      })),
    );
    fixture.detectChanges();
    fixture.componentInstance['setQuery']({ target: { value: 'example mod' } } as unknown as Event);
    expect(fixture.componentInstance['filteredOptions']()).toHaveLength(100);
  });
});

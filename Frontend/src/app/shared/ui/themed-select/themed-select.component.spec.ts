import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemedSelectComponent, ThemedSelectOption } from './themed-select.component';

describe('ThemedSelectComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  async function createSelect(selectedId = 'north') {
    await TestBed.configureTestingModule({ imports: [ThemedSelectComponent] }).compileComponents();
    const fixture = TestBed.createComponent(ThemedSelectComponent);
    const options: readonly ThemedSelectOption[] = [
      { id: 'east', label: 'East' },
      { id: 'north', label: 'North' },
      { id: 'south', label: 'South' },
      { id: 'west', label: 'West' },
    ];
    fixture.componentRef.setInput('options', options);
    fixture.componentRef.setInput('selectedId', selectedId);
    fixture.componentRef.setInput('ariaLabel', 'Facing');
    fixture.detectChanges();
    return fixture;
  }

  it('exposes the active option while keeping DOM focus on the combobox', async () => {
    const fixture = await createSelect();
    const trigger = fixture.nativeElement.querySelector('[role="combobox"]') as HTMLButtonElement;
    trigger.focus();
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();

    const listbox = document.querySelector('[role="listbox"]') as HTMLElement;
    const activeId = trigger.getAttribute('aria-activedescendant');
    const activeOption = document.getElementById(activeId ?? '');

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.getAttribute('aria-controls')).toBe(listbox.id);
    expect(activeOption?.textContent?.trim()).toBe('North');
    expect(activeOption?.getAttribute('aria-selected')).toBe('true');
    expect(activeOption?.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(trigger);

    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();
    expect(
      document.getElementById(trigger.getAttribute('aria-activedescendant') ?? '')?.textContent,
    ).toContain('South');

    let chosen = '';
    fixture.componentInstance.selectionChange.subscribe((id) => (chosen = id));
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
    expect(chosen).toBe('south');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.hasAttribute('aria-controls')).toBe(false);
    expect(trigger.hasAttribute('aria-activedescendant')).toBe(false);
    fixture.destroy();
  });

  it('supports Home, End, and Space within the open listbox', async () => {
    const fixture = await createSelect();
    const trigger = fixture.nativeElement.querySelector('[role="combobox"]') as HTMLButtonElement;
    trigger.focus();
    trigger.click();
    fixture.detectChanges();
    let chosen = '';
    fixture.componentInstance.selectionChange.subscribe((id) => (chosen = id));

    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    fixture.detectChanges();
    expect(
      document.getElementById(trigger.getAttribute('aria-activedescendant') ?? '')?.textContent,
    ).toContain('West');
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    fixture.detectChanges();
    expect(
      document.getElementById(trigger.getAttribute('aria-activedescendant') ?? '')?.textContent,
    ).toContain('East');
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    trigger.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }),
    );
    fixture.detectChanges();

    expect(chosen).toBe('west');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    fixture.destroy();
  });

  it('closes on Escape without sending the key to a parent dialog', async () => {
    const fixture = await createSelect();
    const trigger = fixture.nativeElement.querySelector('[role="combobox"]') as HTMLButtonElement;
    trigger.focus();
    trigger.click();
    fixture.detectChanges();
    const documentKeydown = vi.fn();
    document.addEventListener('keydown', documentKeydown);

    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    const stopPropagation = vi.spyOn(escape, 'stopPropagation');
    trigger.dispatchEvent(escape);
    fixture.detectChanges();
    document.removeEventListener('keydown', documentKeydown);

    expect(escape.defaultPrevented).toBe(true);
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(documentKeydown).not.toHaveBeenCalled();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
    fixture.destroy();
  });

  it('closes when Tab moves focus away from the trigger', async () => {
    const fixture = await createSelect();
    const trigger = fixture.nativeElement.querySelector('[role="combobox"]') as HTMLButtonElement;
    const outside = document.createElement('button');
    fixture.nativeElement.append(outside);
    trigger.focus();
    trigger.click();
    fixture.detectChanges();
    expect(document.querySelector('[role="listbox"]')).not.toBeNull();

    outside.focus();
    fixture.detectChanges();

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(document.activeElement).toBe(outside);
    fixture.destroy();
  });

  it('uses a unique listbox id for each select instance', () => {
    const first = new ThemedSelectComponent() as unknown as { listboxId: string };
    const second = new ThemedSelectComponent() as unknown as { listboxId: string };

    expect(first.listboxId).not.toBe(second.listboxId);
  });
});

import { OverlayModule, OverlayContainer } from '@angular/cdk/overlay';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { DialogService } from './dialog.service';
import { UiAlertDialogComponent } from '../../../shared/ui/dialog/ui-alert-dialog.component';

function completeDialogExit(overlayContainer: OverlayContainer): void {
  const surface = overlayContainer
    .getContainerElement()
    .querySelector<HTMLElement>('.ui-dialog-overlay-pane.workspace-dialog-exit');
  surface?.dispatchEvent(new Event('animationend'));
}

describe('DialogService', () => {
  let service: DialogService;
  let overlayContainer: OverlayContainer;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OverlayModule, UiAlertDialogComponent],
      providers: [DialogService],
    }).compileComponents();
    service = TestBed.inject(DialogService);
    overlayContainer = TestBed.inject(OverlayContainer);
  });

  afterEach(() => overlayContainer.getContainerElement().replaceChildren());

  it('resolves confirm with true and applies destructive styling', async () => {
    const result = service.confirm({
      title: 'Delete',
      confirmButtonText: 'Delete',
      destructive: true,
    });
    await Promise.resolve();
    const dialogHost = overlayContainer
      .getContainerElement()
      .querySelector('.ui-dialog-overlay-pane app-ui-alert-dialog') as HTMLElement;
    expect(dialogHost.classList.contains('workspace-dialog-enter')).toBe(true);
    const pane = overlayContainer
      .getContainerElement()
      .querySelector('.ui-alert-dialog') as HTMLElement;
    expect(pane.querySelector('.ui-button--danger')).toBeTruthy();
    (
      Array.from(pane.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('Delete'),
      ) as HTMLButtonElement
    ).click();
    expect(dialogHost.classList.contains('workspace-dialog-exit')).toBe(true);
    completeDialogExit(overlayContainer);
    await expect(result).resolves.toBe(true);
  });

  it('resolves cancel and Escape as false', async () => {
    const cancelled = service.confirm({
      title: 'Confirm',
      confirmButtonText: 'OK',
      cancelButtonText: 'Cancel',
    });
    await Promise.resolve();
    const pane = overlayContainer
      .getContainerElement()
      .querySelector('.ui-alert-dialog') as HTMLElement;
    (
      Array.from(pane.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('Cancel'),
      ) as HTMLButtonElement
    ).click();
    completeDialogExit(overlayContainer);
    await expect(cancelled).resolves.toBe(false);

    const escaped = service.confirm({ title: 'Confirm' });
    await Promise.resolve();
    overlayContainer
      .getContainerElement()
      .querySelector('.ui-alert-dialog')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    completeDialogExit(overlayContainer);
    await expect(escaped).resolves.toBe(false);
  });

  it('keeps an alert open when the modal backdrop is clicked', async () => {
    let settled = false;
    const pending = service.confirm({ title: 'Confirm', confirmButtonText: 'OK' }).then(() => {
      settled = true;
    });
    await Promise.resolve();
    (
      overlayContainer.getContainerElement().querySelector('.cdk-overlay-backdrop') as HTMLElement
    ).click();
    await Promise.resolve();
    expect(settled).toBe(false);
    (
      overlayContainer
        .getContainerElement()
        .querySelector('.ui-alert-dialog .ui-button') as HTMLButtonElement
    ).click();
    completeDialogExit(overlayContainer);
    await expect(pending).resolves.toBeUndefined();
  });

  it('disposes the overlay if the exit animation event does not arrive', async () => {
    vi.useFakeTimers();
    try {
      const result = service.info('Saved');
      await Promise.resolve();
      const host = overlayContainer
        .getContainerElement()
        .querySelector('.ui-dialog-overlay-pane app-ui-alert-dialog') as HTMLElement;
      (host.querySelector('.ui-button') as HTMLButtonElement).click();

      await vi.advanceTimersByTimeAsync(180);

      await expect(result).resolves.toBe(true);
      expect(
        overlayContainer.getContainerElement().querySelector('app-ui-alert-dialog'),
      ).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('resolves a typed choice and uses undefined for Escape', async () => {
    const result = service.choice({
      title: 'Choose',
      options: [
        { id: 'resize', label: 'Resize', value: 'resize', kind: 'primary' },
        { id: 'keep', label: 'Keep', value: 'keep', kind: 'secondary' },
      ] as const,
    });
    await Promise.resolve();
    const pane = overlayContainer
      .getContainerElement()
      .querySelector('.ui-alert-dialog') as HTMLElement;
    (
      Array.from(pane.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('Keep'),
      ) as HTMLButtonElement
    ).click();
    completeDialogExit(overlayContainer);
    await expect(result).resolves.toBe('keep');

    const cancelled = service.choice({
      title: 'Choose',
      options: [{ id: 'resize', label: 'Resize', value: 'resize' }],
    });
    await Promise.resolve();
    overlayContainer
      .getContainerElement()
      .querySelector('.ui-alert-dialog')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    completeDialogExit(overlayContainer);
    await expect(cancelled).resolves.toBeUndefined();
  });

  it.each(['success', 'warning', 'error', 'info'] as const)(
    'opens %s notice with a single action',
    async (kind) => {
      const result = service[kind](kind);
      await Promise.resolve();
      const pane = overlayContainer
        .getContainerElement()
        .querySelector('.ui-alert-dialog') as HTMLElement;
      expect(pane).toBeTruthy();
      (pane.querySelector('.ui-button') as HTMLButtonElement).click();
      completeDialogExit(overlayContainer);
      await expect(result).resolves.toBe(true);
    },
  );
});

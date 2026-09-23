import { OverlayModule, OverlayContainer } from '@angular/cdk/overlay';
import { TestBed } from '@angular/core/testing';
import { DialogService } from './dialog.service';
import { UiAlertDialogComponent } from '../../../shared/ui/dialog/ui-alert-dialog.component';

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
    const result = service.confirm({ title: 'Delete', confirmButtonText: 'Delete', destructive: true });
    await Promise.resolve();
    const pane = overlayContainer.getContainerElement().querySelector('.ui-alert-dialog') as HTMLElement;
    expect(pane.querySelector('.ui-button--danger')).toBeTruthy();
    (Array.from(pane.querySelectorAll('button')).find((button) => button.textContent?.includes('Delete')) as HTMLButtonElement).click();
    await expect(result).resolves.toBe(true);
  });

  it('resolves cancel and Escape as false', async () => {
    const cancelled = service.confirm({ title: 'Confirm', confirmButtonText: 'OK', cancelButtonText: 'Cancel' });
    await Promise.resolve();
    const pane = overlayContainer.getContainerElement().querySelector('.ui-alert-dialog') as HTMLElement;
    (Array.from(pane.querySelectorAll('button')).find((button) => button.textContent?.includes('Cancel')) as HTMLButtonElement).click();
    await expect(cancelled).resolves.toBe(false);

    const escaped = service.confirm({ title: 'Confirm' });
    await Promise.resolve();
    overlayContainer.getContainerElement().querySelector('.ui-alert-dialog')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await expect(escaped).resolves.toBe(false);
  });

  it.each(['success', 'warning', 'error', 'info'] as const)('opens %s notice with a single action', async (kind) => {
    const result = service[kind](kind);
    await Promise.resolve();
    const pane = overlayContainer.getContainerElement().querySelector('.ui-alert-dialog') as HTMLElement;
    expect(pane).toBeTruthy();
    (pane.querySelector('.ui-button') as HTMLButtonElement).click();
    await expect(result).resolves.toBe(true);
  });
});

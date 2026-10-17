import {
  Component,
  ElementRef,
  OnDestroy,
  AfterViewInit,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import { GroupService } from '../../../../core/editor/groups/group.service';
import { EditorLayoutPreferencesService } from '../../../../core/ui/preferences/editor-layout-preferences.service';
import { GroupMovePanelSession } from './group-move-panel-session';
import { LucideRotateCcw, LucideX } from '@lucide/angular';
import { UiTooltipDirective } from '../../../../shared/ui/tooltip/ui-tooltip.directive';

@Component({
  selector: 'app-group-move-panel',
  imports: [LucideRotateCcw, LucideX, UiTooltipDirective],
  templateUrl: './group-move-panel.component.html',
  styleUrl: './group-move-panel.component.scss',
  host: {
    '(document:pointermove)': 'session.move($event)',
    '(document:pointerup)': 'session.end($event)',
    '(document:pointercancel)': 'session.end($event)',
    '(window:resize)': 'session.scheduleClamp()',
  },
})
export class GroupMovePanelComponent implements AfterViewInit, OnDestroy {
  protected readonly i18n = inject(I18nService);
  protected readonly groups = inject(GroupService);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly layout = inject(EditorLayoutPreferencesService);
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private resizeObserver?: ResizeObserver;

  readonly visible = input.required<boolean>();
  readonly closeRequested = output<void>();
  protected readonly session = new GroupMovePanelSession(
    this.layout,
    () => {
      const viewport = this.host.nativeElement.parentElement;
      return { width: viewport?.clientWidth ?? 640, height: viewport?.clientHeight ?? 480 };
    },
    () => {
      const panel = this.panel()?.nativeElement;
      return { width: panel?.offsetWidth ?? 300, height: panel?.offsetHeight ?? 280 };
    },
  );

  ngAfterViewInit(): void {
    const viewport = this.host.nativeElement.parentElement;
    if (viewport && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.session.scheduleClamp());
      this.resizeObserver.observe(viewport);
    }
    this.session.scheduleClamp();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.session.cancelDrag();
  }

  protected close(): void {
    this.session.cancelDrag();
    this.closeRequested.emit();
  }

  protected saveMove(): void {
    this.groups.saveMove();
    this.closeRequested.emit();
  }

  protected setOffset(axis: 'x' | 'y' | 'z', event: Event): void {
    this.groups.setMoveOffset(axis, Number((event.target as HTMLInputElement).value));
  }

  protected setStep(event: Event): void {
    this.groups.setMoveStep(Number((event.target as HTMLInputElement).value));
  }

  protected hasMoveTargets(): boolean {
    const preview = this.groups.movePreview();
    return !!preview && (preview.positions.length > 0 || preview.decorationIds.length > 0);
  }

  protected moveReason(): string {
    const reason = this.groups.movePreview()?.reason;
    return reason === 'bounds'
      ? this.i18n.t('moveOutsideBounds')
      : reason === 'collision'
        ? this.i18n.t('moveCollision')
        : reason === 'locked'
          ? this.i18n.t('moveLocked')
          : '';
  }
}

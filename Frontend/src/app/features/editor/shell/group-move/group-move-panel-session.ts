import { computed } from '@angular/core';
import { EditorLayoutPreferencesService } from '../../../../core/ui/preferences/editor-layout-preferences.service';
import { clampGroupMovePanelPosition, type PanelPosition } from './group-move-panel';

export interface MovePanelSize {
  readonly width: number;
  readonly height: number;
}

/** Owns only floating-panel geometry, pointer drag and persisted placement. */
export class GroupMovePanelSession {
  private drag?: {
    readonly pointerId: number;
    readonly startX: number;
    readonly startY: number;
    readonly origin: PanelPosition;
  };
  private clampFrame?: number;
  readonly position = computed(() => {
    const preferences = this.layout.preferences();
    const viewport = this.viewportSize();
    const panel = this.panelSize();
    return clampGroupMovePanelPosition(
      {
        x: preferences.groupMovePanelX ?? Math.max(16, viewport.width - 316),
        y: preferences.groupMovePanelY ?? 16,
      },
      viewport,
      panel,
    );
  });

  constructor(
    private readonly layout: EditorLayoutPreferencesService,
    private readonly viewportSize: () => MovePanelSize,
    private readonly panelSize: () => MovePanelSize,
  ) {}

  begin(event: PointerEvent): void {
    if (
      event.button !== 0 ||
      (event.target instanceof HTMLElement &&
        event.target.closest('button, input, select, textarea'))
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    this.drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: this.position(),
    };
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  move(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    this.persist(
      this.clamp({
        x: drag.origin.x + event.clientX - drag.startX,
        y: drag.origin.y + event.clientY - drag.startY,
      }),
    );
  }

  end(event?: PointerEvent): void {
    if (event && this.drag && event.pointerId !== this.drag.pointerId) return;
    this.drag = undefined;
  }

  scheduleClamp(): void {
    if (this.clampFrame !== undefined) return;
    if (typeof requestAnimationFrame === 'function') {
      this.clampFrame = requestAnimationFrame(() => {
        this.clampFrame = undefined;
        this.clampPersistedPosition();
      });
    } else queueMicrotask(() => this.clampPersistedPosition());
  }

  clampPersistedPosition(): void {
    const position = this.position();
    const preferences = this.layout.preferences();
    if (preferences.groupMovePanelX !== position.x || preferences.groupMovePanelY !== position.y)
      this.persist(position);
  }

  cancelDrag(): void {
    if (this.clampFrame !== undefined && typeof cancelAnimationFrame === 'function')
      cancelAnimationFrame(this.clampFrame);
    this.clampFrame = undefined;
    this.drag = undefined;
  }

  private clamp(position: PanelPosition): PanelPosition {
    return clampGroupMovePanelPosition(position, this.viewportSize(), this.panelSize());
  }
  private persist(position: PanelPosition): void {
    this.layout.setGroupMovePanelPosition(position.x, position.y);
  }
}

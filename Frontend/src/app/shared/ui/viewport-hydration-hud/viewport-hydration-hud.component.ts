import { Component, OnDestroy, effect, inject, input, signal } from '@angular/core';
import { I18nService } from '../../../core/ui/localization/i18n.service';
import { ViewportHydrationProgress, VIEWPORT_HYDRATION_COMPLETE_DISPLAY_MS, VIEWPORT_HYDRATION_HUD_DELAY_MS, VIEWPORT_HYDRATION_HUD_WORK_THRESHOLD } from '../../../core/renderer/engine/three-viewport-engine';
import { UiProgressComponent } from '../progress/ui-progress.component';

@Component({
  selector: 'app-viewport-hydration-hud',
  imports: [UiProgressComponent],
  templateUrl: './viewport-hydration-hud.component.html',
  styleUrl: './viewport-hydration-hud.component.scss',
})
export class ViewportHydrationHudComponent implements OnDestroy {
  protected readonly i18n = inject(I18nService);
  readonly progress = input.required<ViewportHydrationProgress>();
  protected readonly visible = signal(false);
  private hasShownForGeneration = false;
  private showTimer?: ReturnType<typeof setTimeout>;
  private hideTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => this.syncVisibility(this.progress()));
  }

  ngOnDestroy(): void {
    if (this.showTimer !== undefined) clearTimeout(this.showTimer);
    if (this.hideTimer !== undefined) clearTimeout(this.hideTimer);
  }

  protected blocksLabel(progress: ViewportHydrationProgress): string { return `${progress.blocksCompleted.toLocaleString(this.i18n.locale() === 'vi' ? 'vi-VN' : 'en-US')} / ${progress.blocksTotal.toLocaleString(this.i18n.locale() === 'vi' ? 'vi-VN' : 'en-US')} ${this.i18n.t('viewportHydrationBlocks')}`; }

  protected decorationsLabel(progress: ViewportHydrationProgress): string { return `${progress.decorationsCompleted.toLocaleString(this.i18n.locale() === 'vi' ? 'vi-VN' : 'en-US')} / ${progress.decorationsTotal.toLocaleString(this.i18n.locale() === 'vi' ? 'vi-VN' : 'en-US')} ${this.i18n.t('viewportHydrationDecorations')}`; }

  protected percentLabel(progress: ViewportHydrationProgress): string { return `${progress.percent.toLocaleString(this.i18n.locale() === 'vi' ? 'vi-VN' : 'en-US', { minimumFractionDigits: progress.status === 'complete' ? 0 : 1, maximumFractionDigits: 1 })}%`; }

  private syncVisibility(progress: ViewportHydrationProgress): void {
    if (this.showTimer !== undefined) { clearTimeout(this.showTimer); this.showTimer = undefined; }
    if (this.hideTimer !== undefined) { clearTimeout(this.hideTimer); this.hideTimer = undefined; }
    if (progress.status === 'idle') { this.hasShownForGeneration = false; this.visible.set(false); return; }
    if (progress.status === 'complete') {
      if (!this.hasShownForGeneration) { this.visible.set(false); return; }
      this.visible.set(true);
      this.hideTimer = setTimeout(() => this.visible.set(false), VIEWPORT_HYDRATION_COMPLETE_DISPLAY_MS);
      return;
    }
    if (progress.total >= VIEWPORT_HYDRATION_HUD_WORK_THRESHOLD) { this.hasShownForGeneration = true; this.visible.set(true); return; }
    this.showTimer = setTimeout(() => { this.hasShownForGeneration = true; this.visible.set(true); }, VIEWPORT_HYDRATION_HUD_DELAY_MS);
  }
}

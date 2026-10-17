import {
  AfterViewInit,
  Component,
  ElementRef,
  ErrorHandler,
  OnDestroy,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { LucideImage } from '@lucide/angular';
import type { ProjectSummary } from '../../../core/persistence/project-store/project-store.port';
import { ProjectScreenWorkflow } from './project-screen-workflow';

@Component({
  selector: 'app-project-screen-preview',
  imports: [LucideImage],
  templateUrl: './project-screen-preview.component.html',
  styleUrl: './project-screen-preview.component.scss',
})
export class ProjectScreenPreviewComponent implements AfterViewInit, OnDestroy {
  readonly project = input.required<Pick<ProjectSummary, 'id' | 'updatedAt'>>();
  protected readonly previewUrl = signal<string | undefined>(undefined);
  private readonly shouldLoadPreview = signal(false);
  private readonly workflow = inject(ProjectScreenWorkflow);
  private readonly errorHandler = inject(ErrorHandler);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private observer: IntersectionObserver | undefined;

  constructor() {
    effect((onCleanup) => {
      if (!this.shouldLoadPreview()) return;

      const project = this.project();
      let active = true;
      let objectUrl: string | undefined;
      this.previewUrl.set(undefined);
      onCleanup(() => {
        active = false;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      });

      void this.workflow
        .loadProjectPreview(project.id, project.updatedAt)
        .then((preview) => {
          if (!active || !preview) return;
          objectUrl = URL.createObjectURL(preview);
          this.previewUrl.set(objectUrl);
        })
        .catch((error: unknown) => {
          if (active) this.errorHandler.handleError(error);
        });
    });
  }

  ngAfterViewInit(): void {
    if (typeof IntersectionObserver === 'undefined') {
      this.shouldLoadPreview.set(true);
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        this.shouldLoadPreview.set(true);
        this.observer?.disconnect();
      },
      { rootMargin: '160px' },
    );
    this.observer.observe(this.host.nativeElement);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}

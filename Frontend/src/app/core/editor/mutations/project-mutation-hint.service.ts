import { Injectable } from '@angular/core';
import type { ProjectDocument } from '../../domain/project.types';
import type { ProjectMutationHint } from './project-mutation-hint';

interface PendingTransition {
  readonly from: ProjectDocument;
  readonly to: ProjectDocument;
  readonly hint: ProjectMutationHint;
  readonly consumers: Set<string>;
}

/** Ephemeral hand-off between snapshot history and viewport instances. */
@Injectable({ providedIn: 'root' })
export class ProjectMutationHintService {
  private pending?: PendingTransition;

  publish(from: ProjectDocument, to: ProjectDocument, hint: ProjectMutationHint): void {
    this.pending = { from, to, hint, consumers: new Set<string>() };
  }

  consume(to: ProjectDocument | undefined, consumerId: string): ProjectMutationHint | undefined {
    const pending = this.pending;
    if (!pending || pending.to !== to || pending.consumers.has(consumerId)) return undefined;
    pending.consumers.add(consumerId);
    return pending.hint;
  }

  matchesTransition(from: ProjectDocument, to: ProjectDocument): boolean {
    return this.pending?.from === from && this.pending.to === to;
  }

  clear(): void {
    this.pending = undefined;
  }
}

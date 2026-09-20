import { Component, input, output, inject, computed } from '@angular/core';
import { I18nService } from '../../../core/ui/localization/i18n.service';
import { ProjectPackageImportState } from '../../../core/persistence/project-package/project-package-import.types';

@Component({
  selector: 'app-project-import-status',
  imports: [],
  templateUrl: './project-import-status.component.html',
  styleUrl: './project-import-status.component.scss',
})
export class ProjectImportStatusComponent {
  protected readonly i18n = inject(I18nService);
  readonly state = input.required<ProjectPackageImportState>();
  readonly closed = output<void>();
  protected readonly busy = computed(() => !['idle', 'success', 'error'].includes(this.state().stage));
  protected stageLabel(stage: ProjectPackageImportState['stage']): string {
    const key = ({ 'saving-current': 'importSavingCurrent', 'reading-file': 'importReadingFile', parsing: 'importParsing', validating: 'importValidating', 'checking-destination': 'importCheckingDestination', storing: 'importSavingProject', activating: 'importOpeningProject' } as Record<string, string>)[stage] ?? 'importParsing';
    return this.i18n.t(key as Parameters<I18nService['t']>[0]);
  }
  protected errorLabel(category: ProjectPackageImportState['errorCategory']): string {
    const key = ({ 'read-failed': 'importReadFailed', 'invalid-json': 'importInvalidJson', 'not-project-package': 'importNotProjectPackage', 'unsupported-package-version': 'importUnsupportedPackage', 'unsupported-project-schema': 'importUnsupportedSchema', 'invalid-project-data': 'importInvalidData', 'storage-failed': 'importStorageFailed' } as Record<string, string>)[category ?? 'unexpected'] ?? 'importError';
    return this.i18n.t(key as Parameters<I18nService['t']>[0]);
  }
}

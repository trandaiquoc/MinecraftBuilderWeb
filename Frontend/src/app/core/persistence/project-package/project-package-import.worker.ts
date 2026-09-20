import { parseProjectPackage, ProjectPackageError } from './project-package';
import { ProjectPackageWorkerRequest, ProjectPackageWorkerResponse } from './project-package-import.types';

const scope = globalThis as typeof globalThis & { onmessage?: (event: MessageEvent<ProjectPackageWorkerRequest>) => void; postMessage?: (value: ProjectPackageWorkerResponse) => void };
scope.onmessage = (event) => {
  try { const text = event.data.buffer ? new TextDecoder().decode(event.data.buffer) : event.data.text ?? ''; scope.postMessage?.({ ok: true, project: parseProjectPackage(text) }); }
  catch (error) {
    const failure = error instanceof ProjectPackageError ? error : new ProjectPackageError('invalid-project-data', error instanceof Error ? error.message : 'Unable to parse project package');
    scope.postMessage?.({ ok: false, category: failure.category, message: failure.message, details: failure.details });
  }
};

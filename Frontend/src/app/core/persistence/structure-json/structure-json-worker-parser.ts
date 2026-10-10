import { parseStructureJson } from './structure-json';
import type { ParsedStructureJsonResult } from './structure-json';
import type {
  StructureJsonValidationCancellation,
  StructureJsonWorkerRequest,
  StructureJsonWorkerResponse,
} from './structure-json-validation.types';
import { isStructureJsonValidationCancelled } from './structure-json-validation-scheduling';

const WORKER_THRESHOLD = 256 * 1024;

export async function parseStructureJsonWithWorker(
  text: string,
  cancellation?: StructureJsonValidationCancellation,
): Promise<ParsedStructureJsonResult> {
  if (isStructureJsonValidationCancelled(cancellation))
    return { valid: false, code: 'invalid-json' };
  if (
    text.length < WORKER_THRESHOLD ||
    typeof Worker === 'undefined' ||
    typeof window === 'undefined'
  )
    return parseStructureJson(text);
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./structure-json-import.worker', import.meta.url), {
        type: 'module',
      });
    } catch {
      resolve(parseStructureJson(text));
      return;
    }
    let settled = false;
    const finish = (result: ParsedStructureJsonResult): void => {
      if (settled) return;
      settled = true;
      worker.terminate();
      resolve(result);
    };
    const fallback = () => finish(parseStructureJson(text));
    const cancellationTimer =
      typeof cancellation?.isCancelled === 'function' || cancellation?.signal
        ? setInterval(() => {
            if (isStructureJsonValidationCancelled(cancellation)) {
              settled = true;
              worker.terminate();
              clearInterval(cancellationTimer);
              resolve({ valid: false, code: 'invalid-json' });
            }
          }, 16)
        : undefined;
    worker.onmessage = ({ data }: MessageEvent<StructureJsonWorkerResponse>) => {
      if (cancellationTimer) clearInterval(cancellationTimer);
      finish(data.result);
    };
    worker.onerror = () => {
      if (cancellationTimer) clearInterval(cancellationTimer);
      fallback();
    };
    worker.postMessage({ text } satisfies StructureJsonWorkerRequest);
  });
}

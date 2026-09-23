import { parseStructureJsonV1, ParsedStructureJsonV1Result } from './structure-json';

interface StructureJsonWorkerRequest { readonly text: string; }
interface StructureJsonWorkerResponse { readonly ok: boolean; readonly result: ParsedStructureJsonV1Result; }
const scope = globalThis as typeof globalThis & { onmessage?: (event: MessageEvent<StructureJsonWorkerRequest>) => void; postMessage?: (value: StructureJsonWorkerResponse) => void };
scope.onmessage = (event) => { const result = parseStructureJsonV1(event.data.text); scope.postMessage?.({ ok: result.valid, result }); };

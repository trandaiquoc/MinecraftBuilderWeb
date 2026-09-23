import { parseStructureJson, ParsedStructureJsonResult } from './structure-json';

interface StructureJsonWorkerRequest { readonly text: string; }
interface StructureJsonWorkerResponse { readonly ok: boolean; readonly result: ParsedStructureJsonResult; }
const scope = globalThis as typeof globalThis & { onmessage?: (event: MessageEvent<StructureJsonWorkerRequest>) => void; postMessage?: (value: StructureJsonWorkerResponse) => void };
scope.onmessage = (event) => { const result = parseStructureJson(event.data.text); scope.postMessage?.({ ok: result.valid, result }); };

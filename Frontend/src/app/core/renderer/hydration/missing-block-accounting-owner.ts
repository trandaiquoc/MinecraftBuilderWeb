import type { VisibleBlockProjectionEntry } from '../engine/y-layer-projection-coordinator';

/** Owns the source-restore terminal policy for unresolved block entries. */
export class MissingBlockAccountingOwner {
  private terminal = false;
  get isTerminal(): boolean { return this.terminal; }

  setTerminal(terminal: boolean, entries: readonly VisibleBlockProjectionEntry[], sync: (key: string, state: 'provisional' | 'permanent') => void): boolean {
    if (this.terminal === terminal) return false;
    this.terminal = terminal;
    for (const entry of entries) if (entry.block.kind === 'missing') sync(`${entry.block.position.x},${entry.block.position.y},${entry.block.position.z}`, terminal ? 'permanent' : 'provisional');
    return true;
  }
}

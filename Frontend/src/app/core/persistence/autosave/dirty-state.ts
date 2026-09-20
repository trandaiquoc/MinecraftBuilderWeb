export class DirtyState {
  private revision = 0;
  private cleanRevision = 0;

  get isDirty(): boolean {
    return this.revision !== this.cleanRevision;
  }

  get currentRevision(): number {
    return this.revision;
  }

  markDirty(): number {
    return ++this.revision;
  }

  markClean(revision = this.revision): boolean {
    if (revision !== this.revision) return false;
    this.cleanRevision = revision;
    return true;
  }
}

export interface TerrainAtlasPageSize {
  readonly width: number;
  readonly height: number;
}

export interface TerrainAtlasRect {
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly gutter: number;
}

interface MutablePage {
  readonly index: number;
  cursorX: number;
  cursorY: number;
  rowHeight: number;
}

/** Deterministic shelf allocation. Allocated content never moves. */
export class TerrainAtlasLayout {
  private readonly pages: MutablePage[] = [];

  constructor(
    readonly pageSize: TerrainAtlasPageSize = { width: 1024, height: 1024 },
    readonly gutter = 1,
  ) {
    if (
      !Number.isInteger(pageSize.width) ||
      !Number.isInteger(pageSize.height) ||
      pageSize.width <= 0 ||
      pageSize.height <= 0
    )
      throw new Error('Invalid terrain atlas page size');
    if (!Number.isInteger(gutter) || gutter < 0) throw new Error('Invalid terrain atlas gutter');
  }

  get pageCount(): number {
    return this.pages.length;
  }
  clear(): void {
    this.pages.length = 0;
  }

  allocate(width: number, height: number): TerrainAtlasRect | undefined {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0)
      return undefined;
    const paddedWidth = width + this.gutter * 2;
    const paddedHeight = height + this.gutter * 2;
    if (paddedWidth > this.pageSize.width || paddedHeight > this.pageSize.height) return undefined;
    let page = this.pages.at(-1) ?? this.createPage();
    if (page.cursorX + paddedWidth > this.pageSize.width) {
      page.cursorX = 0;
      page.cursorY += page.rowHeight;
      page.rowHeight = 0;
    }
    if (page.cursorY + paddedHeight > this.pageSize.height) page = this.createPage();
    const x = page.cursorX + this.gutter;
    const y = page.cursorY + this.gutter;
    page.cursorX += paddedWidth;
    page.rowHeight = Math.max(page.rowHeight, paddedHeight);
    return { page: page.index, x, y, width, height, gutter: this.gutter };
  }

  private createPage(): MutablePage {
    const page = { index: this.pages.length, cursorX: 0, cursorY: 0, rowHeight: 0 };
    this.pages.push(page);
    return page;
  }
}

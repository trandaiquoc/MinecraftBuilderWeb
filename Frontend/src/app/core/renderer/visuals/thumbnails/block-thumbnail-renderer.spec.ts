import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { representativeBlockFixture } from '../../../blocks/catalog/block-catalog.fixture';
import { BlockCatalog } from '../../../blocks/catalog/block-catalog';
import { buildPlaceableItems } from '../../../blocks/placement-palette/placeable-item';
import { SpecialBlockVisualRegistry } from '../special-blocks/special-block-visual-registry';
import { BlockThumbnailRenderer, thumbnailPreviewRotationY } from './block-thumbnail-renderer';

describe('block thumbnail renderer', () => {
  it('does not render after disposal while waiting for block visuals', async () => {
    let resolveVisual!: (visual: any) => void;
    const createBlockVisual = vi.fn(() => new Promise<any>((resolve) => (resolveVisual = resolve)));
    const render = vi.fn();
    const dispose = vi.fn();
    const fakeRenderer = {
      domElement: document.createElement('canvas'),
      setSize: vi.fn(),
      setClearColor: vi.fn(),
      render,
      dispose,
    };
    const assets = { readJson: () => undefined, readBinary: () => undefined } as any;
    const renderer = new BlockThumbnailRenderer(assets, new SpecialBlockVisualRegistry(), {
      createBlockVisual,
      resolveBlockModel: vi.fn(),
      resolveItemModel: vi.fn(),
      createModelPart: vi.fn(),
      loadTexture: vi.fn(),
    });
    (renderer as any).renderer = fakeRenderer;
    (renderer as any).getRenderer = () => fakeRenderer;

    const pending = (renderer as any).renderThumbnailBlocks([
      {
        kind: 'resolved',
        id: 'minecraft:stone',
        namespace: 'minecraft',
        position: { x: 0, y: 0, z: 0 },
        state: {},
      },
    ]);
    renderer.dispose();
    resolveVisual({
      mode: 'real',
      object: new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry())),
      dispose: vi.fn(),
    });

    await expect(pending).resolves.toBeUndefined();
    expect(render).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('does not create an object URL when a pending canvas blob resolves after disposal', async () => {
    let completeBlob!: (blob: Blob | null) => void;
    const createObjectURL = vi.fn(() => 'blob:late-thumbnail');
    vi.spyOn(URL, 'createObjectURL').mockImplementation(createObjectURL);
    const assets = { readJson: () => undefined, readBinary: () => undefined } as any;
    const renderer = new BlockThumbnailRenderer(assets, new SpecialBlockVisualRegistry(), {
      createBlockVisual: vi.fn(),
      resolveBlockModel: vi.fn(),
      resolveItemModel: vi.fn(),
      createModelPart: vi.fn(),
      loadTexture: vi.fn(),
    });
    const canvas = {
      toBlob: (callback: (blob: Blob | null) => void) => (completeBlob = callback),
    } as unknown as HTMLCanvasElement;

    const pending = (renderer as any).canvasUrl(canvas);
    renderer.dispose();
    completeBlob(new Blob(['thumbnail']));

    await expect(pending).resolves.toBeUndefined();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('corrects only entity-head preview orientation while leaving generic previews unchanged', () => {
    const head = new THREE.Group();
    head.userData['specialVisualFamily'] = 'heads-skulls';
    expect(thumbnailPreviewRotationY(head)).toBe(Math.PI);
    expect(thumbnailPreviewRotationY(new THREE.Group())).toBe(0);
  });

  it('does not cache a retryable flat item fallback as enhanced output', async () => {
    const assets = {
      readJson: () => undefined,
      readBinary: () => undefined,
      textureUrl: (resource: string) => `resource:${resource}`,
    } as any;
    const renderer = new BlockThumbnailRenderer(assets, new SpecialBlockVisualRegistry(), {
      createBlockVisual: vi.fn(),
      resolveBlockModel: vi.fn(),
      resolveItemModel: vi.fn(),
      createModelPart: vi.fn(),
      loadTexture: vi.fn(),
    });
    const catalog = new BlockCatalog();
    catalog.load(representativeBlockFixture);
    const item = buildPlaceableItems(catalog.all())[0];
    const render = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary renderer failure'))
      .mockResolvedValueOnce('blob:enhanced');
    (renderer as any).renderThumbnailBlocks = render;
    (renderer as any).itemThumbnailResource = () => 'resource:flat';

    await expect(renderer.perspectiveItemThumbnail(item)).resolves.toMatchObject({
      quality: 'fallback',
      retryable: true,
    });
    await expect(renderer.perspectiveItemThumbnail(item)).resolves.toMatchObject({
      quality: 'enhanced',
      url: 'blob:enhanced',
    });
    expect(render).toHaveBeenCalledTimes(2);
  });
});

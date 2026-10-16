import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { representativeBlockFixture } from '../../../blocks/catalog/block-catalog.fixture';
import { BlockCatalog } from '../../../blocks/catalog/block-catalog';
import { buildPlaceableItems } from '../../../blocks/placement-palette/placeable-item';
import { SpecialBlockVisualRegistry } from '../special-blocks/special-block-visual-registry';
import { BlockThumbnailRenderer, thumbnailPreviewRotationY } from './block-thumbnail-renderer';

describe('block thumbnail renderer', () => {
  it('reuses cache entries for equivalent states and separates distinct states', async () => {
    const renderer = new BlockThumbnailRenderer(
      { readJson: () => undefined, readBinary: () => undefined } as any,
      new SpecialBlockVisualRegistry(),
      {
        createBlockVisual: vi.fn(),
        resolveBlockModel: vi.fn(),
        resolveItemModel: vi.fn(),
        createModelPart: vi.fn(),
        loadTexture: vi.fn(),
      },
    );
    const renderThumbnail = vi.fn(async () => 'blob:thumbnail');
    (renderer as any).renderThumbnail = renderThumbnail;

    const first = renderer.perspectiveThumbnail('minecraft:oak_stairs', {
      facing: 'north',
      half: 'top',
    });
    const equivalent = renderer.perspectiveThumbnail('minecraft:oak_stairs', {
      half: 'top',
      facing: 'north',
    });
    const distinct = renderer.perspectiveThumbnail('minecraft:oak_stairs', {
      half: 'top',
      facing: 'south',
    });

    expect(equivalent).toBe(first);
    expect(distinct).not.toBe(first);
    expect(renderThumbnail).toHaveBeenCalledTimes(2);
    await Promise.all([first, distinct]);
    renderer.dispose();
  });

  it('does not render after disposal while waiting for block visuals', async () => {
    let resolveVisual!: (visual: any) => void;
    const createBlockVisual = vi.fn(() => new Promise<any>((resolve) => (resolveVisual = resolve)));
    const render = vi.fn();
    const dispose = vi.fn();
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshBasicMaterial();
    const geometryDisposed = vi.fn();
    const materialDisposed = vi.fn();
    geometry.addEventListener('dispose', geometryDisposed);
    material.addEventListener('dispose', materialDisposed);
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
      object: new THREE.Group().add(new THREE.Mesh(geometry, material)),
      dispose: vi.fn(),
    });

    await expect(pending).resolves.toBeUndefined();
    expect(render).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledOnce();
    expect(geometryDisposed).toHaveBeenCalledOnce();
    expect(materialDisposed).toHaveBeenCalledOnce();
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

  it('disposes visuals that resolved before another block visual rejects', async () => {
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshBasicMaterial();
    const geometryDisposed = vi.fn();
    const materialDisposed = vi.fn();
    geometry.addEventListener('dispose', geometryDisposed);
    material.addEventListener('dispose', materialDisposed);
    const visualObject = new THREE.Group().add(new THREE.Mesh(geometry, material));
    const fakeRenderer = {
      domElement: document.createElement('canvas'),
      setSize: vi.fn(),
      setClearColor: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
    };
    const renderer = new BlockThumbnailRenderer(
      { readJson: () => undefined, readBinary: () => undefined } as any,
      new SpecialBlockVisualRegistry(),
      {
        createBlockVisual: vi.fn((block) =>
          block.id === 'example:broken'
            ? Promise.reject(new Error('visual creation failed'))
            : Promise.resolve({ object: visualObject } as any),
        ),
        resolveBlockModel: vi.fn(),
        resolveItemModel: vi.fn(),
        createModelPart: vi.fn(),
        loadTexture: vi.fn(),
      },
    );
    (renderer as any).getRenderer = () => fakeRenderer;

    await expect(
      (renderer as any).renderThumbnailBlocks([
        {
          kind: 'resolved',
          id: 'example:working',
          namespace: 'example',
          position: { x: 0, y: 0, z: 0 },
          state: {},
        },
        {
          kind: 'resolved',
          id: 'example:broken',
          namespace: 'example',
          position: { x: 1, y: 0, z: 0 },
          state: {},
        },
      ]),
    ).rejects.toThrow('visual creation failed');

    expect(geometryDisposed).toHaveBeenCalledOnce();
    expect(materialDisposed).toHaveBeenCalledOnce();
    expect(fakeRenderer.render).not.toHaveBeenCalled();
  });

  it('keeps rejection fail-fast and disposes visuals that resolve after the failure', async () => {
    let resolveVisual!: (visual: any) => void;
    const pendingVisual = new Promise<any>((resolve) => (resolveVisual = resolve));
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshBasicMaterial();
    let markDisposed!: () => void;
    const disposed = new Promise<void>((resolve) => (markDisposed = resolve));
    geometry.addEventListener('dispose', markDisposed);
    const visualObject = new THREE.Group().add(new THREE.Mesh(geometry, material));
    const fakeRenderer = {
      domElement: document.createElement('canvas'),
      setSize: vi.fn(),
      setClearColor: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
    };
    const renderer = new BlockThumbnailRenderer(
      { readJson: () => undefined, readBinary: () => undefined } as any,
      new SpecialBlockVisualRegistry(),
      {
        createBlockVisual: vi.fn((block) =>
          block.id === 'example:broken'
            ? Promise.reject(new Error('visual creation failed'))
            : pendingVisual,
        ),
        resolveBlockModel: vi.fn(),
        resolveItemModel: vi.fn(),
        createModelPart: vi.fn(),
        loadTexture: vi.fn(),
      },
    );
    (renderer as any).getRenderer = () => fakeRenderer;

    const pending = (renderer as any).renderThumbnailBlocks([
      {
        kind: 'resolved',
        id: 'example:delayed',
        namespace: 'example',
        position: { x: 0, y: 0, z: 0 },
        state: {},
      },
      {
        kind: 'resolved',
        id: 'example:broken',
        namespace: 'example',
        position: { x: 1, y: 0, z: 0 },
        state: {},
      },
    ]);

    await expect(pending).rejects.toThrow('visual creation failed');
    expect(fakeRenderer.render).not.toHaveBeenCalled();

    resolveVisual({ object: visualObject });
    await disposed;
  });

  it('disposes generated-layer GPU objects without disposing shared textures', async () => {
    const geometryDisposed = vi.fn();
    const materialDisposed = vi.fn();
    const textureDisposed = vi.fn();
    const texture = new THREE.Texture();
    texture.addEventListener('dispose', textureDisposed);
    const fakeRenderer = {
      domElement: { toDataURL: () => 'data:image/png;base64,preview' },
      setSize: vi.fn(),
      setClearColor: vi.fn(),
      render: (scene: THREE.Scene) => {
        scene.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.geometry.addEventListener('dispose', geometryDisposed);
          object.material.addEventListener('dispose', materialDisposed);
        });
      },
      dispose: vi.fn(),
    };
    const assets = {
      readJson: (path: string) =>
        path === 'assets/example/models/item/gem.json'
          ? { textures: { layer0: 'example:item/gem' } }
          : undefined,
      readBinary: () => undefined,
    } as any;
    const renderer = new BlockThumbnailRenderer(assets, new SpecialBlockVisualRegistry(), {
      createBlockVisual: vi.fn(),
      resolveBlockModel: vi.fn(),
      resolveItemModel: vi.fn(),
      createModelPart: vi.fn(),
      loadTexture: vi.fn().mockResolvedValue(texture),
    });
    (renderer as any).getRenderer = () => fakeRenderer;

    await expect(renderer.perspectiveItemVisualThumbnail('example:gem')).resolves.toMatchObject({
      quality: 'enhanced',
      url: 'data:image/png;base64,preview',
    });

    expect(geometryDisposed).toHaveBeenCalledOnce();
    expect(materialDisposed).toHaveBeenCalledOnce();
    expect(textureDisposed).not.toHaveBeenCalled();
  });

  it('keeps provider-owned model geometry while releasing its thumbnail material', async () => {
    const geometryDisposed = vi.fn();
    const materialDisposed = vi.fn();
    const geometry = new THREE.BoxGeometry();
    geometry.userData['providerOwnedGeometry'] = true;
    const material = new THREE.MeshBasicMaterial();
    const part = new THREE.Group().add(new THREE.Mesh(geometry, material));
    const fakeRenderer = {
      domElement: { toDataURL: () => 'data:image/png;base64:preview' },
      setSize: vi.fn(),
      setClearColor: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
    };
    geometry.addEventListener('dispose', geometryDisposed);
    material.addEventListener('dispose', materialDisposed);
    const assets = { readJson: () => undefined, readBinary: () => undefined } as any;
    const renderer = new BlockThumbnailRenderer(assets, new SpecialBlockVisualRegistry(), {
      createBlockVisual: vi.fn(),
      resolveBlockModel: vi.fn(),
      resolveItemModel: () => ({ parts: [{ elements: [{}] }] }) as any,
      createModelPart: vi.fn().mockResolvedValue(part),
      loadTexture: vi.fn(),
    });
    (renderer as any).getRenderer = () => fakeRenderer;

    await expect(
      (renderer as any).renderStandaloneModel('example:gem', 'example:item/gem'),
    ).resolves.toBe('data:image/png;base64:preview');

    expect(geometryDisposed).not.toHaveBeenCalled();
    expect(materialDisposed).toHaveBeenCalledOnce();
  });

  it('releases block thumbnail materials while preserving cached provider geometry', async () => {
    const geometryDisposed = vi.fn();
    const materialDisposed = vi.fn();
    const geometry = new THREE.BoxGeometry();
    geometry.userData['providerOwnedGeometry'] = true;
    const material = new THREE.MeshBasicMaterial();
    const object = new THREE.Group().add(new THREE.Mesh(geometry, material));
    const fakeRenderer = {
      domElement: { toDataURL: () => 'data:image/png;base64:preview' },
      setSize: vi.fn(),
      setClearColor: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
    };
    geometry.addEventListener('dispose', geometryDisposed);
    material.addEventListener('dispose', materialDisposed);
    const assets = { readJson: () => undefined, readBinary: () => undefined } as any;
    const renderer = new BlockThumbnailRenderer(assets, new SpecialBlockVisualRegistry(), {
      createBlockVisual: vi.fn().mockResolvedValue({ object }),
      resolveBlockModel: vi.fn().mockReturnValue({ parts: [] }),
      resolveItemModel: vi.fn(),
      createModelPart: vi.fn(),
      loadTexture: vi.fn(),
    });
    (renderer as any).getRenderer = () => fakeRenderer;

    await expect(
      (renderer as any).renderThumbnailBlocks([
        {
          kind: 'resolved',
          id: 'minecraft:stone',
          namespace: 'minecraft',
          position: { x: 0, y: 0, z: 0 },
          state: {},
        },
      ]),
    ).resolves.toBe('data:image/png;base64:preview');

    expect(geometryDisposed).not.toHaveBeenCalled();
    expect(materialDisposed).toHaveBeenCalledOnce();
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

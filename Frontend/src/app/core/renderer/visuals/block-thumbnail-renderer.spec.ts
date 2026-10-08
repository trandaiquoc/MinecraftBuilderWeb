import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { representativeBlockFixture } from '../../blocks/catalog/block-catalog.fixture';
import { BlockCatalog } from '../../blocks/catalog/block-catalog';
import { buildPlaceableItems } from '../../blocks/placement-palette/placeable-item';
import { SpecialBlockVisualRegistry } from './special-block-visual-registry';
import { BlockThumbnailRenderer, thumbnailPreviewRotationY } from './block-thumbnail-renderer';

describe('block thumbnail renderer', () => {
  it('corrects only entity-head preview orientation while leaving generic previews unchanged', () => {
    const head = new THREE.Group(); head.userData['specialVisualFamily'] = 'heads-skulls';
    expect(thumbnailPreviewRotationY(head)).toBe(Math.PI);
    expect(thumbnailPreviewRotationY(new THREE.Group())).toBe(0);
  });

  it('does not cache a retryable flat item fallback as enhanced output', async () => {
    const assets = { readJson: () => undefined, readBinary: () => undefined, textureUrl: (resource: string) => `resource:${resource}` } as any;
    const renderer = new BlockThumbnailRenderer(assets, new SpecialBlockVisualRegistry(), {
      createBlockVisual: vi.fn(), resolveBlockModel: vi.fn(), resolveItemModel: vi.fn(), createModelPart: vi.fn(), loadTexture: vi.fn(),
    });
    const catalog = new BlockCatalog(); catalog.load(representativeBlockFixture);
    const item = buildPlaceableItems(catalog.all())[0];
    const render = vi.fn().mockRejectedValueOnce(new Error('temporary renderer failure')).mockResolvedValueOnce('blob:enhanced');
    (renderer as any).renderThumbnailBlocks = render;
    (renderer as any).itemThumbnailResource = () => 'resource:flat';

    await expect(renderer.perspectiveItemThumbnail(item)).resolves.toMatchObject({ quality: 'fallback', retryable: true });
    await expect(renderer.perspectiveItemThumbnail(item)).resolves.toMatchObject({ quality: 'enhanced', url: 'blob:enhanced' });
    expect(render).toHaveBeenCalledTimes(2);
  });
});

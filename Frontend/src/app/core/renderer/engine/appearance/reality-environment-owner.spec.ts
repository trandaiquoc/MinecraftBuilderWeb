import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  BUNDLED_PLAINS_GRASS_TEXTURE,
  DEFAULT_REALITY_BACKGROUND,
} from '../../../editor/appearance/editor-background-contract';
import {
  RealityEnvironmentConfiguration,
  RealityEnvironmentOwner,
  realitySkyBackground,
} from './reality-environment-owner';

const texture = (): THREE.Texture =>
  new THREE.Texture({ width: 16, height: 16 } as HTMLImageElement);

const realityConfig = (
  patch: Partial<RealityEnvironmentConfiguration> = {},
): RealityEnvironmentConfiguration => ({
  mode: 'reality',
  groundPreset: DEFAULT_REALITY_BACKGROUND.groundPreset,
  groundTextureUrl: BUNDLED_PLAINS_GRASS_TEXTURE,
  assetRevision: 1,
  resourcesReady: true,
  skyPreset: DEFAULT_REALITY_BACKGROUND.skyPreset,
  ...patch,
});

async function flushTextureTasks(): Promise<void> {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
}

describe('RealityEnvironmentOwner', () => {
  it('maps each sky and keeps the tiled ground outside raycast/project ownership', async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const grass = texture();
    const sand = texture();
    const sandDispose = vi.spyOn(sand, 'dispose');
    const scheduleRender = vi.fn();
    const fallback = vi.fn();
    const owner = new RealityEnvironmentOwner(scene, camera, {
      loadTexture: vi.fn(async (url) => (url === BUNDLED_PLAINS_GRASS_TEXTURE ? grass : sand)),
      scheduleRender,
      onFallback: fallback,
    });
    scene.add(camera);
    owner.setGroundSize(24, 12);
    owner.apply(
      realityConfig({
        groundPreset: 'sand',
        groundTextureUrl: 'blob:sand',
        skyPreset: 'overworld-night',
      }),
    );
    await flushTextureTasks();

    const ground = scene.getObjectByName('realityGround') as THREE.Mesh<
      THREE.PlaneGeometry,
      THREE.MeshBasicMaterial
    >;
    const sky = camera.getObjectByName('realitySky');
    expect(ground.visible).toBe(true);
    expect(ground.position.toArray()).toEqual([12, -0.035, 6]);
    expect(ground.scale.toArray()).toEqual([24, 12, 1]);
    expect(ground.material.map).toBe(sand);
    expect(sand.wrapS).toBe(THREE.RepeatWrapping);
    expect(sand.repeat.toArray()).toEqual([6, 3]);
    expect(scene.background).toMatchObject({ r: expect.any(Number) });
    expect((scene.background as THREE.Color).getHex()).toBe(
      realitySkyBackground('overworld-night'),
    );
    expect(sky?.visible).toBe(true);
    expect(camera.getObjectByName('realitySky:overworld-night')?.visible).toBe(true);
    expect(fallback).not.toHaveBeenCalled();

    const intersections: THREE.Intersection[] = [];
    ground.raycast(new THREE.Raycaster(), intersections);
    expect(intersections).toHaveLength(0);
    owner.dispose();
    expect(sandDispose).toHaveBeenCalledTimes(1);
    expect(scene.getObjectByName('realityGround')).toBeUndefined();
  });

  it('immediately reports a missing selected ground and installs bundled grass as fallback', async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const grass = texture();
    const grassDispose = vi.spyOn(grass, 'dispose');
    const onFallback = vi.fn();
    const owner = new RealityEnvironmentOwner(scene, camera, {
      loadTexture: vi.fn(async () => grass),
      scheduleRender: vi.fn(),
      onFallback,
    });
    owner.apply(realityConfig({ groundPreset: 'sand', groundTextureUrl: undefined }));

    expect(onFallback).toHaveBeenCalledWith({
      kind: 'ground',
      requested: 'sand',
      fallback: 'plains-grass',
    });
    await flushTextureTasks();
    const ground = scene.getObjectByName('realityGround') as THREE.Mesh<
      THREE.PlaneGeometry,
      THREE.MeshBasicMaterial
    >;
    expect(ground.material.map).toBe(grass);
    owner.dispose();
    expect(grassDispose).toHaveBeenCalledTimes(1);
  });

  it('keeps a saved JAR preset pending during startup, then falls back only after resources settle', async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const grass = texture();
    const fallback = vi.fn();
    const owner = new RealityEnvironmentOwner(scene, camera, {
      loadTexture: vi.fn(async () => grass),
      scheduleRender: vi.fn(),
      onFallback: fallback,
    });
    owner.apply(
      realityConfig({
        groundPreset: 'sand',
        groundTextureUrl: undefined,
        resourcesReady: false,
      }),
    );
    expect(fallback).not.toHaveBeenCalled();
    await flushTextureTasks();
    expect(
      (
        scene.getObjectByName('realityGround') as THREE.Mesh<
          THREE.PlaneGeometry,
          THREE.MeshBasicMaterial
        >
      ).material.map,
    ).toBe(grass);

    owner.apply(
      realityConfig({
        groundPreset: 'sand',
        groundTextureUrl: undefined,
        resourcesReady: true,
      }),
    );
    expect(fallback).toHaveBeenCalledWith({
      kind: 'ground',
      requested: 'sand',
      fallback: 'plains-grass',
    });
    owner.dispose();
  });

  it('falls back and reports a selected JAR texture that fails to load', async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const grass = texture();
    const fallback = vi.fn();
    const owner = new RealityEnvironmentOwner(scene, camera, {
      loadTexture: vi.fn((url) =>
        url === BUNDLED_PLAINS_GRASS_TEXTURE
          ? Promise.resolve(grass)
          : Promise.reject(new Error('invalid image')),
      ),
      scheduleRender: vi.fn(),
      onFallback: fallback,
    });
    owner.apply(
      realityConfig({
        groundPreset: 'sand',
        groundTextureUrl: 'blob:invalid-sand',
        assetRevision: 9,
      }),
    );
    await flushTextureTasks();

    expect(fallback).toHaveBeenCalledWith({
      kind: 'ground',
      requested: 'sand',
      fallback: 'plains-grass',
    });
    expect(
      (
        scene.getObjectByName('realityGround') as THREE.Mesh<
          THREE.PlaneGeometry,
          THREE.MeshBasicMaterial
        >
      ).material.map,
    ).toBe(grass);
    owner.dispose();
  });

  it('rejects stale async textures and disposes them without replacing the latest selection', async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const grass = texture();
    const oldTexture = texture();
    const currentTexture = texture();
    const oldTextureDispose = vi.spyOn(oldTexture, 'dispose');
    const currentTextureDispose = vi.spyOn(currentTexture, 'dispose');
    let resolveOld!: (value: THREE.Texture) => void;
    const oldLoad = new Promise<THREE.Texture>((resolve) => (resolveOld = resolve));
    const loadTexture = vi.fn((url: string) => {
      if (url === BUNDLED_PLAINS_GRASS_TEXTURE) return Promise.resolve(grass);
      if (url === 'blob:old') return oldLoad;
      return Promise.resolve(currentTexture);
    });
    const owner = new RealityEnvironmentOwner(scene, camera, {
      loadTexture,
      scheduleRender: vi.fn(),
      onFallback: vi.fn(),
    });
    owner.apply(realityConfig({ groundPreset: 'sand', groundTextureUrl: 'blob:old' }));
    owner.apply(
      realityConfig({
        groundPreset: 'snow',
        groundTextureUrl: 'blob:current',
        assetRevision: 2,
      }),
    );
    await flushTextureTasks();
    resolveOld(oldTexture);
    await flushTextureTasks();

    const ground = scene.getObjectByName('realityGround') as THREE.Mesh<
      THREE.PlaneGeometry,
      THREE.MeshBasicMaterial
    >;
    expect(ground.material.map).toBe(currentTexture);
    expect(oldTextureDispose).toHaveBeenCalledTimes(1);
    owner.dispose();
    expect(currentTextureDispose).toHaveBeenCalledTimes(1);
  });

  it('hides only the environment layer for Dark/Light and safely falls back for an unknown sky', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const onFallback = vi.fn();
    const owner = new RealityEnvironmentOwner(scene, camera, {
      loadTexture: vi.fn(async () => texture()),
      scheduleRender: vi.fn(),
      onFallback,
    });
    owner.apply(realityConfig({ skyPreset: 'bad-sky' as 'overworld-day' }));
    expect(onFallback).toHaveBeenCalledWith({
      kind: 'sky',
      requested: 'bad-sky',
      fallback: 'overworld-day',
    });
    owner.apply(realityConfig({ mode: 'light' }));
    expect(scene.getObjectByName('realityGround')?.visible).toBe(false);
    expect(camera.getObjectByName('realitySky')?.visible).toBe(false);
    expect((scene.background as THREE.Color).getHex()).toBe(0x0c1015);
    owner.dispose();
  });
});

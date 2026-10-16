import * as THREE from 'three';
import {
  BUNDLED_PLAINS_GRASS_TEXTURE,
  DEFAULT_REALITY_BACKGROUND,
  EditorBackgroundMode,
  RealityGroundPreset,
  RealitySkyPreset,
  isRealityGroundPreset,
  isRealitySkyPreset,
  realitySkyBackgroundColor,
} from '../../../editor/appearance/editor-background-contract';

const SKY_DISTANCE = 900;
const GROUND_TILE_SIZE = 4;

export interface RealityEnvironmentConfiguration {
  readonly mode: EditorBackgroundMode;
  readonly groundPreset: RealityGroundPreset;
  readonly groundTextureUrl: string | undefined;
  readonly assetRevision: number;
  readonly resourcesReady: boolean;
  readonly skyPreset: RealitySkyPreset;
}

export interface RealityGroundFallback {
  readonly kind: 'ground';
  readonly requested: string;
  readonly fallback: RealityGroundPreset;
}

export interface RealitySkyFallback {
  readonly kind: 'sky';
  readonly requested: string;
  readonly fallback: RealitySkyPreset;
}

export type RealityEnvironmentFallback = RealityGroundFallback | RealitySkyFallback;

export interface RealityEnvironmentOwnerPorts {
  readonly loadTexture: (url: string) => Promise<THREE.Texture>;
  readonly scheduleRender: () => void;
  readonly onFallback: (fallback: RealityEnvironmentFallback) => void;
}

export function realitySkyBackground(preset: RealitySkyPreset): number {
  return new THREE.Color(realitySkyBackgroundColor(preset)).getHex();
}

export class RealityEnvironmentOwner {
  private readonly ground: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly skyRoot = new THREE.Group();
  private readonly skyGroups: Record<RealitySkyPreset, THREE.Group> = {
    'overworld-day': new THREE.Group(),
    'overworld-night': new THREE.Group(),
    nether: new THREE.Group(),
    end: new THREE.Group(),
  };
  private readonly skyGeometry = new THREE.PlaneGeometry(1, 1);
  private readonly skyMaterials = new Map<number, THREE.MeshBasicMaterial>();
  private readonly fallbackNotices = new Set<string>();
  private fallbackTexture?: THREE.Texture;
  private fallbackTexturePromise?: Promise<THREE.Texture | undefined>;
  private currentTexture?: THREE.Texture;
  private currentGroundRequestKey?: string;
  private appliedGroundRequestKey?: string;
  private groundRequestGeneration = 0;
  private baseBackground = 0x0c1015;
  private groundWidth = 0;
  private groundDepth = 0;
  private enabled = false;
  private disposed = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    private readonly ports: RealityEnvironmentOwnerPorts,
  ) {
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0x667d36, side: THREE.DoubleSide }),
    );
    this.ground.name = 'realityGround';
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.035;
    this.ground.visible = false;
    this.ground.raycast = (_raycaster, _intersections) => undefined;
    this.scene.add(this.ground);

    this.skyRoot.name = 'realitySky';
    this.skyRoot.visible = false;
    this.buildSkyArtwork();
    this.camera.add(this.skyRoot);
  }

  setBaseBackground(color: number): void {
    this.baseBackground = color;
    if (!this.enabled) this.scene.background = new THREE.Color(color);
  }

  setGroundSize(width: number, depth: number): void {
    if (this.disposed || (width === this.groundWidth && depth === this.groundDepth)) return;
    this.groundWidth = Math.max(1, width);
    this.groundDepth = Math.max(1, depth);
    this.ground.scale.set(this.groundWidth, this.groundDepth, 1);
    this.ground.position.set(this.groundWidth / 2, -0.035, this.groundDepth / 2);
    if (this.currentTexture) this.updateTextureRepeat(this.currentTexture);
    this.ports.scheduleRender();
  }

  apply(configuration: RealityEnvironmentConfiguration): void {
    if (this.disposed) return;
    const wasEnabled = this.enabled;
    this.enabled = configuration.mode === 'reality';
    if (!this.enabled && wasEnabled) this.invalidateGroundRequest();
    this.ground.visible = this.enabled;
    this.skyRoot.visible = this.enabled;

    if (!this.enabled) {
      this.scene.background = new THREE.Color(this.baseBackground);
      for (const group of Object.values(this.skyGroups)) group.visible = false;
      this.ports.scheduleRender();
      return;
    }

    const skyPreset = isRealitySkyPreset(configuration.skyPreset)
      ? configuration.skyPreset
      : DEFAULT_REALITY_BACKGROUND.skyPreset;
    this.scene.background = new THREE.Color(realitySkyBackground(skyPreset));
    for (const preset of Object.keys(this.skyGroups) as RealitySkyPreset[])
      this.skyGroups[preset].visible = this.enabled && preset === skyPreset;
    if (skyPreset !== configuration.skyPreset) {
      this.notifyFallback(`sky:${configuration.skyPreset}`, {
        kind: 'sky',
        requested: String(configuration.skyPreset),
        fallback: DEFAULT_REALITY_BACKGROUND.skyPreset,
      });
    }

    this.applyGround(configuration);
    this.ports.scheduleRender();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.invalidateGroundRequest();
    this.scene.remove(this.ground);
    this.camera.remove(this.skyRoot);
    this.ground.geometry.dispose();
    this.ground.material.map = null;
    this.ground.material.dispose();
    this.skyGeometry.dispose();
    for (const material of this.skyMaterials.values()) material.dispose();
    this.skyMaterials.clear();
    if (this.currentTexture && this.currentTexture !== this.fallbackTexture)
      this.currentTexture.dispose();
    this.fallbackTexture?.dispose();
    this.currentTexture = undefined;
    this.fallbackTexture = undefined;
    this.fallbackTexturePromise = undefined;
    this.fallbackNotices.clear();
  }

  private applyGround(configuration: RealityEnvironmentConfiguration): void {
    const groundIsValid = isRealityGroundPreset(configuration.groundPreset);
    const groundPreset = groundIsValid
      ? configuration.groundPreset
      : DEFAULT_REALITY_BACKGROUND.groundPreset;
    const invalidGroundFallback = !groundIsValid
      ? {
          kind: 'ground' as const,
          requested: String(configuration.groundPreset),
          fallback: DEFAULT_REALITY_BACKGROUND.groundPreset,
        }
      : undefined;
    if (invalidGroundFallback) {
      this.notifyFallback(`ground:${configuration.groundPreset}:invalid`, invalidGroundFallback);
    }
    const requestedUrl =
      groundPreset === DEFAULT_REALITY_BACKGROUND.groundPreset
        ? BUNDLED_PLAINS_GRASS_TEXTURE
        : configuration.groundTextureUrl;
    const assetRevision =
      groundPreset === DEFAULT_REALITY_BACKGROUND.groundPreset ? 0 : configuration.assetRevision;

    if (!requestedUrl && groundPreset !== DEFAULT_REALITY_BACKGROUND.groundPreset) {
      const requestKey = configuration.resourcesReady
        ? `missing:${groundPreset}:${assetRevision}`
        : `pending:${groundPreset}:${assetRevision}`;
      if (this.currentGroundRequestKey === requestKey) return;
      const requestGeneration = this.beginGroundRequest(requestKey);
      this.showFallbackWhileLoading(requestKey, requestGeneration);
      if (configuration.resourcesReady) {
        this.notifyFallback(`ground:${groundPreset}:${assetRevision}:missing`, {
          kind: 'ground',
          requested: groundPreset,
          fallback: DEFAULT_REALITY_BACKGROUND.groundPreset,
        });
      }
      return;
    }

    const requestKey = `${groundPreset}:${requestedUrl}:${assetRevision}`;
    if (this.currentGroundRequestKey === requestKey) return;
    const requestGeneration = this.beginGroundRequest(requestKey);
    if (this.appliedGroundRequestKey === requestKey && this.currentTexture) return;
    this.showFallbackWhileLoading(requestKey, requestGeneration);
    if (groundPreset === DEFAULT_REALITY_BACKGROUND.groundPreset) return;

    void this.loadTexture(requestedUrl!).then((texture) => {
      if (!this.isCurrentGroundRequest(requestKey, requestGeneration)) {
        if (texture && texture !== this.fallbackTexture) texture.dispose();
        return;
      }
      if (!texture) {
        this.showFallbackWhileLoading(requestKey, requestGeneration);
        this.notifyFallback(`ground:${groundPreset}:${assetRevision}:invalid`, {
          kind: 'ground',
          requested: groundPreset,
          fallback: DEFAULT_REALITY_BACKGROUND.groundPreset,
        });
        return;
      }
      this.installGroundTexture(texture, requestKey);
    });
  }

  private beginGroundRequest(requestKey: string): number {
    this.currentGroundRequestKey = requestKey;
    this.groundRequestGeneration += 1;
    return this.groundRequestGeneration;
  }

  private invalidateGroundRequest(): void {
    this.currentGroundRequestKey = undefined;
    this.groundRequestGeneration += 1;
  }

  private isCurrentGroundRequest(requestKey: string, generation: number): boolean {
    return (
      this.enabled &&
      !this.disposed &&
      this.currentGroundRequestKey === requestKey &&
      this.groundRequestGeneration === generation
    );
  }

  private showFallbackWhileLoading(requestKey: string, generation: number): void {
    const fallbackTextureKey = `plains-grass:${BUNDLED_PLAINS_GRASS_TEXTURE}:0`;
    if (this.fallbackTexture) {
      if (this.isCurrentGroundRequest(requestKey, generation))
        this.installGroundTexture(this.fallbackTexture, fallbackTextureKey);
      return;
    }
    void this.loadFallbackTexture().then((texture) => {
      if (
        texture &&
        this.isCurrentGroundRequest(requestKey, generation) &&
        this.appliedGroundRequestKey !== requestKey
      )
        this.installGroundTexture(texture, fallbackTextureKey);
    });
  }

  private installGroundTexture(texture: THREE.Texture, requestKey: string): void {
    if (this.disposed) return;
    const previous = this.currentTexture;
    this.currentTexture = texture;
    this.appliedGroundRequestKey = requestKey;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    this.updateTextureRepeat(texture);
    texture.needsUpdate = true;
    this.ground.material.map = texture;
    this.ground.material.color.set(0xffffff);
    this.ground.material.needsUpdate = true;
    if (previous && previous !== texture && previous !== this.fallbackTexture) previous.dispose();
    this.ports.scheduleRender();
  }

  private async loadFallbackTexture(): Promise<THREE.Texture | undefined> {
    if (this.fallbackTexture) return this.fallbackTexture;
    if (this.fallbackTexturePromise) return this.fallbackTexturePromise;
    this.fallbackTexturePromise = this.loadTexture(BUNDLED_PLAINS_GRASS_TEXTURE).then((texture) => {
      if (!texture) return undefined;
      if (this.disposed) {
        texture.dispose();
        return undefined;
      }
      this.fallbackTexture = texture;
      return texture;
    });
    return this.fallbackTexturePromise;
  }

  private updateTextureRepeat(texture: THREE.Texture): void {
    texture.repeat.set(
      Math.max(1, this.groundWidth / GROUND_TILE_SIZE),
      Math.max(1, this.groundDepth / GROUND_TILE_SIZE),
    );
    texture.needsUpdate = true;
  }

  private async loadTexture(url: string): Promise<THREE.Texture | undefined> {
    try {
      const texture = await this.ports.loadTexture(url);
      if (this.validTexture(texture)) return texture;
      texture.dispose();
    } catch {
      return undefined;
    }
    return undefined;
  }

  private validTexture(texture: THREE.Texture): boolean {
    const image = texture.image as
      | {
          readonly width?: number;
          readonly height?: number;
          readonly naturalWidth?: number;
          readonly naturalHeight?: number;
        }
      | undefined;
    const width = image?.naturalWidth ?? image?.width ?? 0;
    const height = image?.naturalHeight ?? image?.height ?? 0;
    return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;
  }

  private notifyFallback(key: string, fallback: RealityEnvironmentFallback): void {
    if (this.fallbackNotices.has(key) || this.disposed || !this.enabled) return;
    this.fallbackNotices.add(key);
    this.ports.onFallback(fallback);
  }

  private buildSkyArtwork(): void {
    for (const preset of Object.keys(this.skyGroups) as RealitySkyPreset[]) {
      this.skyGroups[preset].name = `realitySky:${preset}`;
      this.skyRoot.add(this.skyGroups[preset]);
    }

    const day = this.skyGroups['overworld-day'];
    this.addRect(day, 250, 160, 58, 58, 0xffe186);
    this.addCloud(day, -190, 95);
    this.addCloud(day, 110, 35);
    this.addCloud(day, -20, -90);

    const night = this.skyGroups['overworld-night'];
    this.addRect(night, 250, 160, 54, 54, 0xe8ebd2);
    this.addRect(night, 270, 177, 46, 46, realitySkyBackground('overworld-night'));
    for (const [x, y, size] of [
      [-320, 150, 3],
      [-210, 10, 2],
      [-95, 175, 3],
      [15, 105, 2],
      [135, 205, 2],
      [330, 90, 3],
      [210, -80, 2],
      [-295, -95, 2],
      [-30, -185, 3],
      [95, -135, 2],
    ] as const)
      this.addRect(night, x, y, size, size, 0xf3f0d0);

    const nether = this.skyGroups.nether;
    this.addRect(nether, -250, 40, 180, 80, 0x76252a);
    this.addRect(nether, -90, 115, 125, 95, 0x371522);
    this.addRect(nether, 150, 65, 200, 110, 0x69212c);
    this.addRect(nether, 310, -35, 110, 150, 0x32141c);
    this.addRect(nether, -150, -180, 180, 22, 0xf16a32);
    this.addRect(nether, 140, -110, 260, 18, 0xff9b42);

    const end = this.skyGroups.end;
    for (const [x, y, size] of [
      [-280, 160, 3],
      [-170, 50, 2],
      [-65, 190, 3],
      [55, 95, 2],
      [190, 175, 3],
      [325, 55, 2],
      [250, -75, 2],
      [-240, -100, 2],
      [-30, -180, 3],
      [90, -125, 2],
    ] as const)
      this.addRect(end, x, y, size, size, 0xd7b6f5);
    this.addRect(end, -250, -205, 280, 28, 0x51415a);
    this.addRect(end, 145, -145, 190, 24, 0x40334b);
    this.addRect(end, 320, -205, 160, 22, 0x51415a);
  }

  private addCloud(group: THREE.Group, x: number, y: number): void {
    const color = 0xe8f2ed;
    this.addRect(group, x, y, 95, 22, color);
    this.addRect(group, x - 12, y + 13, 42, 20, color);
    this.addRect(group, x + 28, y + 12, 46, 21, color);
  }

  private addRect(
    group: THREE.Group,
    x: number,
    y: number,
    width: number,
    height: number,
    color: number,
  ): void {
    let material = this.skyMaterials.get(color);
    if (!material) {
      material = new THREE.MeshBasicMaterial({ color, depthWrite: false });
      this.skyMaterials.set(color, material);
    }
    const mesh = new THREE.Mesh(this.skyGeometry, material);
    mesh.position.set(x, y, -SKY_DISTANCE);
    mesh.scale.set(width, height, 1);
    mesh.renderOrder = -1;
    group.add(mesh);
  }
}

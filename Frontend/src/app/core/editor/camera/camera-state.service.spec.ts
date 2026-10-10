import { describe, expect, it } from 'vitest';
import { CameraStateService } from './camera-state.service';

describe('CameraStateService', () => {
  it('shares the current editor pose between 3D and Y-layer modes', () => {
    const service = new CameraStateService();
    const pose = {
      position: { x: 4, y: 5, z: 6 },
      target: { x: 1, y: 2, z: 3 },
      up: { x: 0, y: 1, z: 0 },
    };
    service.set('3d', pose);
    expect(service.get('y-layer')).toEqual(pose);
    expect(service.threeD()).toEqual(service.yLayer());
    const next = {
      position: { x: -1, y: 8, z: 2 },
      target: { x: 0, y: 0, z: 0 },
      up: { x: 0, y: 1, z: 0 },
    };
    service.set('y-layer', next);
    expect(service.get('3d')).toEqual(next);
  });

  it('keeps saved poses isolated by project while retaining the mode bridge', () => {
    const service = new CameraStateService();
    const first = {
      position: { x: 1, y: 2, z: 3 },
      target: { x: 0, y: 0, z: 0 },
      up: { x: 0, y: 1, z: 0 },
    };
    const second = {
      position: { x: 9, y: 8, z: 7 },
      target: { x: 4, y: 5, z: 6 },
      up: { x: 0, y: 1, z: 0 },
    };
    service.set('3d', first, 'project-a');
    service.set('y-layer', second, 'project-b');

    expect(service.get('3d', 'project-a')).toEqual(first);
    expect(service.get('y-layer', 'project-a')).toEqual(first);
    expect(service.get('3d', 'project-b')).toEqual(second);
    expect(service.get('3d', 'project-c')).toBeUndefined();
  });
});

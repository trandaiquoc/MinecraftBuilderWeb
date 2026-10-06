import { describe, expect, it } from 'vitest';
import { ViewportStatusService, hoverCoordinateForHit } from './viewport-status.service';

const a = { x: 1, y: 2, z: 3 };
const b = { x: 4, y: 5, z: 6 };

describe('ViewportStatusService', () => {
  it('prefers the actual hit block over an adjacent placement target', () => {
    expect(hoverCoordinateForHit({ block: a, target: b })).toEqual(a);
    expect(hoverCoordinateForHit({ target: b })).toEqual(b);
    expect(hoverCoordinateForHit({})).toBeUndefined();
  });

  it('accepts the active owner and rejects inactive publications', () => {
    const service = new ViewportStatusService();
    const ownerA = service.claim();
    const ownerB = service.claim();
    service.activate(ownerA, 'project-a');
    service.publish(ownerA, 'project-a', a, 'valid');
    service.publish(ownerB, 'project-a', b, 'valid');
    expect(service.target()).toEqual(a);
    expect(service.validation()).toBe('valid');
  });

  it('clears the previous owner when another viewport activates', () => {
    const service = new ViewportStatusService();
    const ownerA = service.claim();
    const ownerB = service.claim();
    service.activate(ownerA, 'project-a');
    service.publish(ownerA, 'project-a', a);
    service.activate(ownerB, 'project-a');
    expect(service.target()).toBeUndefined();
    service.publish(ownerA, 'project-a', a);
    expect(service.target()).toBeUndefined();
    service.publish(ownerB, 'project-a', b);
    expect(service.target()).toEqual(b);
  });

  it('does not let an old owner clear or release the active owner', () => {
    const service = new ViewportStatusService();
    const ownerA = service.claim();
    const ownerB = service.claim();
    service.activate(ownerA, 'project-a');
    service.publish(ownerA, 'project-a', a);
    service.activate(ownerB, 'project-a');
    service.publish(ownerB, 'project-a', b);
    service.clear(ownerA);
    service.release(ownerA);
    expect(service.target()).toEqual(b);
  });

  it('deduplicates identical coordinate publications and clears on project change', () => {
    const service = new ViewportStatusService();
    const owner = service.claim();
    service.activate(owner, 'project-a');
    service.publish(owner, 'project-a', a, 'warning');
    const first = service.target();
    service.publish(owner, 'project-a', a, 'warning');
    expect(service.target()).toBe(first);
    service.activate(owner, 'project-b');
    expect(service.target()).toBeUndefined();
    expect(service.projectId()).toBe('project-b');
  });

  it('drops a stale publication from a different project identity', () => {
    const service = new ViewportStatusService();
    const owner = service.claim();
    service.activate(owner, 'project-a');
    service.publish(owner, 'project-a', a);
    service.publish(owner, 'project-old', b);
    expect(service.target()).toBeUndefined();
    expect(service.projectId()).toBe('project-a');
  });
});

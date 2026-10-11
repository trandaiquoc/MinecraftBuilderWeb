import * as THREE from 'three';
import { applyBlockRenderRole } from './block-render-role';

describe('applyBlockRenderRole', () => {
  it('preserves base material semantics across repeated reference and normal updates', () => {
    const base = new THREE.MeshLambertMaterial({
      transparent: false,
      opacity: 0.72,
      depthWrite: true,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), base);

    applyBlockRenderRole(mesh, 'reference', 0.28);
    const reference = mesh.material as THREE.Material;
    expect(reference).not.toBe(base);
    expect(reference.transparent).toBe(true);
    expect(reference.opacity).toBe(0.28);
    expect(reference.depthWrite).toBe(true);

    applyBlockRenderRole(mesh, 'reference', 0.18);
    expect(mesh.material).toBe(reference);
    expect(reference.opacity).toBe(0.18);

    applyBlockRenderRole(mesh, 'normal', 0.18);
    expect(mesh.material).toBe(reference);
    expect(reference.transparent).toBe(false);
    expect(reference.opacity).toBe(0.72);
    expect(reference.depthWrite).toBe(true);
    expect(base.opacity).toBe(0.72);

    mesh.geometry.dispose();
    base.dispose();
    reference.dispose();
  });

  it('preserves transparency and depth-write settings of originally transparent materials', () => {
    const base = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), base);

    applyBlockRenderRole(mesh, 'reference', 0.28);
    const reference = mesh.material as THREE.Material;
    applyBlockRenderRole(mesh, 'normal', 0.28);

    expect(reference.transparent).toBe(true);
    expect(reference.opacity).toBe(0.6);
    expect(reference.depthWrite).toBe(false);

    mesh.geometry.dispose();
    base.dispose();
    reference.dispose();
  });
});

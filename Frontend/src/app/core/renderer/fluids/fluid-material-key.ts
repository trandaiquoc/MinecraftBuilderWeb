import type { ResolvedFluidRenderState } from './fluid-state';

export interface FluidMaterialDescriptor {
  readonly materialKey: string;
  readonly renderLayer: string;
  readonly texture: string;
  readonly tint?: number;
  readonly opacity?: number;
  readonly depthWrite: boolean;
  readonly doubleSided: boolean;
}

export function fluidMaterialIdentityKey(descriptor: FluidMaterialDescriptor): string {
  return JSON.stringify([
    descriptor.materialKey,
    descriptor.renderLayer,
    descriptor.texture,
    descriptor.tint ?? null,
    descriptor.opacity ?? null,
    descriptor.depthWrite,
    descriptor.doubleSided,
  ]);
}

export function fluidMaterialCacheKey(providerContractKey: string, descriptor: FluidMaterialDescriptor): string {
  return `${providerContractKey}|${fluidMaterialIdentityKey(descriptor)}`;
}

export function fluidMaterialDescriptor(state: Pick<ResolvedFluidRenderState, 'materialKey' | 'renderLayer' | 'tint' | 'opacity' | 'depthWrite' | 'doubleSided'>, texture: string): FluidMaterialDescriptor {
  return { materialKey: state.materialKey, renderLayer: state.renderLayer, texture, tint: state.tint, opacity: state.opacity, depthWrite: state.depthWrite, doubleSided: state.doubleSided };
}

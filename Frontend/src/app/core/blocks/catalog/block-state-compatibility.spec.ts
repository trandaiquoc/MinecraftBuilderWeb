import { describe, expect, it } from 'vitest';
import type { BlockDefinition } from './block-definition.types';
import { materializeBlockState } from './block-state-compatibility';

const stairs: BlockDefinition = {
  id: 'example:stairs', namespace: 'example', displayName: 'Stairs', defaultState: { facing: 'north', half: 'bottom' },
  stateDefinitions: [{ name: 'facing', values: ['north', 'south'] }, { name: 'half', values: ['top', 'bottom'] }],
  resources: { textures: [] }, support: 'full', behaviorSupport: 'full', visualSupport: 'real', visualClassification: 'standard-json', defaultStateSource: 'verified-fixture',
};

describe('materializeBlockState', () => {
  it('materializes defaults while preserving valid partial overrides', () => {
    expect(materializeBlockState(stairs, { facing: 'south' })).toEqual({ valid: true, state: { facing: 'south', half: 'bottom' } });
  });

  it('rejects unknown properties and unsupported values without dropping their data', () => {
    expect(materializeBlockState(stairs, { waterlogged: 'false' })).toMatchObject({ valid: false, issue: { code: 'unknown-state-property', property: 'waterlogged', value: 'false' } });
    expect(materializeBlockState(stairs, { facing: 'up' })).toMatchObject({ valid: false, issue: { code: 'unsupported-state-value', property: 'facing', value: 'up' } });
  });
});

import { describe, expect, it } from 'vitest';
import {
  structureJsonBlockIssueSeverity,
  structureJsonDecorationIssueSeverity,
  structureJsonImportBlockerSeverity,
} from './structure-json-validation-severity';

describe('Structure JSON validation severity', () => {
  it('maps blocking block diagnostics to error and non-blocking missing content to warning', () => {
    expect(structureJsonBlockIssueSeverity('support')).toBe('error');
    expect(structureJsonBlockIssueSeverity('content-limit')).toBe('error');
    expect(structureJsonBlockIssueSeverity('bounds')).toBe('error');
    expect(structureJsonBlockIssueSeverity('missing')).toBe('warning');
    expect(structureJsonBlockIssueSeverity('warning')).toBe('warning');
  });

  it('maps decoration assets to warning and blocking decoration failures to error', () => {
    expect(structureJsonDecorationIssueSeverity('missing-asset')).toBe('warning');
    expect(structureJsonDecorationIssueSeverity('bounds')).toBe('error');
    expect(structureJsonDecorationIssueSeverity('content-limit')).toBe('error');
  });

  it('treats every import blocker as an error', () => {
    expect(structureJsonImportBlockerSeverity('missing-support')).toBe('error');
    expect(structureJsonImportBlockerSeverity('content-limit')).toBe('error');
    expect(structureJsonImportBlockerSeverity('empty-import')).toBe('error');
  });
});

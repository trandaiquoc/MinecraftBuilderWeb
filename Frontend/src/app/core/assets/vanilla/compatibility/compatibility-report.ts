import type { CompatibilityReport } from './compatibility.types';

export function serializeCompatibilityReport(report: CompatibilityReport): string { return JSON.stringify(report, null, 2); }

export function downloadCompatibilityReport(report: CompatibilityReport): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const blob = new Blob([serializeCompatibilityReport(report)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `minecraft-compatibility-${safeFilename(report.minecraftVersion)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function safeFilename(value: string): string { return value.replace(/[^A-Za-z0-9._+-]+/g, '_'); }

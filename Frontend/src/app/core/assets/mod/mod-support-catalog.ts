import { Injectable } from '@angular/core';
import type { NormalizedModMetadata, SupportedModLoader } from './mod-loader';

export interface ModSupportCertification {
  readonly modId: string;
  readonly modVersion: string;
  readonly minecraftVersion: string;
  readonly loader: SupportedModLoader;
  readonly fingerprint?: string;
  readonly supportLevel: 'fully-supported';
  readonly testedAt?: string;
  readonly note?: string;
}

export interface ModSupportLookup {
  readonly metadata: Pick<NormalizedModMetadata, 'modId' | 'modVersion' | 'loader'>;
  readonly minecraftVersion: string;
  readonly fingerprint?: string;
}

/** Local read-only provider; a future API-backed provider can implement the same contract. */
@Injectable({ providedIn: 'root' })
export class ModSupportCatalog {
  private readonly records: readonly ModSupportCertification[] = [];

  certificationFor(lookup: ModSupportLookup): ModSupportCertification | undefined {
    return this.records.find((record) => matchesModSupportCertification(record, lookup));
  }
}

export function matchesModSupportCertification(record: ModSupportCertification, lookup: ModSupportLookup): boolean {
  return record.supportLevel === 'fully-supported'
    && record.modId === lookup.metadata.modId
    && record.modVersion === lookup.metadata.modVersion
    && record.minecraftVersion === lookup.minecraftVersion
    && record.loader === lookup.metadata.loader
    && (!record.fingerprint || record.fingerprint === lookup.fingerprint);
}

export type ModCompatibilityStatus = 'compatible' | 'incompatible' | 'unknown';

export interface ModCompatibilityResult {
  readonly status: ModCompatibilityStatus;
  readonly reason: string;
  readonly expression?: string | readonly string[];
}

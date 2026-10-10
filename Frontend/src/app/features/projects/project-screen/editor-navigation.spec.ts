import { describe, expect, it, vi } from 'vitest';
import type { Router } from '@angular/router';
import { navigateToEditor } from './editor-navigation';

describe('navigateToEditor', () => {
  it('reports successful navigation', async () => {
    const router = { navigateByUrl: vi.fn(async () => true) } as unknown as Pick<
      Router,
      'navigateByUrl'
    >;
    expect(await navigateToEditor(router)).toEqual({ status: 'navigated' });
    expect(router.navigateByUrl).toHaveBeenCalledWith('/editor');
  });

  it('preserves a router cancellation as a distinct outcome', async () => {
    const router = { navigateByUrl: vi.fn(async () => false) } as unknown as Pick<
      Router,
      'navigateByUrl'
    >;
    expect(await navigateToEditor(router)).toEqual({ status: 'cancelled' });
  });

  it('returns thrown navigation errors to the persisted-project caller for user feedback', async () => {
    const error = new Error('navigation failed');
    const router = {
      navigateByUrl: vi.fn(async () => {
        throw error;
      }),
    } as unknown as Pick<Router, 'navigateByUrl'>;
    expect(await navigateToEditor(router)).toEqual({ status: 'error', error });
  });
});

import type { Router } from '@angular/router';

export type EditorNavigationOutcome =
  | { readonly status: 'navigated' }
  | { readonly status: 'cancelled' }
  | { readonly status: 'error'; readonly error: unknown };

/** Preserves both Router cancellation and thrown navigation failures for the caller to report. */
export async function navigateToEditor(
  router: Pick<Router, 'navigateByUrl'>,
): Promise<EditorNavigationOutcome> {
  try {
    return (await router.navigateByUrl('/editor'))
      ? { status: 'navigated' }
      : { status: 'cancelled' };
  } catch (error) {
    return { status: 'error', error };
  }
}

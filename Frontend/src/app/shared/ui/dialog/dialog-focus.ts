export function trapDialogFocus(event: KeyboardEvent, root: HTMLElement): void {
  if (event.key !== 'Tab') return;
  const focusable = Array.from(root.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'));
  if (!focusable.length) { event.preventDefault(); root.focus(); return; }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

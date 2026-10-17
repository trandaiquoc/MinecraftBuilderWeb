# Structure JSON Project Import Focus Review — 2026-10-17

## Steps

1. Open the Project Screen in Chrome at 390 × 844 in the isolated browser profile.
2. Load a one-block `minecraft:stone` structure matching the existing
   `structure-json-project-import.spec.ts` case, and inspect the import preview.
3. Cancel the dialog without creating a project.

## Finding and change

Before the change, the dialog's focus trap placed initial focus on its header
Cancel button. The preview now places initial focus on the dialog heading,
`Create from Structure JSON`, so keyboard users encounter the preview context
before the available actions. The heading is programmatically focusable but is
not added to the regular Tab sequence.

## Browser checks

- Chrome headless, Dark theme, 390 × 844, isolated browser profile.
- `document.activeElement` matched the dialog heading after opening the preview;
  its visible focus outline measured 2 px.
- The dialog measured 343 × 471 px and stayed within the viewport. The document
  width was 375 px, with no horizontal overflow.
- The dialog was canceled and the browser returned to `/editor`. No project was
  created or changed.
- The payload was built in memory from the existing unit-test case and was not
  saved as a fixture.
- Screen-reader announcement quality was not independently evaluated.

## Captures

- [Import preview with its heading focused](01-import-preview-heading-focused-dark-390x844.png)

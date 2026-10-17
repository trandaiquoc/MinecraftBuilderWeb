# Project Creation Focus Review — 2026-10-17

## Steps

1. Open the Project Screen at a 390 × 844 viewport. The responsive board and controls fit within the page width.
2. Open **Create project**. Initial focus lands in the **Project name** field, ready for text entry.

## Finding and change

Before the fix, the focus trap selected the first tabbable control: the dialog's
close button. The dialog now marks the project-name input as its initial focus
target. The visible focus ring confirms the entry point.

## Browser checks

- Chrome headless, Dark theme, 390 × 844, isolated browser profile.
- `document.activeElement` matched `.project-text-input` after opening the dialog.
- The dialog measured 343 × 504 px and remained inside the viewport. Document
  width was 375 px, so there was no horizontal overflow.
- The dialog was closed after review. No project data was changed.
- The screenshots show layout and focus appearance; they do not establish screen-reader announcement quality.

## Captures

- [Project Screen](01-project-board-dark-390x844.png)
- [Create dialog with the name field focused](02-create-project-name-focused-dark-390x844.png)

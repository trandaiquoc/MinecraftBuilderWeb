# External AI Dialog Mode Context

The Import Structure JSON dialog kept its import title, import-only description,
and “Validation only” footer while its **Create with AI** tab was selected. The
AI workspace itself was visible, so the dialog's header and footer described a
different task.

The dialog title and accessible name now follow the selected outer tab. The AI
description directs users to validate the generated JSON in the Import JSON
tab, and the footer explains that the project changes only after a validated
import is applied. The Import JSON tab retains its existing title and
description.

The English before capture reproduces the previous static header and footer
copy over the same isolated empty-project render. The after captures use the
current rendered UI. The Vietnamese narrow capture confirms the longer copy
fits without widening the 390 px viewport. The test browser copied no prompt,
applied no import, and made no project changes.

## Captures

- [Before, Dark and English](before-dark-en.png)
- [After, Dark and English](after-dark-en.png)
- [Narrow, Raccoon and Vietnamese](mobile-raccoon-vi.png)

## Verification

- Targeted Angular tests for the import dialog and English/Vietnamese strings
- Browser check at 1582×804 and 390×844
- `npm run build`
- `npm run check:encoding`
- Prettier and `git diff --check`

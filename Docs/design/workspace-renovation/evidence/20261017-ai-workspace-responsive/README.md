# Create with AI Mobile Workspace Review

This review checks the five-section external AI prompt workspace in the
Structure JSON import dialog. The previous 390 px layout wrapped tab labels and
squeezed the prompt settings heading beside its helper text.

## Findings and changes

- The five AI workspace sections now stay on one row at 390 px and 320 px.
- On narrow screens, the “Include in copied prompt” heading and helper text
  stack vertically so both read at normal width.
- Compact English and Vietnamese tab labels keep each section recognizable and
  fit the 320 px viewport. The Vietnamese “Gợi ý” label replaces the wider
  “Hướng dẫn” translation.
- Existing prompt sections, include settings, validation-only behavior, and the
  local-copy privacy notice remain in place.

## Captures

- [Before: 390 px, Minecraft theme](before-390x844-minecraft.png)
- [After: 390 px, Minecraft theme](after-390x844-minecraft.png)
- [After: 320 px, Minecraft theme](after-320x740-minecraft.png)
- [After: 320 px, Vietnamese](after-320x740-vietnamese.png)

## Verification and limits

- Browser review used the isolated local one-block project. At both English
  widths, the document width matched the viewport and all tab labels stayed
  within their buttons. The Vietnamese 320 px capture passed the same checks.
- At 390 px, the prompt settings heading and helper are separate rows. The
  five-tab strip is 36 px high in the after state; it previously grew to fit
  two-line labels.
- No prompt was sent to an AI service; the app only displays its existing
  local-copy notice.
- Full Workspace visual acceptance remains open in the
  [acceptance inventory](../../WORKSPACE-UI-ACCEPTANCE-INVENTORY.md).

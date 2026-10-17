# Missing Assets Handoff Review

## Captures

- [After: Missing Assets dialog and Asset Manager action](after-missing-assets-dialog-minecraft-1440x900.png)
- [After: Asset Manager opened on Mods](after-asset-manager-mods-minecraft-1440x900.png)

## Findings and changes

The Status Bar warning opened the existing Missing Assets details dialog, but
the dialog had no direct route to the existing Asset Manager. It now includes a
theme-aware Asset Manager action. Choosing it closes the details dialog and
opens Asset Manager on the Mods tab, where users can inspect or import local
content. The warning and detail counts also use singular wording for one block
and one unique block ID in English.

## Verification and limits

- Browser review used an isolated Chrome context at 1440 by 900 in the Minecraft
  theme. A new project was created through the Project Screen, then the exact
  `kind: 'missing'` block shape from the existing Status Bar spec was used to
  exercise the warning. The user-facing warning, dialog action, and Mods-tab
  handoff were clicked and checked in the browser.
- The Missing Assets dialog was unmounted after the handoff, and the Asset
  Manager selected the Mods tab.
- Focused Status Bar and Editor Shell tests passed. Production build, source
  encoding, formatting, and `git diff --check` passed.
- This confirms the handoff to the existing empty Mods view. Mod JAR import
  preflight, progress, completion, and failure still need a compatible real
  Fabric 1.21.1 fixture.

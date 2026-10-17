# Homepage and Project Screen Renovation

**Status:** in progress. This page records the current implementation and the
approved future concept; it is not a visual acceptance report.

## Implemented Project Screen controls

- Top controls switch English/Vietnamese and Minecraft, Raccoon, Light, and Dark
  through the existing preference services; Settings opens the existing
  Settings dialog.
- The bottom status describes local guest mode and states that sign-in is
  unavailable. It does not imply an account, profile, plan, or cloud sync.
- Project creation, recent-project listing, open/delete, size policy, version
  selection, Structure JSON import, and local persistence remain owned by the
  existing Project Screen workflow.
- Project content scrolls between the top controls and the bottom local status.

## Visual acceptance

The controls milestone is technically verified in ed7b1a5, but no
Project Screen after screenshots were captured for that commit. The Workspace
browser captures document earlier Workspace states; they are not Project Screen
evidence. Visual acceptance remains open.

## Approved concept scope not yet implemented

The four [Homepage concept references](../references/) show a layered
laundromat scene, a project board, a washer that may display a real project
thumbnail, and two raccoons. The composition and scene artwork are not present
in the current Project Screen. Any future preview must use a real project
capture and preserve existing create/open/delete/import/recovery and local
persistence behavior. No placeholder account or fabricated project preview is
part of the current contract.

## Interaction research

The [Lucian Labs UI catalog](https://lucianlabs.dev/uxui-prompt/) and its
[MIT-licensed source](https://github.com/Seokwoooo/lucian-uxui-prompt) were
reviewed. HTML/CSS/JavaScript patterns from sliding tabs, dropdown menus,
undo snackbars, and button feedback were inspected. The application uses its
existing Angular controls and tokens; demo code and assets were not copied.

## Approved visual references

- [Minecraft](../references/01-minecraft.png)
- [Light](../references/02-light.png)
- [Raccoon](../references/03-raccoon.png)
- [Dark](../references/04-dark.png)

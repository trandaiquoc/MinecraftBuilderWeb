# Groups Panel Review

Current browser evidence for the Groups panel redesign. The review uses an
isolated local browser profile and a temporary two-block project; no sample
project or group is shipped with the application.

## Captures

- [Empty state, Dark, desktop](groups-empty-dark-en-1600x900.jpg)
- [Selected two-block group, Dark, desktop](groups-populated-dark-en-1600x900.jpg)
- [Selected two-block group, Minecraft, desktop](groups-populated-minecraft-en-1600x900.jpg)
- [Selected two-block group, Dark, narrow drawer](groups-populated-dark-en-390x844.jpg)

## Review notes

- The empty state explains the purpose of groups, and the Create group action is
  disabled while the name field is blank.
- The populated list shows the group name, GroupService-derived block count,
  visibility, and lock state. The active-group panel separates selection,
  management, and destructive actions.
- At 390 px, the drawer stays within the viewport width and scrolls vertically
  to expose the remaining group actions.
- The selected row's computed text/background contrast was checked for all four
  theme palettes: Minecraft 7.21:1, Raccoon 5.79:1, Light 13.32:1, and Dark
  11.48:1.
- Browser interactions created, renamed, selected, populated, and deleted a
  group in the isolated profile. GroupService tests verify the shared block
  count calculation.

## Verification

- `npm test -- --watch=false --include=src/app/core/editor/groups/group.service.spec.ts`
  — 20 tests passed.
- `npm run build` — passed.
- `npm run check:encoding` — passed.
- Prettier and `git diff --check` — passed.

This review closes the current visual review for the Groups panel states shown
here. It does not close full Workspace acceptance.

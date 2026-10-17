# Selection Inspector Hierarchy - 2026-10-17

## Scope

These Chrome captures compare the Selection inspector at a 1600 x 1000 desktop
viewport and check its right drawer at 390 x 844. The temporary English project
is an empty 16 x 16 x 16 structure.

## Change

The project overview and its actions previously appeared before the selection
context, and the actions were nested inside the metrics card. The inspector now
leads with the selected block or empty-selection card, places project quick
actions in their own card, and follows with the structure summary. Existing
selection details, state editors, and action events keep their behavior.

## Captures

- [Before - Minecraft, 1600 x 1000](workspace-minecraft-1600x1000-before.png)
- [After - Minecraft, 1600 x 1000](workspace-minecraft-1600x1000-after.png)
- [After - Raccoon, 1600 x 1000](workspace-raccoon-1600x1000-after.png)
- [After - Light, 1600 x 1000](workspace-light-1600x1000-after.png)
- [After - Dark, 1600 x 1000](workspace-dark-1600x1000-after.png)
- [After - Dark right drawer, 390 x 844](workspace-dark-390x844-after.png)

The narrow capture kept the 390 px document width and fits all three cards in
the open right drawer. The broader Workspace acceptance remains in progress.

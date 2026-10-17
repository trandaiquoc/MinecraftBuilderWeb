# Workspace Interaction Review - 2026-10-17

## Scope

These Chrome captures use a temporary empty 16 x 16 x 16 project at 390 x 844.
The import/export and Diagnostics states use the Minecraft theme; the Tools
menu collision pair uses Dark with the project-name chip visible. The import
error sample is the synthetic malformed text `{"format":`; it was validated
only and never applied to the project.

## Review

- The import validation preview no longer pushes the JSON source editor below
  the mobile viewport. The preview keeps its full diagnostics in a bounded
  scroll area while the editor remains visible.
- The Create with AI tab explains that prompt content is copied locally and
  that the app does not call an AI service.
- The JSON export and both Structure export modes fit the narrow dialog. The
  export controls remain visible in the dialog footer while the form scrolls.
- The Tools menu's Mod JAR Import entry previously opened Minecraft Versions.
  It now opens the Mods tab directly. No JAR was selected during this review.
- At 390 px, the Tools popover overlapped the project-name chip on the wrapped
  header. It now drops below that chip while staying inside the viewport.
- Project Diagnostics remains within the viewport and scrolls its renderer
  metrics inside the dialog. This empty project has no issue groups.

## Captures

### JSON import

- [Malformed JSON before the layout fix](import-invalid-before-minecraft-390x844.png)
- [Malformed JSON after the layout fix](import-invalid-after-minecraft-390x844.png)
- [Create with AI, mobile](import-ai-minecraft-390x844.png)

### JSON and Minecraft Structure export

- [Structure JSON export, mobile](export-json-minecraft-390x844.png)
- [Datapack ZIP export, mobile](export-datapack-minecraft-390x844.png)
- [Standalone Structure NBT export, mobile](export-nbt-minecraft-390x844.png)

### Tools

- [Mod JAR Import destination before the fix](mod-jar-menu-before-minecraft-390x844.png)
- [Mod JAR Import destination after the fix](mod-jar-menu-after-minecraft-390x844.png)
- [Tools menu overlapping the project chip](tools-menu-project-chip-before-390x844.png)
- [Tools menu clear of the project chip](tools-menu-project-chip-after-390x844.png)
- [Project Diagnostics, mobile](project-diagnostics-minecraft-390x844.png)

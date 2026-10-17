# 2026-10-17 Real Project Preview Review

This review used the existing local Chrome project profile. The selected project
was `Untitled structure`, with one `example:missing_renderer` block. No canonical
project data was changed.

Leaving the editor through the logo triggered the route guard and captured the
currently mounted 3D scene. IndexedDB stored a 256 x 144 WebP in
`project-previews`; its `updatedAt` matched the project summary. The selected
washer loaded that cached image. Switching among Minecraft, Raccoon, Light, and
Dark and between English and Vietnamese kept the preview visible. At 390 x 844
in Vietnamese Dark, the preview stayed within the washer card and the page had
no horizontal overflow.

The source project contains one unresolved example block, so its real renderer
preview is intentionally sparse. The capture shows the renderer output for
that project; it does not substitute sample blocks or alter unknown block data.

## Captures

- [Desktop, Dark, English](project-preview-desktop.png)
- [390 px, Dark, Vietnamese](project-preview-narrow-vi-dark.png)

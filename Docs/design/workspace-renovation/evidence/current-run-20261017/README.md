# Workspace browser evidence — 2026-10-17

These PNG files are captures of the running Angular application in an isolated
Chrome profile. They are separate from the approved Stitch reference images.
The test project was a temporary, local 16×16×16 Java 1.21.1 project with zero
placed blocks unless a row says otherwise. No user project data was opened or
changed.

## Four theme shell comparison

All captures use English, Comfortaa/Normal, the same empty project, 1600×900,
and saved 260/230 px sidebars. Only the UI theme changes.

| Theme     | Capture                                                                                              |
| --------- | ---------------------------------------------------------------------------------------------------- |
| Minecraft | [workspace-final-craft-en-1600x900-20261017.png](workspace-final-craft-en-1600x900-20261017.png)     |
| Raccoon   | [workspace-final-raccoon-en-1600x900-20261017.png](workspace-final-raccoon-en-1600x900-20261017.png) |
| Light     | [workspace-final-light-en-1600x900-20261017.png](workspace-final-light-en-1600x900-20261017.png)     |
| Dark      | [workspace-final-dark-en-1600x900-20261017.png](workspace-final-dark-en-1600x900-20261017.png)       |

## Workspace theme and font matrix

The running Workspace was captured in Chrome at 1600×900 for all four UI
themes, all three supported fonts, and both locales (24 states). Each state
was applied through the live theme and localization services. Chrome confirmed
the selected font family loaded and the document did not overflow
horizontally. The test workspace was the same local 16×16×16 project with two
placed blocks used by the surrounding audit captures.

The font choices keep a distinct visual character. Comfortaa remains the most
open at the normal setting; Chakra Petch is narrower and more technical;
Pangolin appears heavier and more compact, especially in block metadata. No
text clipping was found in this desktop pass. Pangolin readability and label
fit still need a narrow-viewport review, and this matrix does not test the
Small/Large font-size preferences or formal contrast ratios.

| Theme | Font | English | Vietnamese |
| --- | --- | --- | --- |
| Dark | Comfortaa | [workspace-font-dark-comfortaa-en-1600x900-20261017.png](workspace-font-dark-comfortaa-en-1600x900-20261017.png) | [workspace-font-dark-comfortaa-vi-1600x900-20261017.png](workspace-font-dark-comfortaa-vi-1600x900-20261017.png) |
| Dark | Chakra Petch | [workspace-font-dark-chakra-petch-en-1600x900-20261017.png](workspace-font-dark-chakra-petch-en-1600x900-20261017.png) | [workspace-font-dark-chakra-petch-vi-1600x900-20261017.png](workspace-font-dark-chakra-petch-vi-1600x900-20261017.png) |
| Dark | Pangolin | [workspace-font-dark-pangolin-en-1600x900-20261017.png](workspace-font-dark-pangolin-en-1600x900-20261017.png) | [workspace-font-dark-pangolin-vi-1600x900-20261017.png](workspace-font-dark-pangolin-vi-1600x900-20261017.png) |
| Light | Comfortaa | [workspace-font-light-comfortaa-en-1600x900-20261017.png](workspace-font-light-comfortaa-en-1600x900-20261017.png) | [workspace-font-light-comfortaa-vi-1600x900-20261017.png](workspace-font-light-comfortaa-vi-1600x900-20261017.png) |
| Light | Chakra Petch | [workspace-font-light-chakra-petch-en-1600x900-20261017.png](workspace-font-light-chakra-petch-en-1600x900-20261017.png) | [workspace-font-light-chakra-petch-vi-1600x900-20261017.png](workspace-font-light-chakra-petch-vi-1600x900-20261017.png) |
| Light | Pangolin | [workspace-font-light-pangolin-en-1600x900-20261017.png](workspace-font-light-pangolin-en-1600x900-20261017.png) | [workspace-font-light-pangolin-vi-1600x900-20261017.png](workspace-font-light-pangolin-vi-1600x900-20261017.png) |
| Minecraft | Comfortaa | [workspace-font-craft-comfortaa-en-1600x900-20261017.png](workspace-font-craft-comfortaa-en-1600x900-20261017.png) | [workspace-font-craft-comfortaa-vi-1600x900-20261017.png](workspace-font-craft-comfortaa-vi-1600x900-20261017.png) |
| Minecraft | Chakra Petch | [workspace-font-craft-chakra-petch-en-1600x900-20261017.png](workspace-font-craft-chakra-petch-en-1600x900-20261017.png) | [workspace-font-craft-chakra-petch-vi-1600x900-20261017.png](workspace-font-craft-chakra-petch-vi-1600x900-20261017.png) |
| Minecraft | Pangolin | [workspace-font-craft-pangolin-en-1600x900-20261017.png](workspace-font-craft-pangolin-en-1600x900-20261017.png) | [workspace-font-craft-pangolin-vi-1600x900-20261017.png](workspace-font-craft-pangolin-vi-1600x900-20261017.png) |
| Raccoon | Comfortaa | [workspace-font-raccoon-comfortaa-en-1600x900-20261017.png](workspace-font-raccoon-comfortaa-en-1600x900-20261017.png) | [workspace-font-raccoon-comfortaa-vi-1600x900-20261017.png](workspace-font-raccoon-comfortaa-vi-1600x900-20261017.png) |
| Raccoon | Chakra Petch | [workspace-font-raccoon-chakra-petch-en-1600x900-20261017.png](workspace-font-raccoon-chakra-petch-en-1600x900-20261017.png) | [workspace-font-raccoon-chakra-petch-vi-1600x900-20261017.png](workspace-font-raccoon-chakra-petch-vi-1600x900-20261017.png) |
| Raccoon | Pangolin | [workspace-font-raccoon-pangolin-en-1600x900-20261017.png](workspace-font-raccoon-pangolin-en-1600x900-20261017.png) | [workspace-font-raccoon-pangolin-vi-1600x900-20261017.png](workspace-font-raccoon-pangolin-vi-1600x900-20261017.png) |

## Compact Workspace shell across themes and locales

The responsive shell was captured at 780×437 in all four themes and both
locales, using Comfortaa. The sidebars collapse to Blocks and Selection
openers; the toolbar wraps to another row when needed. The English and
Vietnamese labels remained within the viewport, and Chrome reported no
document-level horizontal or vertical overflow in any of the eight states.
These captures check the closed shell only; drawer contents and narrow-viewport
font variations are covered by separate checks or remain open below.

| Theme | English | Vietnamese |
| --- | --- | --- |
| Light | [workspace-shell-compact-light-en-780x437-20261017.png](workspace-shell-compact-light-en-780x437-20261017.png) | [workspace-shell-compact-light-vi-780x437-20261017.png](workspace-shell-compact-light-vi-780x437-20261017.png) |
| Minecraft | [workspace-shell-compact-minecraft-en-780x437-20261017.png](workspace-shell-compact-minecraft-en-780x437-20261017.png) | [workspace-shell-compact-minecraft-vi-780x437-20261017.png](workspace-shell-compact-minecraft-vi-780x437-20261017.png) |
| Raccoon | [workspace-shell-compact-raccoon-en-780x437-20261017.png](workspace-shell-compact-raccoon-en-780x437-20261017.png) | [workspace-shell-compact-raccoon-vi-780x437-20261017.png](workspace-shell-compact-raccoon-vi-780x437-20261017.png) |
| Dark | [workspace-shell-compact-dark-en-780x437-20261017.png](workspace-shell-compact-dark-en-780x437-20261017.png) | [workspace-shell-compact-dark-vi-780x437-20261017.png](workspace-shell-compact-dark-vi-780x437-20261017.png) |

## Narrow Workspace font sample

All four themes were checked at 390×520 with Comfortaa, Chakra Petch, and
Pangolin in English and Vietnamese (24 states). Every font loaded; no state had
horizontal document overflow, clipped Camera buttons, or overlap between the
Quick Bar and mobile drawer openers. Comfortaa/Vietnamese wraps the Camera
actions and grows the page vertically, keeping a 149 px canvas visible; the
other states fit within the viewport. A separate 320×520 Comfortaa/Vietnamese
capture confirms the Camera controls stay inside the narrower page. Large-font
behavior is checked below; the Small-size Comfortaa matrix follows.

| Theme | Font | English | Vietnamese |
| --- | --- | --- | --- |
| Minecraft | Comfortaa | [workspace-font-narrow-comfortaa-en-390x520-20261017.png](workspace-font-narrow-comfortaa-en-390x520-20261017.png) | [workspace-font-narrow-comfortaa-vi-390x520-20261017.png](workspace-font-narrow-comfortaa-vi-390x520-20261017.png) |
| Minecraft | Chakra Petch | [workspace-font-narrow-chakra-petch-en-390x520-20261017.png](workspace-font-narrow-chakra-petch-en-390x520-20261017.png) | [workspace-font-narrow-chakra-petch-vi-390x520-20261017.png](workspace-font-narrow-chakra-petch-vi-390x520-20261017.png) |
| Minecraft | Pangolin | [workspace-font-narrow-pangolin-en-390x520-20261017.png](workspace-font-narrow-pangolin-en-390x520-20261017.png) | [workspace-font-narrow-pangolin-vi-390x520-20261017.png](workspace-font-narrow-pangolin-vi-390x520-20261017.png) |
| Dark | Comfortaa | [workspace-font-narrow-dark-comfortaa-en-390x520-20261017.png](workspace-font-narrow-dark-comfortaa-en-390x520-20261017.png) | [workspace-font-narrow-dark-comfortaa-vi-390x520-20261017.png](workspace-font-narrow-dark-comfortaa-vi-390x520-20261017.png) |
| Dark | Chakra Petch | [workspace-font-narrow-dark-chakra-petch-en-390x520-20261017.png](workspace-font-narrow-dark-chakra-petch-en-390x520-20261017.png) | [workspace-font-narrow-dark-chakra-petch-vi-390x520-20261017.png](workspace-font-narrow-dark-chakra-petch-vi-390x520-20261017.png) |
| Dark | Pangolin | [workspace-font-narrow-dark-pangolin-en-390x520-20261017.png](workspace-font-narrow-dark-pangolin-en-390x520-20261017.png) | [workspace-font-narrow-dark-pangolin-vi-390x520-20261017.png](workspace-font-narrow-dark-pangolin-vi-390x520-20261017.png) |
| Light | Comfortaa | [workspace-font-narrow-light-comfortaa-en-390x520-20261017.png](workspace-font-narrow-light-comfortaa-en-390x520-20261017.png) | [workspace-font-narrow-light-comfortaa-vi-390x520-20261017.png](workspace-font-narrow-light-comfortaa-vi-390x520-20261017.png) |
| Light | Chakra Petch | [workspace-font-narrow-light-chakra-petch-en-390x520-20261017.png](workspace-font-narrow-light-chakra-petch-en-390x520-20261017.png) | [workspace-font-narrow-light-chakra-petch-vi-390x520-20261017.png](workspace-font-narrow-light-chakra-petch-vi-390x520-20261017.png) |
| Light | Pangolin | [workspace-font-narrow-light-pangolin-en-390x520-20261017.png](workspace-font-narrow-light-pangolin-en-390x520-20261017.png) | [workspace-font-narrow-light-pangolin-vi-390x520-20261017.png](workspace-font-narrow-light-pangolin-vi-390x520-20261017.png) |
| Raccoon | Comfortaa | [workspace-font-narrow-raccoon-comfortaa-en-390x520-20261017.png](workspace-font-narrow-raccoon-comfortaa-en-390x520-20261017.png) | [workspace-font-narrow-raccoon-comfortaa-vi-390x520-20261017.png](workspace-font-narrow-raccoon-comfortaa-vi-390x520-20261017.png) |
| Raccoon | Chakra Petch | [workspace-font-narrow-raccoon-chakra-petch-en-390x520-20261017.png](workspace-font-narrow-raccoon-chakra-petch-en-390x520-20261017.png) | [workspace-font-narrow-raccoon-chakra-petch-vi-390x520-20261017.png](workspace-font-narrow-raccoon-chakra-petch-vi-390x520-20261017.png) |
| Raccoon | Pangolin | [workspace-font-narrow-raccoon-pangolin-en-390x520-20261017.png](workspace-font-narrow-raccoon-pangolin-en-390x520-20261017.png) | [workspace-font-narrow-raccoon-pangolin-vi-390x520-20261017.png](workspace-font-narrow-raccoon-pangolin-vi-390x520-20261017.png) |

The Comfortaa/Vietnamese captures before the Camera wrap change preserve the
tight edge fit measured earlier; at 320×520 the Camera group extended about
70 px past the viewport before the fix:

| Theme | Before-change capture |
| --- | --- |
| Dark | [workspace-font-narrow-before-camera-wrap-dark-comfortaa-vi-390x520-20261017.png](workspace-font-narrow-before-camera-wrap-dark-comfortaa-vi-390x520-20261017.png) |
| Light | [workspace-font-narrow-before-camera-wrap-light-comfortaa-vi-390x520-20261017.png](workspace-font-narrow-before-camera-wrap-light-comfortaa-vi-390x520-20261017.png) |
| Raccoon | [workspace-font-narrow-before-camera-wrap-raccoon-comfortaa-vi-390x520-20261017.png](workspace-font-narrow-before-camera-wrap-raccoon-comfortaa-vi-390x520-20261017.png) |
| Dark, 320×520 after change | [workspace-font-narrow-dark-comfortaa-vi-320x520-20261017.png](workspace-font-narrow-dark-comfortaa-vi-320x520-20261017.png) |

## Large Workspace font at narrow and short viewports

The large font setting was checked in the Minecraft theme with Vietnamese at
390 x 520, 390 x 600, and 320 x 520 using the temporary two-block project.
Dark, Light, and Raccoon themes were also checked in both English and
Vietnamese at 390 x 520. Before the layout change, the Camera controls ran off
the right edge and the empty Quick Bar hint covered the
responsive Blocks and Selection openers, even though the document itself did
not report overflow. The Small-font capture is included as a comparison.

At widths up to 560 px, Camera controls now wrap within the toolbar for all
font sizes. At those widths, when the viewport is at most 700 px high, the
Workspace shell grows to its content height and the page scrolls vertically;
the editor body keeps a 12rem minimum height. At 390 x 520 with the Large font,
the body measured 216 px, the editor canvas 167 px, and the Quick Bar no longer
intersected the drawer openers. With normal Comfortaa/Vietnamese, the 390 x 520
and 320 x 520 checks kept a 149 px canvas and all Camera controls inside the
viewport. At 320 x 520 with the Large font, all Camera controls remained
inside; scrolling to the bottom
revealed the Quick Bar and status bar. There was no horizontal document
overflow. At 701 px high the shell returned to the viewport-height layout with
a 192 px editor canvas and no document overflow. At 640 x 520, the Large font
fit in all four themes and locales with 204-215 px canvases, no document
overflow, no clipped Camera buttons, and no Quick Bar/drawer overlap. In the
other three themes, all six 390 x 520 states also kept the Camera buttons
inside the viewport and had zero overlap between the Quick Bar and drawer
openers.

| State | Browser capture |
| --- | --- |
| Small font, 390 x 520, before change | [workspace-font-size-small-minecraft-vi-390x520-20261017.png](workspace-font-size-small-minecraft-vi-390x520-20261017.png) |
| Large font, 390 x 520, before change | [workspace-font-size-large-minecraft-vi-390x520-20261017.png](workspace-font-size-large-minecraft-vi-390x520-20261017.png) |
| Large font, 390 x 520, after change | [workspace-font-size-large-minecraft-vi-390x520-after-20261017.png](workspace-font-size-large-minecraft-vi-390x520-after-20261017.png) |
| Large font, 390 x 600 | [workspace-font-size-large-minecraft-vi-390x600-20261017.png](workspace-font-size-large-minecraft-vi-390x600-20261017.png) |
| Large font, 320 x 520, page top | [workspace-font-size-large-minecraft-vi-320x520-20261017.png](workspace-font-size-large-minecraft-vi-320x520-20261017.png) |
| Large font, 320 x 520, page scrolled | [workspace-font-size-large-minecraft-vi-320x520-scrolled-20261017.png](workspace-font-size-large-minecraft-vi-320x520-scrolled-20261017.png) |
| Large font, Dark, English, 390 x 520 | [workspace-font-size-large-dark-en-390x520-20261017.png](workspace-font-size-large-dark-en-390x520-20261017.png) |
| Large font, Dark, Vietnamese, 390 x 520 | [workspace-font-size-large-dark-vi-390x520-20261017.png](workspace-font-size-large-dark-vi-390x520-20261017.png) |
| Large font, Light, English, 390 x 520 | [workspace-font-size-large-light-en-390x520-20261017.png](workspace-font-size-large-light-en-390x520-20261017.png) |
| Large font, Light, Vietnamese, 390 x 520 | [workspace-font-size-large-light-vi-390x520-20261017.png](workspace-font-size-large-light-vi-390x520-20261017.png) |
| Large font, Raccoon, English, 390 x 520 | [workspace-font-size-large-raccoon-en-390x520-20261017.png](workspace-font-size-large-raccoon-en-390x520-20261017.png) |
| Large font, Raccoon, Vietnamese, 390 x 520 | [workspace-font-size-large-raccoon-vi-390x520-20261017.png](workspace-font-size-large-raccoon-vi-390x520-20261017.png) |
| Large font, Minecraft, English, 640 x 520 | [workspace-font-size-large-craft-en-640x520-20261017.png](workspace-font-size-large-craft-en-640x520-20261017.png) |
| Large font, Minecraft, Vietnamese, 640 x 520 | [workspace-font-size-large-craft-vi-640x520-20261017.png](workspace-font-size-large-craft-vi-640x520-20261017.png) |
| Large font, Dark, English, 640 x 520 | [workspace-font-size-large-dark-en-640x520-20261017.png](workspace-font-size-large-dark-en-640x520-20261017.png) |
| Large font, Dark, Vietnamese, 640 x 520 | [workspace-font-size-large-dark-vi-640x520-20261017.png](workspace-font-size-large-dark-vi-640x520-20261017.png) |
| Large font, Light, English, 640 x 520 | [workspace-font-size-large-light-en-640x520-20261017.png](workspace-font-size-large-light-en-640x520-20261017.png) |
| Large font, Light, Vietnamese, 640 x 520 | [workspace-font-size-large-light-vi-640x520-20261017.png](workspace-font-size-large-light-vi-640x520-20261017.png) |
| Large font, Raccoon, English, 640 x 520 | [workspace-font-size-large-raccoon-en-640x520-20261017.png](workspace-font-size-large-raccoon-en-640x520-20261017.png) |
| Large font, Raccoon, Vietnamese, 640 x 520 | [workspace-font-size-large-raccoon-vi-640x520-20261017.png](workspace-font-size-large-raccoon-vi-640x520-20261017.png) |

## Small Workspace font at narrow viewports

The Small font-size setting was checked at 390×520 with all three fonts in all
four themes and both locales (24 states). The existing Comfortaa captures and
the Chakra Petch/Pangolin captures below had no document overflow; every Camera
button remained inside the viewport, and the Quick Bar did not overlap the
drawer openers. The editor canvas ranged from 243 to 285 px across the three
font families.

| Theme | English | Vietnamese |
| --- | --- | --- |
| Minecraft | [workspace-font-size-small-craft-en-390x520-20261017.png](workspace-font-size-small-craft-en-390x520-20261017.png) | [workspace-font-size-small-craft-vi-390x520-20261017.png](workspace-font-size-small-craft-vi-390x520-20261017.png) |
| Dark | [workspace-font-size-small-dark-en-390x520-20261017.png](workspace-font-size-small-dark-en-390x520-20261017.png) | [workspace-font-size-small-dark-vi-390x520-20261017.png](workspace-font-size-small-dark-vi-390x520-20261017.png) |
| Light | [workspace-font-size-small-light-en-390x520-20261017.png](workspace-font-size-small-light-en-390x520-20261017.png) | [workspace-font-size-small-light-vi-390x520-20261017.png](workspace-font-size-small-light-vi-390x520-20261017.png) |
| Raccoon | [workspace-font-size-small-raccoon-en-390x520-20261017.png](workspace-font-size-small-raccoon-en-390x520-20261017.png) | [workspace-font-size-small-raccoon-vi-390x520-20261017.png](workspace-font-size-small-raccoon-vi-390x520-20261017.png) |

### Chakra Petch and Pangolin at Small size

Chrome reported the selected font family for all 16 states. The document width
stayed at 390 px, all Camera controls fit, and the Quick Bar and drawer opener
rectangles did not intersect. The 16 captures are stored alongside this
evidence so the matrix can be updated in place.

| Font | Theme | English | Vietnamese |
| --- | --- | --- | --- |
| Chakra Petch | Minecraft | [Capture](workspace-font-size-small-chakra-petch-craft-en-390x520-20261017.png) | [Capture](workspace-font-size-small-chakra-petch-craft-vi-390x520-20261017.png) |
| Chakra Petch | Dark | [Capture](workspace-font-size-small-chakra-petch-dark-en-390x520-20261017.png) | [Capture](workspace-font-size-small-chakra-petch-dark-vi-390x520-20261017.png) |
| Chakra Petch | Light | [Capture](workspace-font-size-small-chakra-petch-light-en-390x520-20261017.png) | [Capture](workspace-font-size-small-chakra-petch-light-vi-390x520-20261017.png) |
| Chakra Petch | Raccoon | [Capture](workspace-font-size-small-chakra-petch-raccoon-en-390x520-20261017.png) | [Capture](workspace-font-size-small-chakra-petch-raccoon-vi-390x520-20261017.png) |
| Pangolin | Minecraft | [Capture](workspace-font-size-small-pangolin-craft-en-390x520-20261017.png) | [Capture](workspace-font-size-small-pangolin-craft-vi-390x520-20261017.png) |
| Pangolin | Dark | [Capture](workspace-font-size-small-pangolin-dark-en-390x520-20261017.png) | [Capture](workspace-font-size-small-pangolin-dark-vi-390x520-20261017.png) |
| Pangolin | Light | [Capture](workspace-font-size-small-pangolin-light-en-390x520-20261017.png) | [Capture](workspace-font-size-small-pangolin-light-vi-390x520-20261017.png) |
| Pangolin | Raccoon | [Capture](workspace-font-size-small-pangolin-raccoon-en-390x520-20261017.png) | [Capture](workspace-font-size-small-pangolin-raccoon-vi-390x520-20261017.png) |

### Small font at 320px viewport

All three fonts were checked in four themes and both locales (24 states). No
state had horizontal document overflow, clipped Camera controls, or overlap
between the Quick Bar and drawer openers. Comfortaa wraps the Camera actions
onto a second row at this width. Minecraft/Vietnamese grew 7 px taller than the
viewport; the bottom capture confirms that the Quick Bar and status bar remain
reachable after scrolling. The editor canvas ranged from 130 to 279 px.

| Font | Theme | English | Vietnamese |
| --- | --- | --- | --- |
| Comfortaa | Minecraft | [Capture](workspace-font-size-small-comfortaa-craft-en-320x520-20261017.png) | [Capture](workspace-font-size-small-comfortaa-craft-vi-320x520-20261017.png) |
| Comfortaa | Dark | [Capture](workspace-font-size-small-comfortaa-dark-en-320x520-20261017.png) | [Capture](workspace-font-size-small-comfortaa-dark-vi-320x520-20261017.png) |
| Comfortaa | Light | [Capture](workspace-font-size-small-comfortaa-light-en-320x520-20261017.png) | [Capture](workspace-font-size-small-comfortaa-light-vi-320x520-20261017.png) |
| Comfortaa | Raccoon | [Capture](workspace-font-size-small-comfortaa-raccoon-en-320x520-20261017.png) | [Capture](workspace-font-size-small-comfortaa-raccoon-vi-320x520-20261017.png) |
| Chakra Petch | Minecraft | [Capture](workspace-font-size-small-chakra-petch-craft-en-320x520-20261017.png) | [Capture](workspace-font-size-small-chakra-petch-craft-vi-320x520-20261017.png) |
| Chakra Petch | Dark | [Capture](workspace-font-size-small-chakra-petch-dark-en-320x520-20261017.png) | [Capture](workspace-font-size-small-chakra-petch-dark-vi-320x520-20261017.png) |
| Chakra Petch | Light | [Capture](workspace-font-size-small-chakra-petch-light-en-320x520-20261017.png) | [Capture](workspace-font-size-small-chakra-petch-light-vi-320x520-20261017.png) |
| Chakra Petch | Raccoon | [Capture](workspace-font-size-small-chakra-petch-raccoon-en-320x520-20261017.png) | [Capture](workspace-font-size-small-chakra-petch-raccoon-vi-320x520-20261017.png) |
| Pangolin | Minecraft | [Capture](workspace-font-size-small-pangolin-craft-en-320x520-20261017.png) | [Capture](workspace-font-size-small-pangolin-craft-vi-320x520-20261017.png) |
| Pangolin | Dark | [Capture](workspace-font-size-small-pangolin-dark-en-320x520-20261017.png) | [Capture](workspace-font-size-small-pangolin-dark-vi-320x520-20261017.png) |
| Pangolin | Light | [Capture](workspace-font-size-small-pangolin-light-en-320x520-20261017.png) | [Capture](workspace-font-size-small-pangolin-light-vi-320x520-20261017.png) |
| Pangolin | Raccoon | [Capture](workspace-font-size-small-pangolin-raccoon-en-320x520-20261017.png) | [Capture](workspace-font-size-small-pangolin-raccoon-vi-320x520-20261017.png) |

The one vertically scrolled state is documented separately:
[Comfortaa, Minecraft, Vietnamese, 320×520 at the bottom](workspace-font-size-small-comfortaa-craft-vi-320x520-20261017-scrolled.png).

## Workspace text contrast across themes

The rendered Workspace's visible text was scanned in Chrome at 1600 x 900
after each theme transition settled. With the File menu open, the scan covered
69 visible text fragments across the app chrome, menu, selected Block Browser
source, catalog cards, inspector empty state, and status bar. The Settings
dialog was checked in General, Appearance, Controls, Accessibility, and both
Shortcuts tabs (Keyboard and Mouse) for all four themes. Those sections exposed
16, 19, 18, 20, 76, and 29 visible text fragments per state. After the fixes
below, no scanned pair fell below
the WCAG AA normal-text threshold of 4.5:1 in Minecraft, Light, Raccoon, or
Dark. The separate palette contract test also checks panel, header, sidebar,
selected and secondary controls, primary and destructive buttons, status
colors, and focus boundaries across all four palettes.

The scan found that selected source counts were blended at 78% opacity. In the
Raccoon theme, the `All` count measured 4.26:1 against its selected surface.
The shared source selector and selected block, decoration, and painting
metadata now use 86% opacity. The same palette pair measures at least 4.78:1
across the four themes, and the theme service spec protects that threshold.
The Settings Shortcuts scan also found the enabled `Clear all` action at 4.12:1
in Minecraft and 4.46:1 in Raccoon. Both keyboard and mouse binding reset
buttons now use the existing destructive-button background, text, and hover
tokens. Their normal and hover color pairs are checked against all four themes
in the theme service spec. Other dialogs, popups, dynamic states, and font-size
combinations still need contrast coverage.

| State                                           | Screenshot                                                                                                                                         |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before: selected source count at 78% in Raccoon | [workspace-selected-source-count-before-raccoon-en-1600x900-20261017.png](workspace-selected-source-count-before-raccoon-en-1600x900-20261017.png) |
| After: selected source count at 86% in Raccoon  | [workspace-selected-source-count-after-raccoon-en-1600x900-20261017.png](workspace-selected-source-count-after-raccoon-en-1600x900-20261017.png)   |
| Before: `Clear all` in Minecraft                | [workspace-shortcut-clear-all-before-craft-en-1600x900-20261017.png](workspace-shortcut-clear-all-before-craft-en-1600x900-20261017.png)         |
| After: `Clear all` in Minecraft                 | [workspace-shortcut-clear-all-after-craft-en-1600x900-20261017.png](workspace-shortcut-clear-all-after-craft-en-1600x900-20261017.png)           |
| Before: `Clear all` in Raccoon                  | [workspace-shortcut-clear-all-before-raccoon-en-1600x900-20261017.png](workspace-shortcut-clear-all-before-raccoon-en-1600x900-20261017.png)     |
| After: `Clear all` in Raccoon                   | [workspace-shortcut-clear-all-after-raccoon-en-1600x900-20261017.png](workspace-shortcut-clear-all-after-raccoon-en-1600x900-20261017.png)       |

The 4.5:1 normal-text threshold follows [WCAG 2.2 Success Criterion
1.4.3](https://www.w3.org/TR/WCAG22/#contrast-minimum).

## Mobile application menus

The File menu aligns inside the viewport at 390 px in English and Vietnamese.
At 320 px, Vietnamese menu labels wrap as needed; the long Minecraft NBT export
label uses two lines instead of creating horizontal scroll. All six application
menus were opened in Vietnamese at 320 x 520. Their items remained reachable by
scrolling inside the popover, and the page stayed 320 px wide. The File menu was
also checked at 320 px in all four themes and both locales: it stayed inside the
viewport and every menu item remained hit-testable. Escape and outside clicks
dismiss menus; Escape restores focus to the trigger.

| State / locale / viewport                           | Capture                                                                                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Before horizontal alignment fix, English, 390 x 520 | [workspace-menu-file-overflow-before-dark-en-390x520-20261017.png](workspace-menu-file-overflow-before-dark-en-390x520-20261017.png) |
| After alignment fix, English, 390 x 520             | [workspace-menu-file-mobile-dark-en-390x520-20261017.png](workspace-menu-file-mobile-dark-en-390x520-20261017.png)                   |
| After alignment fix, Vietnamese, 390 x 520          | [workspace-menu-file-mobile-dark-vi-390x520-20261017.png](workspace-menu-file-mobile-dark-vi-390x520-20261017.png)                   |
| After narrow-label wrapping, English, 320 x 520     | [workspace-menu-file-mobile-dark-en-320x520-20261017.png](workspace-menu-file-mobile-dark-en-320x520-20261017.png)                   |
| Before narrow-label wrapping, Vietnamese, 320 x 520 | [workspace-menu-file-overflow-before-dark-vi-320x520-20261017.png](workspace-menu-file-overflow-before-dark-vi-320x520-20261017.png) |
| After narrow-label wrapping, Vietnamese, 320 x 520  | [workspace-menu-file-mobile-wrap-dark-vi-320x520-20261017.png](workspace-menu-file-mobile-wrap-dark-vi-320x520-20261017.png)         |

The 320 px menus with taller content use their own vertical scrolling; after
scrolling each item into view, every item received pointer hit-testing inside
the menu bounds. The View and Settings menus therefore remain usable without
extending the document viewport.

## Application menu keyboard navigation

The Help popup exposed a shared keyboard bug: repeated ArrowDown presses kept
focus on the first item. All application and Camera menus now open with focus on
the first item; ArrowDown/ArrowUp move through items and wrap, while Home/End
move to the first/last item. Unavailable commands remain focusable with an
`aria-disabled="true"` state and do not activate. ArrowDown on a trigger
opens at the first item and ArrowUp opens at the last. Menu items are removed
from the page Tab sequence, so Tab leaves the popup and closes it. Escape
closes the popup and returns visible focus to its trigger. These interactions
use the keyboard model in the W3C
[Menu Button Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/)
and [Menu and Menubar Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/).

| State | Screenshot |
| --- | --- |
| Before fix: ArrowDown remains on Controls & Shortcuts | [workspace-menu-arrowdown-stuck-before-dark-en-1600x900-20261017.png](workspace-menu-arrowdown-stuck-before-dark-en-1600x900-20261017.png) |
| ArrowDown opens Help on the first item | [workspace-menu-keyboard-01-arrowdown-opens-first-dark-en-1600x900-20261017.png](workspace-menu-keyboard-01-arrowdown-opens-first-dark-en-1600x900-20261017.png) |
| ArrowDown advances focus to About | [workspace-menu-keyboard-02-arrowdown-next-item-dark-en-1600x900-20261017.png](workspace-menu-keyboard-02-arrowdown-next-item-dark-en-1600x900-20261017.png) |
| Tab leaves the menu and focuses 3D Edit | [workspace-menu-keyboard-03-tab-leaves-menu-dark-en-1600x900-20261017.png](workspace-menu-keyboard-03-tab-leaves-menu-dark-en-1600x900-20261017.png) |
| ArrowUp opens Help on the last item | [workspace-menu-keyboard-04-arrowup-opens-last-dark-en-1600x900-20261017.png](workspace-menu-keyboard-04-arrowup-opens-last-dark-en-1600x900-20261017.png) |
| Escape closes Help and returns focus to its trigger | [workspace-menu-keyboard-05-escape-returns-trigger-dark-en-1600x900-20261017.png](workspace-menu-keyboard-05-escape-returns-trigger-dark-en-1600x900-20261017.png) |
| ArrowDown opens Camera on its first preset | [workspace-menu-keyboard-06-camera-open-first-dark-en-1600x900-20261017.png](workspace-menu-keyboard-06-camera-open-first-dark-en-1600x900-20261017.png) |
| Escape closes Camera and returns focus to its trigger | [workspace-menu-keyboard-07-camera-escape-return-dark-en-1600x900-20261017.png](workspace-menu-keyboard-07-camera-escape-return-dark-en-1600x900-20261017.png) |
| A disabled Edit command remains focusable with aria-disabled | [workspace-menu-keyboard-08-disabled-action-focus-dark-en-1600x900-20261017.png](workspace-menu-keyboard-08-disabled-action-focus-dark-en-1600x900-20261017.png) |

Chrome verified sequential movement, wraparound, Home/End, Tab dismissal,
ArrowUp/ArrowDown entry, and Escape focus return for Help and Camera. A disabled
Clear selection item stayed focusable, did not activate on click, and kept the
menu open. The component spec verifies sequential movement, disabled Edit
actions staying focusable without activation, and Camera focus return. Other
menu contents and screen-reader output were not exhaustively tested in this
pass.

## Application menu focus across themes and locales

The Help menu's first item was focused with the keyboard in each UI theme and
in English and Vietnamese. Chrome reported `:focus-visible` on the item in all
eight states. The focus outline remained visually distinguishable, the
Vietnamese labels fit, and the 1600 x 900 document had no horizontal overflow.
This is a visual and browser-state check of one menu item; it does not measure
formal contrast ratios or cover every menu item, font, or viewport.

| Theme | English | Vietnamese |
| --- | --- | --- |
| Light | [workspace-menu-focus-light-en-1600x900-20261017.png](workspace-menu-focus-light-en-1600x900-20261017.png) | [workspace-menu-focus-light-vi-1600x900-20261017.png](workspace-menu-focus-light-vi-1600x900-20261017.png) |
| Minecraft | [workspace-menu-focus-minecraft-en-1600x900-20261017.png](workspace-menu-focus-minecraft-en-1600x900-20261017.png) | [workspace-menu-focus-minecraft-vi-1600x900-20261017.png](workspace-menu-focus-minecraft-vi-1600x900-20261017.png) |
| Raccoon | [workspace-menu-focus-raccoon-en-1600x900-20261017.png](workspace-menu-focus-raccoon-en-1600x900-20261017.png) | [workspace-menu-focus-raccoon-vi-1600x900-20261017.png](workspace-menu-focus-raccoon-vi-1600x900-20261017.png) |
| Dark | [workspace-menu-focus-dark-en-1600x900-20261017.png](workspace-menu-focus-dark-en-1600x900-20261017.png) | [workspace-menu-focus-dark-vi-1600x900-20261017.png](workspace-menu-focus-dark-vi-1600x900-20261017.png) |

## Reduced motion across Projects and Workspace

The initial reduced-motion rule covered `app-editor-shell` and CDK overlays,
but not the Projects route. With Chrome emulating
`prefers-reduced-motion: reduce`, project rows still reported a 120 ms CSS
transition. The shared rule now covers descendants of `app-root` as well as
CDK overlays. After the change, project-row transitions and animations report
1 ms; the Workspace menu enter animation also drops from 150 ms to 1 ms and
its trigger transitions drop from 120 ms to 1 ms. The indeterminate progress
animation is also explicitly disabled by the reduced-motion stylesheet.

| State | Screenshot |
| --- | --- |
| Projects page with default motion preference | [workspace-project-list-motion-default-before-dark-en-1600x900-20261017.png](workspace-project-list-motion-default-before-dark-en-1600x900-20261017.png) |
| Projects page under reduced motion before the fix | [workspace-project-list-motion-reduced-before-dark-en-1600x900-20261017.png](workspace-project-list-motion-reduced-before-dark-en-1600x900-20261017.png) |
| Projects page under reduced motion after the fix | [workspace-project-list-motion-reduced-after-dark-en-1600x900-20261017.png](workspace-project-list-motion-reduced-after-dark-en-1600x900-20261017.png) |
| Workspace menu under the default preference | [workspace-menu-motion-default-open-dark-en-1600x900-20261017.png](workspace-menu-motion-default-open-dark-en-1600x900-20261017.png) |
| Workspace menu under reduced motion | [workspace-menu-motion-reduced-open-dark-en-1600x900-20261017.png](workspace-menu-motion-reduced-open-dark-en-1600x900-20261017.png) |

Computed styles were read while Chrome emulated each preference. The screenshot
captures show the settled states; they do not by themselves show animation
timing. A full pass over every animated state and locale remains open.

## Settings

The Settings window was opened from the real Workspace. General is the initial
section and focus target. The dialog's Close button is neutral and is not
automatically focused. Desktop captures are 1600×900; narrow captures are
640×520 and 390×520. The Appearance background capture shows the separate
Workspace Background tab.

| Section / viewport                                    | Capture                                                                                                                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| General, 1600×900                                     | [workspace-settings-final-general-dark-en-1600x900-20261017.png](workspace-settings-final-general-dark-en-1600x900-20261017.png)                             |
| Appearance, 1600×900                                  | [workspace-settings-final-appearance-dark-en-1600x900-20261017.png](workspace-settings-final-appearance-dark-en-1600x900-20261017.png)                       |
| Workspace Background, 1600×900                        | [workspace-settings-final-appearance-background-dark-en-1600x900-20261017.png](workspace-settings-final-appearance-background-dark-en-1600x900-20261017.png) |
| Controls, 1600×900                                    | [workspace-settings-final-controls-dark-en-1600x900-20261017.png](workspace-settings-final-controls-dark-en-1600x900-20261017.png)                           |
| Shortcuts, 1600×900                                   | [workspace-settings-final-shortcuts-dark-en-1600x900-20261017.png](workspace-settings-final-shortcuts-dark-en-1600x900-20261017.png)                         |
| Accessibility, 1600×900                               | [workspace-settings-final-accessibility-dark-en-1600x900-20261017.png](workspace-settings-final-accessibility-dark-en-1600x900-20261017.png)                 |
| General, 640×520                                      | [workspace-settings-general-dark-640x520-20261017.png](workspace-settings-general-dark-640x520-20261017.png)                                                 |
| General, 390×520                                      | [workspace-settings-general-dark-390x520-20261017.png](workspace-settings-general-dark-390x520-20261017.png)                                                 |
| Accessibility selected by keyboard, 390×520           | [workspace-settings-accessibility-dark-390x520-keyboard-20261017.png](workspace-settings-accessibility-dark-390x520-keyboard-20261017.png)                   |
| Focus returned to Settings trigger by Escape, 390×520 | [workspace-settings-focus-return-dark-390x520-20261017.png](workspace-settings-focus-return-dark-390x520-20261017.png)                                       |
| Focus returned to Help trigger by Escape, 390×520     | [workspace-help-focus-return-dark-390x520-20261017.png](workspace-help-focus-return-dark-390x520-20261017.png)                                               |

At 390×520 the Settings dialog stays inside the viewport and keeps its footer
visible. Tab moved focus from General to Accessibility; Enter selected it and
scrolled the active item into view. The document did not overflow horizontally.

## Settings Appearance tab keyboard navigation

The two Appearance tabs previously both stayed in the page Tab sequence, and
ArrowRight left focus on Interface. They now use one selected-tab stop; Left and
Right wrap between tabs, Home and End select the first and last tabs, and Tab
continues to the selected panel's first control. The browser check covered the
four themes and both locales. Focus indicators remained visible and translated
labels fit. The theme and locale were restored to Dark and English afterward.

| State | Screenshot |
| --- | --- |
| Before: Appearance tabs | [workspace-settings-appearance-tabs-before-dark-en-1600x900-20261017.png](workspace-settings-appearance-tabs-before-dark-en-1600x900-20261017.png) |
| Before: ArrowRight left focus on Interface | [workspace-settings-appearance-tab-arrow-right-before-dark-en-1600x900-20261017.png](workspace-settings-appearance-tab-arrow-right-before-dark-en-1600x900-20261017.png) |
| After: ArrowRight selects Workspace Background | [workspace-settings-appearance-background-arrow-dark-en-1600x900-20261017.png](workspace-settings-appearance-background-arrow-dark-en-1600x900-20261017.png) |
| After: ArrowLeft selects Interface | [workspace-settings-appearance-interface-arrow-dark-en-1600x900-20261017.png](workspace-settings-appearance-interface-arrow-dark-en-1600x900-20261017.png) |
| Tab continues to Editor background, skipping the inactive tab | [workspace-settings-appearance-tab-tabstop-dark-en-1600x900-20261017.png](workspace-settings-appearance-tab-tabstop-dark-en-1600x900-20261017.png) |

The focused Workspace Background tab was also captured in every theme and
locale combination:

| Theme | English | Vietnamese |
| --- | --- | --- |
| Light | [Light / English](workspace-settings-appearance-background-arrow-light-en-1600x900-20261017.png) | [Light / Vietnamese](workspace-settings-appearance-background-arrow-light-vi-1600x900-20261017.png) |
| Dark | [Dark / English](workspace-settings-appearance-background-arrow-dark-en-1600x900-20261017.png) | [Dark / Vietnamese](workspace-settings-appearance-background-arrow-dark-vi-1600x900-20261017.png) |
| Minecraft | [Minecraft / English](workspace-settings-appearance-background-arrow-craft-en-1600x900-20261017.png) | [Minecraft / Vietnamese](workspace-settings-appearance-background-arrow-craft-vi-1600x900-20261017.png) |
| Raccoon | [Raccoon / English](workspace-settings-appearance-background-arrow-raccoon-en-1600x900-20261017.png) | [Raccoon / Vietnamese](workspace-settings-appearance-background-arrow-raccoon-vi-1600x900-20261017.png) |

The focused component spec covers one tab stop, ArrowLeft/Right wrapping, Home,
End, focus movement, selected state, and panel switching. Chrome also verified
Tab leaving the tablist for the active panel.

## Block Browser search recovery and mobile drawer

The empty search state is a bordered, centered panel announced as a polite
status. When a query has no matches, its Clear search button is keyboard
reachable; activating it restores all 906 results and returns focus to the
search input. Native Tab traversed the catalog through the final Zombie Head
entry; Shift+Tab returned to its Quick Bar action. The quick-add tooltip now
flips above and aligns inside the last compact row. At 390×520, the sidebar
drawer covers the viewport and keeps the search field and empty state inside
the visible panel. The document stayed at 390 px wide. Captures use the same
two-block audit project.

| State / theme / viewport                    | Capture                                                                                                                                                                                  |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before empty-state recovery, Dark, 1600×900 | [workspace-block-search-empty-before-dark-en-1600x900-20261017.png](workspace-block-search-empty-before-dark-en-1600x900-20261017.png)                                                   |
| After recovery, Minecraft, 1600×900         | [workspace-block-search-empty-craft-en-1600x900-20261017.png](workspace-block-search-empty-craft-en-1600x900-20261017.png)                                                               |
| After recovery, Raccoon, 1600×900           | [workspace-block-search-empty-raccoon-en-1600x900-20261017.png](workspace-block-search-empty-raccoon-en-1600x900-20261017.png)                                                           |
| After recovery, Light, 1600×900             | [workspace-block-search-empty-light-en-1600x900-20261017.png](workspace-block-search-empty-light-en-1600x900-20261017.png)                                                               |
| After recovery, Dark, 1600×900              | [workspace-block-search-empty-dark-en-1600x900-20261017.png](workspace-block-search-empty-dark-en-1600x900-20261017.png)                                                                 |
| Cleared by keyboard, Dark, 1600×900         | [workspace-block-search-cleared-dark-en-1600x900-20261017.png](workspace-block-search-cleared-dark-en-1600x900-20261017.png)                                                             |
| Empty state, Vietnamese, Raccoon, 390×520   | [workspace-block-search-empty-raccoon-vi-390x520-20261017.png](workspace-block-search-empty-raccoon-vi-390x520-20261017.png)                                                             |
| Last virtual row before tooltip fix         | [workspace-block-browser-keyboard-last-item-dark-en-1600x900-20261017.png](workspace-block-browser-keyboard-last-item-dark-en-1600x900-20261017.png)                                     |
| Last virtual row after tooltip fix          | [workspace-block-browser-keyboard-last-item-dark-en-1600x900-20261017-after-tooltip-fix.png](workspace-block-browser-keyboard-last-item-dark-en-1600x900-20261017-after-tooltip-fix.png) |

The narrow drawer measured 340×520 at x=0 with no document overflow. Both the
search input and empty panel remained inside its bounds. Chrome's native Tab
and Enter activated Clear search; the query became empty, all 906 blocks
returned, and `#block-search` regained focus. The native Tab pass reached the
last virtual row and then left the list; Shift+Tab returned to the final row's
Quick Bar action. The screenshot pair shows the tooltip clipping before the
row-aware flip and its corrected placement afterward.

## Block Browser unavailable-assets recovery

The unavailable-assets message now uses `role="alert"`; Retry and Open Asset
Manager remain separate native buttons outside the live region. Native Tab
moved from search to Retry and then Open Asset Manager. Enter opened Asset
Manager on its Vanilla tab; Escape closed it and returned focus to the opener.
At 390×520, the Raccoon drawer kept the Vietnamese alert and both actions
inside its 340 px width, with no horizontal document overflow.

| State / theme / viewport               | Capture                                                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Before alert semantics, Dark, 1600×900 | [workspace-block-browser-no-assets-before-dark-en-1600x900-20261017.png](workspace-block-browser-no-assets-before-dark-en-1600x900-20261017.png) |
| Alert state, Dark, 1600×900            | [workspace-block-browser-no-assets-after-dark-en-1600x900-20261017.png](workspace-block-browser-no-assets-after-dark-en-1600x900-20261017.png)   |
| Alert state, Minecraft, 1600×900       | [workspace-block-browser-no-assets-craft-en-1600x900-20261017.png](workspace-block-browser-no-assets-craft-en-1600x900-20261017.png)             |
| Alert state, Light, 1600×900           | [workspace-block-browser-no-assets-light-en-1600x900-20261017.png](workspace-block-browser-no-assets-light-en-1600x900-20261017.png)             |
| Alert and actions, Raccoon VI, 390×520 | [workspace-block-browser-no-assets-raccoon-vi-390x520-20261017.png](workspace-block-browser-no-assets-raccoon-vi-390x520-20261017.png)           |

The no-assets presentation was forced in the isolated browser after normal
bootstrap to capture the fallback; no asset download or cache removal was
started. The component spec verifies the real no-assets branch and alert role.
This visual pass does not simulate a network failure or verify Retry's
download result.

## Workspace panels and responsive shell

| State / viewport                                   | Capture                                                                                                                                                                |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dark shell, 780×437                                | [workspace-editor-dark-780x437-20261017.png](workspace-editor-dark-780x437-20261017.png)                                                                               |
| Dark shell, after resizing back to 1600×900        | [workspace-editor-dark-after-resize-1600x900-20261017.png](workspace-editor-dark-after-resize-1600x900-20261017.png)                                                   |
| Dark shell, 390×520                                | [workspace-editor-dark-after-resize-390x520-20261017.png](workspace-editor-dark-after-resize-390x520-20261017.png)                                                     |
| Dark shell with narrow-screen drawer open, 390×520 | [workspace-editor-dark-390x520-drawer-after-20261017.png](workspace-editor-dark-390x520-drawer-after-20261017.png)                                                     |
| Decorations                                        | [workspace-decoration-dark-en-1600x900-20261017-final.png](workspace-decoration-dark-en-1600x900-20261017-final.png)                                                   |
| Empty Groups state                                 | [workspace-groups-empty-dark-en-1600x900-20261017.png](workspace-groups-empty-dark-en-1600x900-20261017.png)                                                           |
| Quick Bar with Stone added                         | [workspace-quickbar-stone-dark-en-1600x900-20261017.png](workspace-quickbar-stone-dark-en-1600x900-20261017.png)                                                       |
| Empty Block Usage                                  | [workspace-block-usage-empty-dark-en-1600x900-20261017.png](workspace-block-usage-empty-dark-en-1600x900-20261017.png)                                                 |
| Block Usage, one Stone                             | [workspace-block-usage-one-stone-dark-en-1600x900-20261017.png](workspace-block-usage-one-stone-dark-en-1600x900-20261017.png)                                         |
| Block Usage, Stone and Oak Stairs                  | [workspace-block-usage-two-types-dark-en-1600x900-20261017.png](workspace-block-usage-two-types-dark-en-1600x900-20261017.png)                                         |
| Block Usage, Oak Stairs highlighted by keyboard    | [workspace-block-usage-two-types-oak-highlighted-dark-en-1600x900-20261017.png](workspace-block-usage-two-types-oak-highlighted-dark-en-1600x900-20261017.png)         |
| Selected Stone, empty BlockState                   | [workspace-inspector-selected-stone-dark-en-1600x900-20261017.png](workspace-inspector-selected-stone-dark-en-1600x900-20261017.png)                                   |
| Selected Oak Stairs, BlockState controls           | [workspace-inspector-oak-stairs-controls-dark-en-1600x900-20261017.png](workspace-inspector-oak-stairs-controls-dark-en-1600x900-20261017.png)                         |
| Oak Stairs Facing edited to South                  | [workspace-inspector-oak-stairs-edited-facing-south-dark-en-1600x900-20261017.png](workspace-inspector-oak-stairs-edited-facing-south-dark-en-1600x900-20261017.png)   |
| Oak Stairs details in the mobile inspector         | [workspace-inspector-oak-stairs-mobile-details-dark-en-390x520-20261017.png](workspace-inspector-oak-stairs-mobile-details-dark-en-390x520-20261017.png)               |
| Oak Stairs controls in the mobile inspector        | [workspace-inspector-oak-stairs-mobile-controls-dark-en-390x520-20261017.png](workspace-inspector-oak-stairs-mobile-controls-dark-en-390x520-20261017.png)             |
| Mobile Facing options open                         | [workspace-inspector-oak-stairs-mobile-facing-options-dark-en-390x520-20261017.png](workspace-inspector-oak-stairs-mobile-facing-options-dark-en-390x520-20261017.png) |
| Datapack ZIP download complete, 1600 x 900         | [workspace-nbt-datapack-export-success-two-blocks-dark-en-1600x900-20261017.png](workspace-nbt-datapack-export-success-two-blocks-dark-en-1600x900-20261017.png)       |
| Datapack ZIP download complete, 390 x 520          | [workspace-nbt-datapack-export-success-two-blocks-dark-en-390x520-20261017.png](workspace-nbt-datapack-export-success-two-blocks-dark-en-390x520-20261017.png)         |
| Standalone NBT download complete, 1600 x 900       | [workspace-nbt-standalone-export-success-two-blocks-dark-en-1600x900-20261017.png](workspace-nbt-standalone-export-success-two-blocks-dark-en-1600x900-20261017.png)   |

Stone was added to and then removed from the Quick Bar through the UI. The
project stayed at zero placed blocks for that interaction. Later inspector
and populated Block Usage captures use the same isolated synthetic project
with one Stone and one Oak Stairs; the stairs Facing value was restored to
North after the edit check. No user project data was opened or changed.
Existing 2026-10-16 evidence in the
[Workspace renovation index](../../README.md) covers populated Block Usage,
data-heavy flows, menus, diagnostics, and renderer output.

The selected-block pass confirms the Inspector shows the exact registry ID,
position, group, and canonical BlockState. Oak Stairs exposes Facing, Half,
Shape, and Waterlogged; Shape is marked auto-derived and disabled. Changing
Facing to South by pointer updated both the Inspector and the selected
combobox. A keyboard Escape/ArrowDown/Enter flow changed it to West, then the
value was restored to North. Block Usage showed 2 total blocks, 2 unique
types, 0 missing blocks, and both exact registry IDs at 50% each. The
inspector itself scrolls when a selected block has several state properties;
the document viewport remains fixed without horizontal overflow. In Block
Usage, Tab from the sort control focused Oak Stairs and Enter toggled its
highlight button to `aria-pressed=true`; the recorded capture shows the
highlighted row. At 390 x 520, the Inspector opens as a 340 px drawer with a
270 px scroll viewport. Internal scrolling exposes the selected block details
and all four state controls. The Facing option menu stays within the drawer
and viewport, and the document has no horizontal overflow.

The browser exported the two-block project in both supported formats. The
downloaded `workspace-ui-audit.zip` contained only `pack.mcmeta` and
`data/theblocklaundromat/structure/workspace-ui-audit.nbt`; its pack format was 48. Both NBT outputs decoded with the empty root name, DataVersion 3955, size
16 x 16 x 16, and 4,096 block entries. The palette preserved Stone and Oak
Stairs with `facing=north`, `half=bottom`, `shape=straight`, and
`waterlogged=false`; the two non-air block positions were X4/Y0/Z3 and
X4/Y0/Z4. The dialog displayed successful byte counts of 8,646 for the ZIP
and 8,252 for the standalone NBT. The 390 x 520 datapack dialog retained its
download and cancel actions with no horizontal overflow. The File menu offers
Structure JSON import but no Structure NBT import; NBT loading in Minecraft
was not part of this browser check.

## Decorations and Groups sidebar tabs

| State / viewport | Screenshot |
| --- | --- |
| Decorations selected with visible keyboard focus, two-block project, 390 x 520 | [workspace-decorations-keyboard-dark-en-390x520-20261017.png](workspace-decorations-keyboard-dark-en-390x520-20261017.png) |
| Groups selected with visible keyboard focus, two-block project, 390 x 520 | [workspace-groups-keyboard-dark-en-390x520-20261017.png](workspace-groups-keyboard-dark-en-390x520-20261017.png) |

Native ArrowRight moved Blocks → Decorations → Groups; Home and End selected
the first and last tabs. Only the selected tab is in the tab sequence, and Tab
from Groups entered the Group name field. Escape closed the 390 x 520 drawer
and returned focus to its Blocks opener. The Decorations and Groups labels stay
visible at this drawer width, so their tooltips are suppressed instead of
covering tab content; tooltips remain available in the narrow icon-only mode.
The Manage sources tooltip is aligned to the selector's right edge: before the
fix the selector measured 286/327 px (client/scroll width) and the Decorations
panel 307/338 px; afterward both measured equal widths (286/286 and 307/307).
The document stayed 390 px wide without horizontal overflow.

## Quick Bar collapse and save status announcements

| State / viewport | Screenshot |
| --- | --- |
| Quick Bar collapsed with keyboard focus, Dark EN, 390 x 520 | [workspace-quickbar-collapsed-dark-en-390x520-20261017.png](workspace-quickbar-collapsed-dark-en-390x520-20261017.png) |

At 390 x 520, Enter collapsed and expanded the empty Quick Bar while keeping
focus on its toggle. The button exposes `aria-expanded=false/true` and the
localized Expand/Collapse action name; the slot panel is removed while
collapsed. The save label exposes `role=status`, polite live updates, and
atomic text for Saved, Saving, and Save error. The status semantics and
Quick Bar state were checked in Minecraft, Raccoon, Light, and Dark with both
English and Vietnamese; the document stayed 390 px wide. At 320 x 520 in
Vietnamese, the footer wrapped to two rows and remained 320 px wide. The
browser was returned to Dark/English with the empty Quick Bar expanded.

## Sidebar resize keyboard access

| State / viewport | Screenshot |
| --- | --- |
| Left resize separator focused, Dark EN, 1600 x 900 | [workspace-sidebar-resizer-keyboard-dark-en-1600x900-20261017.png](workspace-sidebar-resizer-keyboard-dark-en-1600x900-20261017.png) |
| Focus transferred to Open inspector after resizing to mobile mode, Dark EN, 780 x 437 | [workspace-resize-focus-mobile-opener-dark-en-780x437-20261017.png](workspace-resize-focus-mobile-opener-dark-en-780x437-20261017.png) |

At 1600 x 900, the left and right separators expose localized names,
`aria-valuemin`, `aria-valuenow`, and `aria-valuemax`. ArrowRight increased
the left width from 260 to 276 px; ArrowLeft restored it to 260 px while the
visible keyboard focus stayed on the separator. At 900 px, the current
260/230 px columns report maximum widths of 350/320 px. At 851 px, three
ArrowRight presses clamp the left column at 301 px, leaving the 320 px minimum
center workspace; its announced maximum updates to 301. The saved width was
restored to 260 px after the clamp check.

The accessible names and ranges were checked in Minecraft, Raccoon, Light, and
Dark with English and Vietnamese. At 780 x 437 and 390 x 520, the resize
separators are hidden and the responsive sidebar controls are available; the
document has no horizontal overflow. When a focused desktop separator becomes
hidden at 780 x 437, focus moves to the matching responsive sidebar opener and
remains visible. The browser was returned to the 260/230 px saved widths.

## Structure JSON browser round trip

| Step                                          | Screenshot                                                                                                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Export                                        | [workspace-structure-json-export-two-blocks-dark-en-1600x900-20261017.png](workspace-structure-json-export-two-blocks-dark-en-1600x900-20261017.png)                                 |
| Import validation, desktop                    | [workspace-structure-json-import-validated-two-blocks-dark-en-1600x900-20261017.png](workspace-structure-json-import-validated-two-blocks-dark-en-1600x900-20261017.png)             |
| Import validation, 390 x 520                  | [workspace-structure-json-import-validated-two-blocks-dark-en-390x520-20261017.png](workspace-structure-json-import-validated-two-blocks-dark-en-390x520-20261017.png)               |
| Replace confirmation                          | [workspace-structure-json-import-confirm-replace-two-blocks-dark-en-1600x900-20261017.png](workspace-structure-json-import-confirm-replace-two-blocks-dark-en-1600x900-20261017.png) |
| Inspector after save                          | [workspace-structure-json-roundtrip-inspector-two-blocks-dark-en-1600x900-20261017.png](workspace-structure-json-roundtrip-inspector-two-blocks-dark-en-1600x900-20261017.png)       |
| Invalid JSON syntax                           | [workspace-structure-json-invalid-syntax-dark-en-1600x900-20261017.png](workspace-structure-json-invalid-syntax-dark-en-1600x900-20261017.png)                                       |
| Simulated file-read failure                   | [workspace-structure-json-file-read-error-dark-en-1600x900-20261017.png](workspace-structure-json-file-read-error-dark-en-1600x900-20261017.png)                                     |
| Valid source after error                      | [workspace-structure-json-recovered-valid-source-dark-en-1600x900-20261017.png](workspace-structure-json-recovered-valid-source-dark-en-1600x900-20261017.png)                       |
| Escape returns focus to File                  | [workspace-structure-json-import-focus-return-dark-en-1600x900-20261017.png](workspace-structure-json-import-focus-return-dark-en-1600x900-20261017.png)                             |
| Initial focus on Import JSON                  | [workspace-structure-json-import-initial-focus-dark-en-1600x900-20261017.png](workspace-structure-json-import-initial-focus-dark-en-1600x900-20261017.png)                           |
| ArrowRight selects Create with AI             | [workspace-structure-json-ai-tab-keyboard-dark-en-1600x900-20261017.png](workspace-structure-json-ai-tab-keyboard-dark-en-1600x900-20261017.png)                                     |
| ArrowRight selects Available content, desktop | [workspace-structure-json-ai-inner-content-tab-keyboard-dark-en-1600x900-20261017.png](workspace-structure-json-ai-inner-content-tab-keyboard-dark-en-1600x900-20261017.png)         |
| ArrowRight selects Available content, mobile  | [workspace-structure-json-ai-inner-content-tab-keyboard-dark-en-390x520-20261017.png](workspace-structure-json-ai-inner-content-tab-keyboard-dark-en-390x520-20261017.png)           |
| Native Tab reaches Available content, mobile  | [workspace-structure-json-ai-inner-tab-native-tab-focus-dark-en-390x520-20261017.png](workspace-structure-json-ai-inner-tab-native-tab-focus-dark-en-390x520-20261017.png)           |

The app exported a 466-byte Structure JSON file from the same isolated project,
then imported that downloaded file through the visible file picker. Validation
reported 2 blocks total, 2 valid, 0 missing definitions, 0 out-of-bounds, 0
invalid states, 0 duplicates, and 2 positive-offset warnings. At 390 x 520,
the import dialog measured 374 x 504 px, kept Apply Import visible in its
footer, and had no horizontal overflow. Applying Replace showed an explicit
confirmation to replace 2 current blocks with 2 imported blocks. After
confirmation, the app reported Saved; the Inspector showed Oak Stairs at
X4/Y0/Z3 with `facing=north`, `half=bottom`, `shape=straight`, and
`waterlogged=false`. Stone remained at X4/Y0/Z4. This verifies the non-empty
browser export/import/replace/save path for this synthetic project.

Malformed JSON syntax showed “The text is not valid JSON.” in a `role=alert`
region, left Apply Import unavailable, and kept the project Saved with its two
blocks. Loading a valid file cleared the error, reported 2 valid blocks with no
blocking issues, and enabled Apply Import; the recovery check did not apply it.
Escape closed the dialog and returned keyboard focus to the File menu trigger
with a visible focus ring. A simulated `Blob.text()` rejection also showed the
localized read-error alert, left Apply Import unavailable, and preserved the
saved two-block project. Loading a valid file afterward cleared the alert and
restored the validation preview. The browser API override used for this
simulation was restored immediately after the read-error check.

Opening the dialog puts focus on the selected Import JSON tab rather than the
Cancel button. The outer tablist uses roving focus: ArrowRight switches to
Create with AI, ArrowLeft returns to Import JSON, and the selected tab is the
only tab stop. Unit coverage also verifies wraparound plus Home/End. Escape
from the tablist closes the dialog and restores focus to File.

The nested Create with AI tablist also uses roving focus with ArrowLeft,
ArrowRight, Home, and End. At 390 x 520, the Home then ArrowRight keyboard
sequence selects and focuses Available content; the focused tab is fully
visible inside the scrollable AI workspace and the document has no horizontal
overflow. The measured workspace spans y=223 to 466 and the focused tab spans
y=323 to 365. Native Tab traversal from Create with AI also reaches the
selected Available content tab with the same visible focus and scroll position.
The screenshots record both paths and the persistent dialog footer.

## File export dialog close and focus return

This current-run check followed the File menu into both export dialogs. The
dialogs showed the isolated two-block project; no download was started.

1. Open File and inspect the available export actions.
2. Open Structure JSON export and confirm the dialog identifies the project
   and its two blocks.
3. Press Escape. The dialog closes and keyboard focus returns visibly to File.
4. Open Minecraft Structure (NBT) export and inspect its format choices,
   fields, internal scrolling, and fixed footer.
5. Press Escape. The dialog closes and focus again returns visibly to File.

| Step | Screenshot |
| --- | --- |
| 1. File menu with its trigger focused | [workspace-dialog-return-01-file-menu-dark-en-1600x900-20261017.png](workspace-dialog-return-01-file-menu-dark-en-1600x900-20261017.png) |
| 2. Structure JSON export dialog | [workspace-dialog-return-02-json-export-dark-en-1600x900-20261017.png](workspace-dialog-return-02-json-export-dark-en-1600x900-20261017.png) |
| 3. Structure JSON Escape return to File | [workspace-dialog-return-03-json-export-escape-return-dark-en-1600x900-20261017.png](workspace-dialog-return-03-json-export-escape-return-dark-en-1600x900-20261017.png) |
| 4. Minecraft Structure NBT export dialog | [workspace-dialog-return-04-nbt-export-dark-en-1600x900-20261017.png](workspace-dialog-return-04-nbt-export-dark-en-1600x900-20261017.png) |
| 5. NBT Escape return to File | [workspace-dialog-return-05-nbt-export-escape-return-dark-en-1600x900-20261017.png](workspace-dialog-return-05-nbt-export-escape-return-dark-en-1600x900-20261017.png) |

Both dialogs closed on Escape and restored a visible focus ring to the File
menu trigger; the menu remained closed. The NBT form keeps its footer visible
while its content scrolls internally. This check covers opening and closing,
not download results, validation of exported bytes, or screen-reader behavior.
No focus-return issue was found in these two flows.

## Project Diagnostics and About focus return

Tools > Project Diagnostics starts focus on its dialog heading; Escape closes
the dialog and returns visible focus to Tools. Help > About uses the shared
alert dialog; Escape closes it and returns visible focus to Help. Both menus
remain closed after their dialogs close.

| Step / state | Screenshot |
| --- | --- |
| Tools menu before opening Diagnostics | [workspace-dialog-return-06-tools-menu-dark-en-1600x900-20261017.png](workspace-dialog-return-06-tools-menu-dark-en-1600x900-20261017.png) |
| Project Diagnostics opened from Tools | [workspace-dialog-return-07-project-diagnostics-dark-en-1600x900-20261017.png](workspace-dialog-return-07-project-diagnostics-dark-en-1600x900-20261017.png) |
| Diagnostics Escape return to Tools | [workspace-dialog-return-08-project-diagnostics-escape-return-dark-en-1600x900-20261017.png](workspace-dialog-return-08-project-diagnostics-escape-return-dark-en-1600x900-20261017.png) |
| Help menu before opening About | [workspace-dialog-return-09-help-menu-dark-en-1600x900-20261017.png](workspace-dialog-return-09-help-menu-dark-en-1600x900-20261017.png) |
| About dialog opened from Help | [workspace-dialog-return-10-about-dialog-dark-en-1600x900-20261017.png](workspace-dialog-return-10-about-dialog-dark-en-1600x900-20261017.png) |
| About Escape return to Help | [workspace-dialog-return-11-about-escape-return-dark-en-1600x900-20261017.png](workspace-dialog-return-11-about-escape-return-dark-en-1600x900-20261017.png) |

These browser checks cover opening, Escape dismissal, and visible focus return;
they do not cover screen-reader announcements or every dialog action.

## Project Diagnostics focus and empty state

| State / viewport                                 | Screenshot                                                                                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Initial empty state before focus fix, 1600 x 900 | [workspace-diagnostics-overview-dark-en-1600x900-20261017.png](workspace-diagnostics-overview-dark-en-1600x900-20261017.png)       |
| Initial empty state before focus fix, 390 x 520  | [workspace-diagnostics-overview-dark-en-390x520-20261017.png](workspace-diagnostics-overview-dark-en-390x520-20261017.png)         |
| Title focus and neutral close, 1600 x 900        | [workspace-diagnostics-title-focus-dark-en-1600x900-20261017.png](workspace-diagnostics-title-focus-dark-en-1600x900-20261017.png) |
| Title focus and neutral close, 390 x 520         | [workspace-diagnostics-title-focus-dark-en-390x520-20261017.png](workspace-diagnostics-title-focus-dark-en-390x520-20261017.png)   |

The initial captures use the isolated two-block project and show zero issue
groups. Before the update, opening Diagnostics focused the red Cancel close
control. Afterward, focus lands on the dialog title and the close control uses
the neutral shared color. At 390 x 520 the dialog measures 374 x 504 px; its
body scrolls internally and the document remains 390 px wide with no horizontal
overflow. The renderer interval label and hint explain that the value is
smoothed and includes idle time. A five-block browser sample also checked
diagnostics classification using current catalog definitions: Stone had no
finding; `minecraft:oak_fence` produced a partial-behavior warning, and
`minecraft:trapped_chest` produced an informational unknown-behavior note. One
missing-content block and one unresolved ID produced separate errors. The
summary reported 4 groups / 4 affected blocks (2 errors, 1 warning, 1 info).
Compatibility details stayed collapsed on open, then expanded with
`aria-expanded=true` and two labeled cards. Both behavior messages say that
coverage does not determine placement validity.

Filtering to Warning changed the polite `role="status"` message to “1 Issue
group; 1 Affected block”. At 390 x 520 in Vietnamese Raccoon, the warning card
remained reachable by scrolling inside the dialog, the full explanation was
visible, and the document had no horizontal overflow. Short issue lists now
size to their contents; larger lists retain their own scroll region. These
checks do not validate Minecraft placement rules: Project Diagnostics reports
content, asset, visual, and behavior-coverage findings and has no
placement-validity finding in its current contract.

| State / theme / viewport                         | Screenshot                                                                                                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Mixed errors and compatibility summary, Dark EN | [workspace-diagnostics-mixed-findings-dark-en-1600x900-20261017.png](workspace-diagnostics-mixed-findings-dark-en-1600x900-20261017.png)                     |
| Compatibility expanded, Minecraft EN           | [workspace-diagnostics-compatibility-expanded-craft-en-1600x900-20261017.png](workspace-diagnostics-compatibility-expanded-craft-en-1600x900-20261017.png)     |
| Compatibility expanded, Raccoon EN             | [workspace-diagnostics-compatibility-expanded-raccoon-en-1600x900-20261017.png](workspace-diagnostics-compatibility-expanded-raccoon-en-1600x900-20261017.png) |
| Compatibility expanded, Light EN               | [workspace-diagnostics-compatibility-expanded-light-en-1600x900-20261017.png](workspace-diagnostics-compatibility-expanded-light-en-1600x900-20261017.png)     |
| Compatibility expanded, Dark EN                | [workspace-diagnostics-compatibility-expanded-dark-en-1600x900-20261017.png](workspace-diagnostics-compatibility-expanded-dark-en-1600x900-20261017.png)       |
| Warning filter, Raccoon VI, 390 x 520           | [workspace-diagnostics-warning-raccoon-vi-390x520-20261017.png](workspace-diagnostics-warning-raccoon-vi-390x520-20261017.png)                               |

The expanded mixed report retained the same error/warning/info order and
readable issue-card contrast across Minecraft, Raccoon, Light, and Dark.

## Asset Manager tabs and empty Mods state

| State / viewport                                      | Screenshot                                                                                                                                                 |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial Vanilla state before keyboard fix, 1600 x 900 | [workspace-asset-manager-initial-dark-en-1600x900-20261017.png](workspace-asset-manager-initial-dark-en-1600x900-20261017.png)                             |
| Initial Vanilla state before keyboard fix, 390 x 520  | [workspace-asset-manager-initial-dark-en-390x520-20261017.png](workspace-asset-manager-initial-dark-en-390x520-20261017.png)                               |
| Vanilla tab receives initial focus, 1600 x 900        | [workspace-asset-manager-tabs-initial-focus-dark-en-1600x900-20261017.png](workspace-asset-manager-tabs-initial-focus-dark-en-1600x900-20261017.png)       |
| Arrow/Home/End select Mods, 1600 x 900                | [workspace-asset-manager-tabs-keyboard-dark-en-1600x900-20261017.png](workspace-asset-manager-tabs-keyboard-dark-en-1600x900-20261017.png)                 |
| ArrowLeft/Right select Mods, 390 x 520                | [workspace-asset-manager-tabs-keyboard-dark-en-390x520-20261017.png](workspace-asset-manager-tabs-keyboard-dark-en-390x520-20261017.png)                   |
| Escape returns focus to Tools, 1600 x 900             | [workspace-asset-manager-focus-return-to-tools-dark-en-1600x900-20261017.png](workspace-asset-manager-focus-return-to-tools-dark-en-1600x900-20261017.png) |

The initial captures show Vanilla selected with the Close button focused. The
updated dialog focuses the selected Vanilla tab, keeps only the selected tab
in the regular Tab sequence, and uses ArrowLeft/Right with wraparound plus
Home/End. At 390 x 520, selecting Mods by keyboard keeps its focus ring visible
inside the dialog; the dialog measures 374 x 504 px and the document has no
horizontal overflow. Escape closes Asset Manager, restores focus to Tools, and
leaves the saved two-block test project unchanged. The synthetic project has
no imported mods. Actual mod JAR inspection and failure recovery remain open
pending a trusted fixture.

## Asset Manager Mod help overlay

The Mods tab help control previously opened the tooltip on focus and toggled
it closed again on the same mouse click. The first click therefore only showed
focus; a second click was needed to read the help. The control now opens
idempotently and exposes its open state through `aria-expanded`, `aria-controls`,
and `aria-describedby`. Moving focus away closes the help. Escape closes only
the help overlay, keeps Asset Manager open, and leaves focus on its trigger.
Clicking outside the help also dismisses only that overlay. No mod JAR was
imported; the Mods list remains empty.

| Step / state                                            | Screenshot                                                                                                                                                 |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Editor before opening Tools                             | [workspace-overlay-01-editor-start-dark-en-1600x900-20261017.png](workspace-overlay-01-editor-start-dark-en-1600x900-20261017.png)                         |
| Tools menu                                              | [workspace-overlay-02-tools-menu-dark-en-1600x900-20261017.png](workspace-overlay-02-tools-menu-dark-en-1600x900-20261017.png)                             |
| Asset Manager, Vanilla tab                              | [workspace-overlay-03-asset-manager-vanilla-dark-en-1600x900-20261017.png](workspace-overlay-03-asset-manager-vanilla-dark-en-1600x900-20261017.png)       |
| Asset Manager, empty Mods tab                           | [workspace-overlay-04-asset-manager-mods-dark-en-1600x900-20261017.png](workspace-overlay-04-asset-manager-mods-dark-en-1600x900-20261017.png)             |
| Before fix: first click leaves help closed              | [workspace-overlay-05-help-click-no-popover-dark-en-1600x900-20261017.png](workspace-overlay-05-help-click-no-popover-dark-en-1600x900-20261017.png)       |
| Before fix: second click opens help                     | [workspace-overlay-06-help-open-after-second-click-dark-en-1600x900-20261017.png](workspace-overlay-06-help-open-after-second-click-dark-en-1600x900-20261017.png) |
| After fix: first click opens help                       | [workspace-overlay-07-help-open-first-click-dark-en-1600x900-20261017.png](workspace-overlay-07-help-open-first-click-dark-en-1600x900-20261017.png)         |
| Tab moves focus away and closes help                    | [workspace-overlay-08-help-dismissed-by-tab-dark-en-1600x900-20261017.png](workspace-overlay-08-help-dismissed-by-tab-dark-en-1600x900-20261017.png)       |
| Escape closes help and keeps Asset Manager open         | [workspace-overlay-09-help-dismissed-by-escape-dark-en-1600x900-20261017.png](workspace-overlay-09-help-dismissed-by-escape-dark-en-1600x900-20261017.png) |
| Outside click closes help and keeps Asset Manager open  | [workspace-overlay-10-help-dismissed-by-backdrop-dark-en-1600x900-20261017.png](workspace-overlay-10-help-dismissed-by-backdrop-dark-en-1600x900-20261017.png) |

## Select-only combobox focus and dismissal

The shared themed select previously left its popup open after Tab moved focus
to the next control. Escape also bubbled to the Settings document listener and
closed the entire Settings dialog. The select now gives its listbox and options
unique IDs, links the open combobox to the listbox and active option, and keeps
popup options out of the page Tab order. Arrow keys move the announced active
option; Enter or Space selects it; Escape dismisses only the popup. Moving focus
away closes the popup while allowing Tab to continue. Pointer selection keeps
focus on the combobox trigger. Settings and Oak Stairs Facing were checked in
Chrome; the Facing BlockState remained `north`. The active option focus ring
was checked for all four themes and both English and Vietnamese. Theme and
locale were restored to Dark/English after the matrix.

| Step / state                                                              | Screenshot                                                                                                                                                                |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before fix: Settings Language popup open                                  | [workspace-select-settings-escape-before-dark-en-1600x900-20261017.png](workspace-select-settings-escape-before-dark-en-1600x900-20261017.png)                             |
| Before fix: Escape closed Settings                                       | [workspace-select-settings-escape-after-dark-en-1600x900-20261017.png](workspace-select-settings-escape-after-dark-en-1600x900-20261017.png)                               |
| After fix: active Language option is exposed                              | [workspace-select-active-option-dark-en-1600x900-20261017.png](workspace-select-active-option-dark-en-1600x900-20261017.png)                                              |
| After fix: Tab closes popup and leaves Settings open                      | [workspace-select-dismissed-by-tab-dark-en-1600x900-20261017.png](workspace-select-dismissed-by-tab-dark-en-1600x900-20261017.png)                                        |
| After fix: Escape closes popup and leaves Settings open                   | [workspace-select-dismissed-by-escape-dark-en-1600x900-20261017.png](workspace-select-dismissed-by-escape-dark-en-1600x900-20261017.png)                                  |
| Oak Stairs Facing listbox with active option                              | [workspace-inspector-select-active-option-dark-en-1600x900-20261017.png](workspace-inspector-select-active-option-dark-en-1600x900-20261017.png)                           |
| Tab closes Facing popup and focuses the Half combobox                     | [workspace-inspector-select-tab-dark-en-1600x900-20261017.png](workspace-inspector-select-tab-dark-en-1600x900-20261017.png)                                               |
| Escape closes Facing popup and preserves `facing=north`                    | [workspace-inspector-select-escape-dark-en-1600x900-20261017.png](workspace-inspector-select-escape-dark-en-1600x900-20261017.png)                                         |

## Changes verified in this pass

- Resizing the viewport 1600→390→1600 kept saved sidebar preferences at
  260/230 px. The rendered columns narrowed temporarily and restored when the
  viewport grew.
- Settings opened on General; the Close button no longer receives initial
  focus or danger-red emphasis.
- Keyboard selection of Accessibility at 390×520 keeps the selected nav item
  visible and the dialog footer accessible.
- Cancel and Escape return focus to the owning menu trigger for Settings and
  Shortcuts Help; Escape was verified at 390×520 with a visible focus ring.
- Structure JSON parse and file-read failures appear as alerts and prevent
  Apply Import; a valid-file retry restores the preview, and Escape returns
  focus to File.
- Import JSON is the dialog's initial focus; ArrowLeft/Right and Home/End
  navigate the outer tabs while preserving a visible focus ring.
- Home and ArrowRight navigate the nested AI tabs; the focused tab scrolls into
  view at 390 x 520 with no document-level horizontal overflow.
- Diagnostics starts focus at its heading, uses a neutral close control, and
  labels its render interval as smoothed with idle time included.
- Diagnostics distinguishes missing and unresolved content errors from the
  current oak-fence behavior warning and trapped-chest unknown-behavior info;
  filtering announces the matching group and affected-block counts.
- Short Diagnostics lists fit their cards; larger lists keep independent
  scroll areas. Behavior coverage remains separate from placement validity.
- Asset Manager starts focus on Vanilla; Arrow/Home/End navigate between its
  Vanilla and Mods tabs with one tab stop.
- Settings Appearance tabs use one tab stop and support ArrowLeft/Right, Home,
  and End; Tab continues into the active panel. Focus was checked in all four
  themes and both locales.
- Application and Camera menus use one managed focus target, support Arrow
  navigation with wrapping plus Home/End, close on Tab focus-out, and restore
  focus to their trigger on Escape.
- Project Diagnostics and About both close on Escape and return visible focus
  to the Tools or Help trigger; no focus-return issue was found.
- Themed selects announce the active listbox option and keep popup options out
  of the page Tab sequence. Escape closes a select popup without closing its
  owning Settings dialog; Tab closes it and continues to the next control.
- The narrow Workspace drawer and the 780×437 shell fit without document-level
  horizontal overflow.

Before the file-read error fix, the Workspace suite passed with
`--isolate=false` (308 files passed, 7 skipped; 1,923 tests passed, 11 skipped),
along with production build, app/spec/worker TypeScript checks, tool tests (2/2),
encoding, Prettier, and `git diff --check`. The default worker-isolated full
suite run failed with Vitest worker timeouts and IPC errors; the successful run
disabled test isolation. The follow-up file-read and tab-navigation changes
passed two focused specs (19 tests total), production build, encoding check,
Prettier, and `git diff --check`. The nested AI mobile-focus follow-up passed
its focused component spec (4 tests), production build, encoding check,
Prettier, `git diff --check`, and a check that its 49 linked PNGs exist. Native
Tab entry and arrow navigation were both checked in Chrome at 390 x 520. The
Diagnostics focus and wording follow-up passed its focused component spec (8
tests), production build, encoding check, Prettier, `git diff --check`, and a
check that all 53 linked PNGs exist. Asset Manager tab navigation passed its
focused component spec (1 test), production build, encoding check, Prettier,
`git diff --check`, and a check that all 59 linked PNGs exist. Browser checks
verified initial Vanilla focus, Arrow/Home/End behavior, the 390 x 520 Mods
state without horizontal overflow, and Escape focus return to Tools. Workspace
acceptance remains in progress. Remaining checks cover trusted mod/JAR
fixtures, Asset Manager load and failure recovery, External AI, Diagnostics warning/error cases, all locales
and fonts, focus return for other dialogs, and remaining reduced-motion states. The non-empty
Structure JSON browser round trip is recorded above. Both non-empty NBT
export modes were decoded in this pass; manual loading in Minecraft remains
pending. The repository's independent Java 1.21.1 NBT fixture is covered by
codec contract tests. NBT import is not exposed in the Workspace File menu.

The latest Settings Appearance tab follow-up passed its focused component spec
(5 tests), production build, encoding check, Prettier check, and
`git diff --check`. Chrome verified arrow wrapping, Home/End, and Tab
progression; the focus ring and tab state were checked in all four themes and
both English and Vietnamese. The saved Dark/English preference was restored
afterward.

The shared menu keyboard follow-up passed the EditorChrome and EditorShell
focused specs (28 tests total), production build, Frontend encoding check,
Prettier, and `git diff --check`. Chrome checked menu entry and item movement,
wraparound, Home/End, Tab dismissal, Escape focus return for Help and Camera,
disabled action focus and non-activation, and the Diagnostics/About dialog
focus paths.

The reduced-motion follow-up passed the production build, Frontend encoding
check, and Prettier. Chrome verified that the Projects route's row transition
changes from 120 ms to 1 ms under reduced motion; the shared menu's enter
animation changes from 150 ms to 1 ms and its trigger transitions from 120 ms
to 1 ms. This covers representative Projects and Workspace elements; the full
animated-state and locale matrix remains open. All 247 distinct PNG captures
in this archive are linked to files in this folder (248 link occurrences, with
no missing targets or unlinked captures).

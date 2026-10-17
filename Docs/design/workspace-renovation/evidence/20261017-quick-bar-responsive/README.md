# Quick Bar narrow viewport access

The Quick Bar now scrolls horizontally at the existing narrow viewport
breakpoint so every populated slot remains reachable. At 390 × 844, a browser
scenario filled all ten slots with vanilla blocks, scrolled to the end, and
selected Cobblestone. The Status Bar updated to the selected block and stayed
within the viewport. Desktop retains the existing ten-slot row.

| State                                                      | Capture                                          |
| ---------------------------------------------------------- | ------------------------------------------------ |
| Before: later slots clipped at the initial scroll position | [Quick Bar before](quick-bar-390x844-before.png) |
| After: end of the row reached and slot 0 selected          | [Quick Bar after](quick-bar-390x844-after.png)   |

The browser reported a 390 px document width before and after. After the
horizontal scroll, the last slot was inside the visible row and its selection
updated the active block to `minecraft:cobblestone`.

# Vietnamese Status Bar Label at 320 px — 2026-10-18

This current-run review follows the Status Bar responsive work with a settled
asset-ready project in Raccoon Vietnamese at 320 × 740. Before the fix, the
asset-status text span measured 133 px inside an 89 px parent, so clipping hid
the beginning of “Tài nguyên sẵn sàng.” The span now shrinks to its parent and
uses the existing ellipsis treatment; the visible label starts with “Tài
nguyên …” while the full live-region text stays available.

The check was repeated by selecting each of the four themes and both locales in
the Project Screen. In all eight combinations, the text span stayed within its
status container and the document remained 320 px wide. The temporary project
was created in an isolated browser profile and did not use user project data.

## Captures

- [Before: Raccoon Vietnamese at 320 × 740](before-320-raccoon-vi.png)
- [After: Raccoon Vietnamese at 320 × 740](after-320-raccoon-vi.png)

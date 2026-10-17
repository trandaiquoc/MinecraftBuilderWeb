# Documentation Map

This directory separates current product contracts, active design acceptance,
historical evidence, and reproducible local audit output.

## Current source of truth

- [Design foundation](design-foundation-branding.md) — brand, approved visual
  direction, references, and implementation boundaries.
- [Workspace color palette](design/workspace-color-palette.md) — canonical
  four-theme Workspace tokens and accessibility contract.
- [Workspace renovation status](design/workspace-renovation/README.md) and
  [active acceptance inventory](design/workspace-renovation/WORKSPACE-UI-ACCEPTANCE-INVENTORY.md)
  — current status and only unresolved visual acceptance gaps.
- [Homepage and Project Screen status](design/homepage-renovation/README.md) —
  implemented local controls, approved concept scope, and visual acceptance.
- [Requirements baseline](MinecraftBuilder_Requirements_VI.docx) — version 0.2
  local-first MVP requirements; this is intended scope, not implementation
  status.
- [Minecraft assets](minecraft-assets.md) — asset sources, cache policy,
  provider boundaries, supported formats, and audit procedure.
- [Verified vanilla behavior](vanilla-behavior-golden-1.21.1.md) — Java 1.21.1
  behavior matrix and editor-policy deviations.
- [Structure NBT contract](minecraft-structure-nbt-1.21.1.md) — exporter,
  entities, and datapack packaging.
- [Structure JSON contract](structure-json.md) — public shape, validation,
  and import semantics.
- [Renderer baseline](renderer-baseline.md) — viewport lifecycle, diagnostics,
  and benchmark contract.

## Historical records

- [Original prompt roadmap](MinecraftBuilder_Codex_Gemini_Prompt_Roadmap_VI.docx)
  is retained as planning history. Its old prompts are not an active task list.
- [Change history](history/changed.md) is a chronological decision log. Its
  status markers are historical snapshots, not current tasks; present facts and
  open work belong in the canonical documents above.
- [Workspace visual QA snapshot](history/workspace-design-qa-2026-10-16.md)
  records a dated, superseded assessment. It does not define current status.
- [Workspace browser evidence](design/workspace-renovation/evidence/README.md)
  is historical and does not establish visual acceptance for changes after
  commit ed7b1a5.

## Generated and local-only output

Vanilla coverage reports are reproducible audit output under the ignored local
directory .artifacts/vanilla-asset-coverage/. Temporary audit specs are
created under .artifacts/vanilla-asset-audit/ and removed by the command.
They are not canonical source or documentation.

Only fixtures that provide independent compatibility evidence or protect a
contract that cannot be regenerated from the code under test are tracked.
Exporter smoke tests generate their NBT/ZIP bytes at test time.

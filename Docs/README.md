# Documentation Map

This directory separates current contracts from history, generated audit output,
and product planning.

## Current source of truth

- `MinecraftBuilder_Requirements_VI.docx` — product and technical requirement
  baseline for the local-first MVP. It defines intended scope; it does not
  replace the more specific current technical contracts below.
- `minecraft-assets.md` — asset sources, versioned cache policy, provider
  boundaries, supported resource formats, and audit procedure.
- `vanilla-behavior-golden-1.21.1.md` — verified Java 1.21.1 behavior matrix
  and editor-policy deviations for supported block families.
- `minecraft-structure-nbt-1.21.1.md` — Structure NBT, exporter, semantic
  entity, and datapack packaging contract.
- `structure-json.md` — public Structure JSON shape, validation, and import
  semantics.
- `renderer-baseline.md` — retained viewport lifecycle, diagnostics, and
  benchmark contract.

## Planning and history

- `MinecraftBuilder_Codex_Gemini_Prompt_Roadmap_VI.docx` is the original prompt
  roadmap. It is retained as planning history, not as a claim that every old
  prompt or checklist still describes the current implementation.
- `history/changed.md` is the chronological decision log. It is useful for
  historical context only; current facts must be updated in the canonical
  document responsible for them.

## Generated and local-only output

Vanilla coverage reports are reproducible audit output. The audit command writes
them to the ignored local directory:

```text
.artifacts/vanilla-asset-coverage/
```

Temporary audit specs are created under `.artifacts/vanilla-asset-audit/` and
are removed when the command finishes. They are not part of `src/` or canonical
documentation.

The repository keeps only fixtures that provide independent compatibility
evidence or protect a contract that cannot be regenerated from the code under
test. Exporter smoke tests generate their own NBT/ZIP bytes at test runtime;
their generated binaries are intentionally not tracked.

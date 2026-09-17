# AGENTS.md

Repository-level instructions for AI coding agents working on **MinecraftBuilder**.

These rules apply to the entire repository unless a more specific `AGENTS.md` exists in the target directory.

## 1. Instruction Priority

Before making any change:

1. Read this repository-level `AGENTS.md`.
2. Check whether the target directory contains a more specific `AGENTS.md`.
3. Read the relevant project documentation under `Docs/`.
4. Inspect the existing code related to the requested task.
5. Follow the user's current request exactly.

If instructions conflict or are ambiguous, stop and report the conflict before editing files.

Do not continue into another roadmap phase unless the user explicitly requests it.

## 2. Project Scope

Product name:

`MinecraftBuilder`

Repository name:

`MinecraftBuilderWeb`

Main repository areas:

- `Frontend/` — Angular web application.
- `Backend/` — backend area. Do not initialize or implement backend unless the user explicitly requests backend work.
- `Docs/` — requirements, roadmap, research notes, and technical documentation.

Do not invent features that are not present in the requirements.

Do not implement post-MVP functionality while working on an MVP task unless the user explicitly asks for it.

## 3. Source of Truth

Use the following order when determining intended behavior:

1. Current user request.
2. Applicable `AGENTS.md` files.
3. Project documentation under `Docs/`.
4. Established behavior in the current repository.
5. Official framework/platform documentation.
6. Verified Minecraft reference data or test fixtures.

Do not silently replace documented project behavior with generic best practices.

If an external format, framework behavior, or Minecraft behavior is uncertain, stop and verify authoritative documentation or a trusted fixture before implementing it.

## 4. Mandatory Working Method

Before modifying unfamiliar code:

1. Inspect the relevant files and surrounding implementation.
2. Identify the data flow affected by the task.
3. Identify the smallest set of files that actually needs modification.
4. Reuse existing project utilities before creating new abstractions.
5. Make the smallest coherent change that completes the task.
6. Run the relevant build, tests, type checks, or validation after meaningful changes.
7. Report what changed and any unresolved issues.

Do not modify unrelated code.

Do not perform broad refactors while implementing an unrelated feature.

Do not introduce a new framework, state-management system, architectural layer, or infrastructure dependency unless:
- the repository already uses it for the relevant purpose, or
- the task explicitly requires it.

For a new area where no established pattern exists, prefer a simple implementation consistent with the documented project architecture.

## 5. Change Discipline

Do not:

- rename unrelated files;
- reorganize unrelated folders;
- replace working architecture without a requirement;
- add speculative abstractions;
- add dependencies that are not needed;
- commit generated build/cache files;
- remove user-authored documentation without permission;
- silently change public JSON, project-file, NBT, or API contracts.

When a task can be completed with existing platform/library capabilities, do not add another dependency unnecessarily.

## 6. Dependency Rules

Before adding a dependency:

1. Check whether the project already has a suitable solution.
2. Confirm the dependency is actively maintained.
3. Confirm compatibility with the project's actual framework/runtime versions.
4. Explain why the dependency is needed.
5. Prefer a focused library over a large framework for a small utility problem.

Do not replace an existing dependency merely because another library is more popular.

When an important dependency has not yet been approved, stop and ask before adding it.

## 7. Coding Rules

### Naming

- Use intention-revealing and searchable names.
- Use one consistent term for one concept.
- Follow language and framework conventions.
- Avoid vague names such as `Manager`, `Data`, `Info`, or `Helper` when a more precise responsibility can be named.
- Avoid unexplained magic values.

### Functions and Methods

- Keep functions focused on one coherent responsibility.
- Prefer clear and minimal parameters.
- Avoid boolean flags that make one function perform unrelated behaviors.
- Prefer early returns when they reduce nesting.
- Keep transformations pure when practical.
- Avoid duplicated domain logic when a shared concept genuinely exists.
- Do not introduce patterns or abstractions solely to satisfy a style rule.

### Comments

- Prefer self-explanatory code, types, and tests.
- Comment non-obvious intent, compatibility constraints, external-format behavior, or important trade-offs.
- Keep comments accurate and local.
- Do not keep commented-out code.
- Keep TODOs specific and actionable.

### Formatting

- Follow `.editorconfig`, formatter configuration, and existing repository conventions.
- Do not reformat unrelated files.
- Keep related logic close together.

## 8. Error Handling

- Do not suppress failures silently.
- Use exceptions for exceptional failures, not normal control flow.
- Catch errors only when useful recovery, translation, additional context, safe cleanup, or user feedback is possible.
- Preserve original error information when wrapping failures.
- Failure handling must not leave project data in an inconsistent state.
- File import errors must produce clear validation results instead of silently corrupting project data.

## 9. Security

Never commit:

- passwords;
- database credentials;
- API keys;
- access tokens;
- private keys;
- production secrets.

Do not log reusable secrets, authorization headers, passwords, or tokens.

Treat all external input as untrusted, including:

- imported JSON;
- mod `.jar` files;
- `.zip` files;
- NBT files;
- filenames;
- project files;
- future HTTP/API input.

Validate external input before using it.

Do not execute code extracted from uploaded mod JARs in the browser or server merely to inspect resources.

## 10. Minecraft-Specific Rules

Do not guess version-specific Minecraft behavior.

MinecraftBuilder currently targets Minecraft Java **1.21.1** unless project documentation says otherwise.

When implementing or modifying support for any of the following, verify against reference data, official/authoritative documentation, or real fixtures when needed:

- registry IDs;
- BlockState values;
- blockstate JSON;
- model JSON;
- model parent inheritance;
- texture references;
- multipart/variant behavior;
- stair/fence/wall/pane connections;
- placement/support rules;
- multi-block blocks;
- structure NBT;
- block entity NBT;
- mod JAR resource layout;
- version-specific DataVersion behavior.

Never silently replace an unknown or missing modded block with `minecraft:air`.

Preserve unknown registry IDs and known state data whenever the project format supports doing so.

## 11. Research and Stop Checkpoints

When a roadmap prompt requires external research, configuration, reference assets, or golden fixtures:

1. Complete only the requested code/task up to that checkpoint.
2. Stop.
3. State what was completed.
4. State why work must pause.
5. State exactly what documentation, asset, fixture, credential, or configuration is needed next.

Examples of valid stop checkpoints:

- Minecraft 1.21.1 vanilla assets are required.
- A real mod JAR fixture is required.
- A known-good Minecraft structure NBT fixture is required.
- Exact Minecraft neighbor behavior must be verified.
- A third-party library must be selected and approved.
- Backend credentials or infrastructure configuration are required.

Do not invent missing reference data to keep coding.

## 12. Testing and Verification

After meaningful changes:

- run the relevant build;
- run relevant automated tests when present;
- run type checking/compiler validation;
- verify affected workflows;
- report failures instead of hiding them.

Do not claim a feature works if it has not been verified.

For Minecraft compatibility, distinguish clearly between:

- code-level/unit tests;
- fixture tests;
- browser/editor verification;
- verification inside Minecraft.

## 13. Documentation

Update documentation when a change affects:

- public JSON schemas;
- project file formats;
- supported Minecraft behavior;
- setup requirements;
- required dependencies;
- public APIs;
- user-visible keyboard controls or workflows.

Do not fill README files with speculative technologies that are not actually used by the repository.

## 14. Final Response After a Coding Task

When finishing a task, report concisely:

1. files changed;
2. behavior implemented or fixed;
3. validation/build/tests run;
4. known limitations;
5. whether a research/configuration checkpoint has been reached.

Do not automatically start the next roadmap task.

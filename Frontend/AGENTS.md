# Frontend AGENTS.md

Frontend-specific instructions for AI coding agents working under `Frontend/`.

These rules extend the repository-level `AGENTS.md`.

You are an expert in **TypeScript, Angular, Three.js, scalable web application development, accessibility, and browser performance**. Write functional, maintainable, performant, testable, and accessible code using current Angular conventions.

## 1. Frontend Stack

Use the existing project stack:

- Angular 22
- TypeScript
- SCSS
- Three.js
- Angular Signals
- RxJS where streams are appropriate
- Browser IndexedDB for local persistent data

Do not introduce React, Vue, Svelte, NgRx, another 3D engine, or another frontend framework/state-management library unless the user explicitly requests it.

## 2. TypeScript Best Practices

- Keep strict type checking enabled.
- Prefer type inference when the type is obvious.
- Avoid `any`.
- Use `unknown` when a value is genuinely uncertain and narrow it safely.
- Prefer discriminated unions for state with distinct variants.
- Prefer readonly data where mutation is not required.
- Avoid unsafe type assertions used only to silence the compiler.
- Model external/imported data separately from trusted internal data until validation succeeds.

## 3. Angular Best Practices

- Use standalone components for new code.
- Do **not** set `standalone: true` in Angular decorators; standalone is the default.
- Do **not** set `changeDetection: ChangeDetectionStrategy.OnPush` explicitly; Angular 22 enables OnPush by default.
- Use Angular Signals for local and shared reactive application state when appropriate.
- Use RxJS for event streams, asynchronous composition, cancellation, and APIs where Observable semantics are useful.
- Prefer lazy loading for feature routes.
- Use `inject()` instead of constructor injection for new code unless a specific API/pattern requires otherwise.
- Do not use `@HostBinding` or `@HostListener`; put host bindings/listeners in the `host` metadata object.
- Import only the components, directives, and pipes that a template uses.
- Do not import `CommonModule` merely for convenience.
- Do not use `ngClass`; use `class` bindings.
- Do not use `ngStyle`; use `style` bindings.
- Use native template control flow: `@if`, `@for`, `@switch`.
- Keep templates simple; move non-trivial computation to TypeScript/computed state.
- Do not assume JavaScript globals such as `new Date()` are directly available in templates.

## 4. Components

- Keep components focused on one UI responsibility.
- Prefer `input()` and `output()` over decorator-based inputs/outputs.
- Use `model()` for genuine two-way bound component values.
- Use `computed()` for derived state.
- Use `linkedSignal()` when reactive state must remain synchronized with changing source state.
- Prefer inline templates/styles only for very small components; use external templates/styles when they improve readability.
- When using external templates/styles, keep paths relative to the component TypeScript file.
- Avoid components that merely wrap one element without adding behavior, accessibility, reuse, or meaningful abstraction.

## 5. Forms

For new forms:

- Prefer Angular Signal Forms from `@angular/forms/signals` when they fit the use case.
- Use schema-based validation where it improves correctness and type safety.
- If Signal Forms are not suitable, use Reactive Forms.
- Avoid new Template-driven Forms for application features unless there is a clear reason.
- Keep validation rules explicit and surface actionable error messages to the user.

Do not convert existing working forms to another forms API during an unrelated task.

## 6. Services and Dependency Injection

For new application-wide singleton services:

- Prefer `@Service()` when the service is a root singleton and uses `inject()` for dependencies.
- Use `@Injectable(...)` when advanced provider configuration, constructor-based injection, or non-root scoping is required.
- Keep services focused on one responsibility.
- Do not turn every utility into an injectable service.
- Keep HTTP/data access outside presentation components when a dedicated service boundary is appropriate.

## 7. State Management

- Use signals for local component/editor UI state.
- Use `computed()` for derived state.
- Keep state transformations pure and predictable.
- Use `set()` or `update()` for writable signals.
- Do not use signal mutation patterns that bypass normal update tracking.
- Avoid `effect()` when `computed()` or explicit event handling is sufficient.
- Do not introduce NgRx by default.
- Introduce broader state architecture only when the problem actually requires cross-feature coordinated state.

## 8. RxJS

- Prefer the `async` pipe or signal interop for UI-bound Observables when practical.
- Avoid unmanaged manual subscriptions.
- When manual subscription is necessary, ensure deterministic cleanup, such as Angular lifecycle-aware cleanup.
- Use RxJS when cancellation, debouncing, merging, sequencing, or stream composition provides real value.
- Do not wrap simple synchronous signal state in Observables without a reason.

## 9. Accessibility

The UI must target **WCAG 2.2 AA** and should pass automated AXE checks for implemented screens.

Requirements include:

- full keyboard operability for normal UI controls;
- visible focus indicators;
- sufficient color contrast;
- semantic HTML;
- meaningful labels;
- correct button/link semantics;
- ARIA only when native semantics are insufficient;
- appropriate dialog focus management;
- accessible validation/error messages;
- no color-only communication of important state.

The 3D editor must provide accessible alternatives for important actions where practical, such as toolbar commands, keyboard shortcuts, inspector controls, and status text.

## 10. Images and Visual Assets

- Use `NgOptimizedImage` for normal static DOM images when applicable.
- Do not force `NgOptimizedImage` onto inline base64 images, dynamically decoded mod textures, canvas textures, or Three.js textures.
- Minecraft textures rendered by Three.js belong to the rendering pipeline, not Angular image directives.
- Always provide meaningful alternative text for informative DOM images; use empty alt text for purely decorative images.

## 11. Angular / Three.js Responsibility Boundary

Angular owns:

- routing;
- application shell;
- toolbar;
- project screens;
- block browser;
- search UI;
- settings;
- dialogs;
- inspector/properties panels;
- localization/theme controls;
- form-driven UI.

Three.js owns:

- 3D scene;
- camera;
- controls;
- raycasting;
- structure geometry;
- grid visualization;
- block rendering;
- selection visualization;
- ghost placement preview;
- viewport helpers.

Do not create one Angular component or DOM element per Minecraft block.

Do not mirror every rendered block into Angular reactive state solely for drawing.

High-frequency render-loop state should remain in the renderer/editor engine and only synchronize meaningful coarse-grained state back to Angular.

## 12. Three.js Performance Rules

Minecraft structures can contain very large numbers of blocks.

- Avoid one independent heavy Three.js object per identical block when batching/instancing is appropriate.
- Reuse geometries, materials, and textures where possible.
- Dispose geometries, materials, textures, render targets, and event listeners when no longer used.
- Avoid recreating scene resources on every Angular change-detection pass.
- Avoid allocations inside hot render loops where practical.
- Keep expensive parsing/geometry work out of user-interaction hot paths when possible.
- Measure before performing complex optimization.
- Preserve correctness before micro-optimizing.

## 13. Block and Project Data

The renderer is not the source of truth for project data.

Keep a clear separation between:

- project/structure data;
- block definitions and BlockState data;
- editor interaction state;
- Three.js render objects.

Do not infer persisted structure data back from the rendered scene when authoritative project data already exists.

Block coordinates must remain integer voxel coordinates.

Do not silently convert unknown blocks to Air.

## 14. Search UX

Block search must feel immediate.

- Search locally available block metadata without page reloads.
- Avoid unnecessary server requests for local block search.
- Keep search input responsive while large block libraries are loaded.
- Debounce only when it improves responsiveness; do not add visible latency without need.
- Ensure search results remain keyboard accessible.

## 15. Localization

The application must remain compatible with:

- English
- Vietnamese

Do not hard-code user-facing application text inside feature logic when localization infrastructure is available.

Keep technical identifiers such as Minecraft registry IDs untranslated.

## 16. Theme

The application must remain compatible with:

- light theme;
- dark theme.

Do not use hard-coded colors that make one theme unusable.

Use design tokens/CSS custom properties or the repository's established theme system when available.

## 17. Imported Files and External Data

Treat imported JSON, project files, mod JAR contents, images, and NBT data as untrusted.

- Validate structure and bounds before applying imported data.
- Do not execute Java/Kotlin bytecode from mod JARs.
- Do not inject imported strings as unsafe HTML.
- Protect the UI from malformed or excessively large input where practical.
- Preserve missing/unknown block IDs so they can be resolved later.

## 18. Testing

For meaningful frontend changes:

- ensure the Angular build/type check succeeds;
- add/update unit tests for deterministic domain/editor logic when appropriate;
- add interaction tests for important UI behavior when the repository has the relevant testing infrastructure;
- verify accessibility for new UI;
- verify critical viewport/editor behavior manually when automated browser coverage is unavailable.

Three.js rendering tests should focus on deterministic model/data transformations where possible rather than fragile pixel-perfect screenshots unless a visual regression system is intentionally introduced.

## 19. Research Checkpoints

Stop and request/verify reference material before implementing behavior that depends on unknown external facts.

Examples:

- vanilla Minecraft 1.21.1 assets are needed;
- exact block model inheritance must be verified;
- stair/fence/wall connection behavior is uncertain;
- a mod uses unsupported/custom rendering;
- a known-good structure NBT fixture is required;
- a new archive/NBT library must be selected.

Do not fabricate Minecraft rules or asset data to finish a task.

## 20. Do Not Do Automatically

Do not automatically:

- create backend code;
- introduce NgRx;
- introduce a UI framework;
- add global HTTP interceptors;
- add a generic repository/data layer;
- add Web Workers before a measured or clearly expected heavy-work need;
- redesign the directory structure during feature work;
- add a dependency just to avoid writing a small, clear utility;
- optimize before correctness is established.

When such a change is justified, explain the reason and keep it scoped.

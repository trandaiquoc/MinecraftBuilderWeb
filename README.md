# MinecraftBuilder

[English](README.md) | [Tiếng Việt](README.vi.md)

MinecraftBuilder is a web-based editor for creating, viewing, editing, importing, and exporting Minecraft Java structures.

The project is designed around a local-first visual workflow that combines 3D
editing with Y-layer editing, Minecraft block-state handling, resource-backed
mod block support, decorations, JSON structure import, and Java Structure NBT
export.

## Main Capabilities

- Create and manage Minecraft structure projects.
- Edit structures in a 3D viewport.
- Edit structures by Y layer using an X/Z grid.
- Search and place Minecraft blocks.
- Rotate blocks and edit supported `BlockState` values.
- Render non-cube block shapes such as stairs, slabs, fences, panes, signs, doors, trapdoors, and similar blocks.
- Edit supported decorations and semantic block entities such as signs,
  containers, decorated pots, paintings, and item frames.
- Import resource-only Fabric mod `.jar` files locally when supported. Mod code
  is never executed or uploaded.
- Import structures from JSON.
- Export structures as Minecraft Java `.nbt` files.
- Preserve unknown or missing mod block IDs instead of silently replacing them.
- Support English and Vietnamese interfaces.
- Support Minecraft, Light, and Dark themes.

## Technology Stack

### Frontend

- **Angular 22**
- **TypeScript**
- **SCSS**
- **Three.js**
- **Angular CDK** for focused overlay and dialog behavior.
- **fflate** and **nbtify** for browser-local ZIP and NBT processing.

Angular is responsible for the application UI, forms, project screens, block browser, inspectors, settings, and editor controls.

Three.js is responsible for the 3D viewport, camera, grid, raycasting, block rendering, selection, placement preview, and structure visualization.

### Client Storage

- **IndexedDB**

Local project data and imported block metadata can be stored in the browser.

Additional browser storage APIs or helper libraries may be introduced only when required by implementation needs.

### Minecraft File Processing

The application will use dedicated libraries for:

- Reading `.jar` / `.zip` archives.
- Reading and writing Minecraft NBT data.
- Validating imported JSON structures.

The current implementation uses `fflate` for datapack ZIP packaging and
`nbtify` behind the typed NBT codec boundary.

### Backend (future scope)

Planned backend stack:

- **ASP.NET Core Web API**
- **C#**
- **.NET 10 LTS**
- **Entity Framework Core**
- **PostgreSQL**

The repository is currently local-first and does not require a running backend.
The future backend is intended to support user accounts, cloud projects,
permissions, administration, subscription-related limits, and shared project
data.

Large binary files and assets should be stored outside the relational database using object/file storage when needed.

## Repository Structure

```text
MinecraftBuilderWeb/
├── Docs/
├── Frontend/
└── Backend/
```

- `Docs/` — project requirements and technical documentation.
- `Frontend/` — Angular application.
- `Backend/` — reserved for future backend work; it is not required by the
  current frontend.

## Requirements

### Frontend Development

Install:

- **Node.js 24**
- **npm**
- **Git**

Recommended:

- Visual Studio Code or another IDE with Angular/TypeScript support.
- A modern Chromium-based browser for development and testing.

### Backend Development (future scope)

Install:

- **.NET 10 SDK**
- **PostgreSQL**
- **Git**

Recommended:

- Visual Studio, JetBrains Rider, or Visual Studio Code with C# tooling.

## Running the Frontend

```bash
cd Frontend
npm install
npm start
```

Then open:

```text
http://localhost:4200
```

## Documentation

Current contracts and policies are stored under:

```text
Docs/
```

See [`Docs/README.md`](Docs/README.md) for the source-of-truth map and
generated-artifact policy.

## Project Name

- Product: **MinecraftBuilder**
- Repository: **MinecraftBuilderWeb**

# MinecraftBuilder

[English](README.md) | [Tiếng Việt](README.vi.md)

MinecraftBuilder is a web-based editor for creating, viewing, editing, importing, and exporting Minecraft Java structures.

The project is designed around a visual workflow that combines 3D editing with Y-layer editing, Minecraft block state handling, mod block support, JSON structure import, and Java Structure NBT export.

## Main Capabilities

- Create and manage Minecraft structure projects.
- Edit structures in a 3D viewport.
- Edit structures by Y layer using an X/Z grid.
- Search and place Minecraft blocks.
- Rotate blocks and edit supported `BlockState` values.
- Render non-cube block shapes such as stairs, slabs, fences, panes, signs, doors, trapdoors, and similar blocks.
- Import block resources from Minecraft mod `.jar` files when supported.
- Import structures from JSON.
- Export structures as Minecraft Java `.nbt` files.
- Preserve unknown or missing mod block IDs instead of silently replacing them.
- Support English and Vietnamese interfaces.
- Support light and dark themes.

## Technology Stack

### Frontend

- **Angular**
- **TypeScript**
- **SCSS**
- **Three.js**

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

Specific libraries may change as implementation progresses.

### Backend

Planned backend stack:

- **ASP.NET Core Web API**
- **C#**
- **.NET 10 LTS**
- **Entity Framework Core**
- **PostgreSQL**

The backend is intended to support features such as user accounts, cloud projects, permissions, administration, subscription-related limits, and shared project data.

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
- `Backend/` — ASP.NET Core backend.

## Requirements

### Frontend Development

Install:

- **Node.js 24**
- **npm**
- **Git**

Recommended:

- Visual Studio Code or another IDE with Angular/TypeScript support.
- A modern Chromium-based browser for development and testing.

### Backend Development

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

Project requirements are stored under:

```text
Docs/
```

## Project Name

- Product: **MinecraftBuilder**
- Repository: **MinecraftBuilderWeb**

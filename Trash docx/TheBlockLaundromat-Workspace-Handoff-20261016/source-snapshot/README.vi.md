# The Block Laundromat

[English](README.md) | [Tiếng Việt](README.vi.md)

The Block Laundromat là ứng dụng web để tạo, xem, chỉnh sửa, import và export
structure Minecraft Java trực tiếp trên trình duyệt.

Hệ thống hướng tới quy trình làm việc trực quan, local-first, kết hợp chỉnh
sửa 3D, chỉnh sửa theo từng Y-layer, quản lý Minecraft BlockState, hỗ trợ
resource của block từ mod, decoration, import structure bằng JSON và export
sang Minecraft Java Structure NBT.

## Chức năng chính

- Tạo và quản lý project structure Minecraft.
- Chỉnh sửa structure trong không gian 3D.
- Chỉnh sửa theo từng Y-layer bằng grid X/Z.
- Tìm kiếm và đặt block Minecraft.
- Xoay block và chỉnh các giá trị `BlockState` được hỗ trợ.
- Render các block không phải full cube như stair, slab, fence, pane, sign, door, trapdoor và các block tương tự.
- Import resource block từ file mod Minecraft `.jar` khi có thể hỗ trợ.
- Chỉnh sửa decoration và block entity được hỗ trợ như sign, container,
  decorated pot, painting và item frame.
- Import structure từ JSON.
- Export structure thành file Minecraft Java `.nbt`.
- Giữ lại registry ID của block mod bị thiếu hoặc chưa hỗ trợ thay vì tự đổi thành Air.
- Hỗ trợ giao diện tiếng Anh và tiếng Việt.
- Hỗ trợ giao diện Minecraft, Light và Dark.

## Công nghệ sử dụng

### Frontend

- **Angular 22**
- **TypeScript**
- **SCSS**
- **Three.js**
- **Angular CDK** cho overlay và dialog cần thiết.
- **fflate** để tạo datapack ZIP và **nbtify** phía sau codec NBT có kiểu dữ liệu
  rõ ràng.

Angular chịu trách nhiệm cho giao diện ứng dụng, form, màn hình project, block browser, inspector, settings và các control của editor.

Three.js chịu trách nhiệm cho viewport 3D, camera, grid, raycasting, render block, selection, preview vị trí đặt block và hiển thị structure.

### Lưu trữ phía trình duyệt

- **IndexedDB**

Dữ liệu project local và metadata của block đã import có thể được lưu trực tiếp trong trình duyệt.

Các API lưu trữ hoặc thư viện hỗ trợ khác chỉ được bổ sung khi implementation thực sự cần.

### Xử lý file Minecraft

Implementation hiện đọc archive `.jar` / `.zip` do người dùng chọn bằng
`ZipArchive` của ứng dụng và `DecompressionStream` có sẵn trong trình duyệt.
Datapack ZIP đầu ra dùng `fflate`. Minecraft NBT được đọc/ghi qua `nbtify` phía
sau codec có kiểu dữ liệu rõ ràng. Structure JSON dùng parser và validation
workflow của ứng dụng, đồng thời có JSON Schema công khai cho format canonical.

### Backend (phạm vi tương lai)

Stack backend dự kiến:

- **ASP.NET Core Web API**
- **C#**
- **.NET 10 LTS**
- **Entity Framework Core**
- **PostgreSQL**

Repository hiện chạy local-first và không cần backend đang hoạt động. Backend
tương lai sẽ phục vụ tài khoản, project trên cloud, phân quyền, quản trị, giới
hạn theo gói sử dụng và dữ liệu chia sẻ giữa các thiết bị.

Các file binary hoặc asset lớn nên được lưu bằng object/file storage khi cần, thay vì lưu trực tiếp trong database quan hệ.

## Cấu trúc repository

```text
TheBlockLaundromat/
├── Docs/
└── Frontend/
```

- `Docs/` — requirement và tài liệu kỹ thuật của project.
- `Frontend/` — ứng dụng Angular.

Backend là phạm vi dự kiến trong tương lai và hiện chưa có implementation được
Git theo dõi; thư mục `Backend/` rỗng có thể tồn tại trên máy lập trình viên
nhưng sẽ không xuất hiện trong clone mới.

## Yêu cầu môi trường

### Phát triển Frontend

Cần cài:

- **Node.js 22** (từ 22.22.3 trong nhánh 22.x), **Node.js 24** (từ 24.15.0 trong nhánh 24.x) hoặc **Node.js 26.0.0 trở lên** (các nhánh được Angular 22.2.2 hỗ trợ)
- **npm**
- **Git**

Khuyến nghị:

- Visual Studio Code hoặc IDE có hỗ trợ Angular/TypeScript.
- Trình duyệt Chromium hiện đại để phát triển và kiểm thử.

### Phát triển Backend (phạm vi tương lai)

Cần cài:

- **.NET 10 SDK**
- **PostgreSQL**
- **Git**

Khuyến nghị:

- Visual Studio, JetBrains Rider hoặc Visual Studio Code với bộ công cụ C#.

## Chạy Frontend

```bash
cd Frontend
npm install
npm start
```

Sau đó mở:

```text
http://localhost:4200
```

## Tài liệu

Contract hiện tại và policy của project nằm trong:

```text
Docs/
```

Xem [`Docs/README.md`](Docs/README.md) để biết tài liệu nào là nguồn chuẩn và
quy tắc artifact sinh tự động.

## Tên project

- Tên sản phẩm: **The Block Laundromat**
- Tên Angular project: `TheBlockLaundromat`
- Tên npm package: `the-block-laundromat`
- Repository GitHub: [`trandaiquoc/TheBlockLaundromat`](https://github.com/trandaiquoc/TheBlockLaundromat)
- Thư mục local: `TheBlockLaundromat`

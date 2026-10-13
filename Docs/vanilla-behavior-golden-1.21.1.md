# The Block Laundromat — Vanilla Behavior Golden Matrix (Minecraft Java 1.21.1)

> Mục đích: ghi lại các kỳ vọng behavior vanilla Java 1.21.1 đã được xác minh/ghi nhận để đối chiếu với rule engine và regression tests. Các xác nhận manual trong tài liệu là evidence lịch sử được ghi lại tại thời điểm kiểm thử; chúng chưa được chạy lại trong môi trường hiện tại.
>
> Phạm vi: các behavior vanilla đại diện, không phải mô phỏng toàn bộ Minecraft physics. Golden Minecraft facts và implementation The Block Laundromat là hai lớp evidence riêng: bảng này không chứng minh runtime hiện tại đã đạt parity. Với modded behavior cần Java runtime mà chưa có rule xác minh, giữ `Unknown` / `Partial`.

---

## 1. Nguyên tắc sử dụng

- File này là **reference cho kỳ vọng Vanilla**, không phải mô tả hiện trạng implementation.
- Rule engine phải ưu tiên behavior đã xác minh ở đây thay vì suy đoán từ tên registry ID.
- Asset JSON chỉ mô tả model/state mapping; một số runtime behavior như wall shape, stairs shape, support và multi-block synchronization cần rule riêng.
- Nếu implementation hiện tại khác golden behavior, ghi mismatch và quyết định
  rõ đó là defect hay policy sản phẩm có chủ đích. Chỉ thay implementation khi
  yêu cầu parity được xác nhận; không đổi golden fact để khớp code.
- Không áp vanilla rule cho modded block chỉ dựa vào tên như `*_fence`, `*_stairs`, `*_door`.
- Unknown mod behavior phải giữ nguyên registry ID / BlockState và trả `Unknown` hoặc `Partial`.

---

# 2. Fence

## Golden cases

| Case                                     | Expected                          |
| ---------------------------------------- | --------------------------------- |
| `oak_fence` + `oak_fence`                | Connect                           |
| `oak_fence` + `spruce_fence`             | Connect                           |
| `oak_fence` + `nether_brick_fence`       | **Do not connect**                |
| `oak_fence` + full solid block như Stone | Connect                           |
| Xóa neighbor đã connect                  | Connection tương ứng trở về false |

## State liên quan

- `north`
- `east`
- `south`
- `west`

## Rule notes

- Fence compatibility không thể đơn giản là “fence gặp fence thì connect”.
- Wooden fence và Nether Brick Fence là case incompatibility phải được regression-test.
- Place/delete neighbor phải refresh fence state của các block bị ảnh hưởng.

## Required regression tests

- wood fence ↔ wood fence
- wood fence ↔ different wood fence
- wood fence ↔ nether brick fence = false
- fence ↔ solid block
- delete neighbor refresh

---

# 3. Wall

Representative block: `minecraft:cobblestone_wall`

## Golden cases

| Case                                          | east | north | south | west | up        |
| --------------------------------------------- | ---- | ----- | ----- | ---- | --------- |
| Wall đứng riêng                               | none | none  | none  | none | **true**  |
| Hai wall nối một hướng                        | none | low   | none  | none | **true**  |
| Góc 90°                                       | none | none  | low   | low  | **true**  |
| Chữ T                                         | none | low   | low   | low  | **true**  |
| Dấu `+`                                       | low  | low   | low   | low  | **false** |
| Dấu `+` + Stone ngay phía trên wall trung tâm | tall | tall  | tall  | tall | **false** |

> Hướng trong bảng phản ánh các case manual đã test; implementation nên test tương đương theo rotation thay vì hard-code orientation cụ thể.

## State liên quan

- `north = none | low | tall`
- `east = none | low | tall`
- `south = none | low | tall`
- `west = none | low | tall`
- `up = true | false`

## Rule notes

- `up` không phải luôn `true`.
- Dấu `+` bốn hướng low có `up=false`.
- Block phía trên có thể làm các connection side chuyển từ `low` sang `tall`.
- Không được suy `tall` chỉ từ blockstate JSON.
- Wall behavior cần rule/runtime logic riêng.

## Required regression tests

- isolated wall
- one-side connection
- corner
- T-junction
- cross junction
- cross + block above → tall
- remove block above → recompute tall/low/up

---

# 4. Glass Pane / Iron Bars

Representative blocks:

- `minecraft:glass_pane`
- `minecraft:iron_bars`

## Golden cases

| Case                    | Expected                        |
| ----------------------- | ------------------------------- |
| Glass Pane đứng riêng   | `north/east/south/west = false` |
| Glass Pane + Glass Pane | Connect phía neighbor           |
| Glass Pane + Iron Bars  | **Connect**                     |
| Glass Pane + Stone      | **Connect**                     |
| Glass Pane dạng dấu `+` | 4 hướng `true`                  |

## State liên quan

- `north`
- `east`
- `south`
- `west`

## Rule notes

- Pane/Bars compatibility không chỉ là “cùng block type”.
- Glass Pane kết nối được với Iron Bars.
- Glass Pane kết nối được với full solid block như Stone.
- Place/delete neighbor phải refresh state.

## Required regression tests

- isolated pane
- pane ↔ pane
- pane ↔ iron bars
- pane ↔ full solid block
- four-way connection
- delete neighbor refresh

---

# 5. Stairs

Representative block: `minecraft:oak_stairs`

## Golden shapes đã xác minh

- `straight`
- `inner_left`
- `inner_right`
- `outer_left`
- `outer_right`

## State liên quan

- `facing`
- `half = bottom | top`
- `shape`
- `waterlogged`

## Golden placement behavior

- Một stairs đứng riêng → `shape=straight`.
- Neighbor stair phù hợp có thể làm shape thành:
  - `inner_left`
  - `inner_right`
  - `outer_left`
  - `outer_right`
- Khi neighbor thay đổi hoặc bị xóa, shape phải recompute.
- `waterlogged` và state không liên quan không được bị shape recompute ghi đè.
- Placement vào vị trí/mặt click tương ứng nửa trên có thể tạo `half=top`.
- Placement bình thường ở nửa dưới tạo `half=bottom`.

## Important editor implication

Placement engine về sau nên có đủ placement context để suy ra:

- face được click;
- hit position trên face;
- facing;
- half top/bottom.

Nếu chưa mô phỏng placement context đầy đủ, UI phải cho phép user chỉnh state rõ ràng thay vì luôn ép `half=bottom`.

## Required regression tests

- straight
- inner_left
- inner_right
- outer_left
- outer_right
- delete neighbor → shape recompute
- preserve `waterlogged`
- top/bottom placement behavior

---

# 6. Door

Representative block: `minecraft:oak_door`

## Golden state

Lower half:

- `half=lower`

Upper half:

- `half=upper`

Door còn có:

- `facing`
- `hinge`
- `open`
- `powered`

## Golden behavior

- Placement tạo đủ lower + upper.
- Hai half là một logical object.
- Mở cửa làm `open=true`.
- Hai half phải giữ state logic đồng bộ.
- Phá lower → upper mất.
- Phá upper → lower mất.
- Nếu voxel phía trên bị chiếm → không đặt được Door.
- Không được có partial placement.

## The Block Laundromat invariant

Các thao tác sau phải luôn mở rộng tới toàn logical object:

- Select
- Box Selection closure
- Add/Remove Group membership
- Group Move
- Delete
- Undo/Redo
- validation
- lock check

## Required regression tests

- valid two-block placement
- occupied upper target → reject atomically
- select either half → select both
- delete either half → delete both
- group one half → both parts membership
- move group → pair remains intact
- undo/redo = one logical history transaction

---

# 7. Tall Plant / Sunflower

Representative block: `minecraft:sunflower`

## Golden state

- lower block: `half=lower`
- upper block: `half=upper`

## Golden behavior

- Placement tạo cả lower + upper.
- Nếu upper target bị chiếm → không đặt được.
- Phá lower → upper mất.
- Phá upper → lower mất.
- Phá support block bên dưới → cả cây mất.

## The Block Laundromat invariant

- logical object gồm 2 voxel;
- không cho select/group/move một half riêng;
- operation atomic;
- one history entry.

## Required regression tests

- valid placement
- blocked upper target
- delete lower
- delete upper
- remove support
- group/move logical integrity
- undo/redo atomic

---

# 8. Bed

Representative block tested: vanilla bed.

## Golden state

- `part=foot`
- `part=head`
- `occupied=false` khi mới đặt
- `facing=<direction>`

## Golden behavior

- Bed là logical object 2 voxel.
- Foot nằm gần người đặt hơn.
- Head nằm ở voxel kế tiếp theo hướng đặt/facing.
- Nếu voxel thứ hai bị chiếm → không đặt được.
- Phá foot → head mất.
- Phá head → foot mất.

## The Block Laundromat editor policy

- Placement mới: default `occupied=false`.
- JSON/NBT import: preserve `occupied` nếu dữ liệu có.
- Không mô phỏng sleeping/gameplay runtime để tự đổi `occupied`.

## Required regression tests

- valid head/foot placement
- target second voxel occupied → reject atomically
- delete either part → remove pair
- selection/group/move logical closure
- preserve facing
- default occupied=false
- imported occupied value preserved

---

# 9. Torch / Wall Torch

## Vanilla item → world block behavior

Một item Torch có thể trở thành:

- `minecraft:torch` khi đặt trên mặt trên support;
- `minecraft:wall_torch` khi đặt vào mặt bên support.

Không có item inventory riêng bắt buộc cho Wall Torch.

## Golden behavior: Torch

- Torch đặt trên Stone → hợp lệ.
- Phá Stone support bên dưới → Torch mất.

## Golden behavior: Wall Torch

- Đặt Torch vào mặt bên Stone → tạo `minecraft:wall_torch`.
- Wall Torch có state `facing`.
- Phá Stone support mà Wall Torch đang bám → Wall Torch mất.
- Không thể đặt Wall Torch lơ lửng nếu không có support hợp lệ.

## The Block Laundromat implication

- Support validation phải kiểm tra đúng support direction.
- Placement context quyết định Torch vs Wall Torch.
- Golden vanilla behavior khi mất support là remove block.
- Nếu editor chọn policy khác để bảo toàn dữ liệu thì đó phải là **explicit product policy**, không được nhầm là vanilla behavior.

## Required regression tests

- standing torch valid support
- standing torch support removed
- wall torch side placement
- wall torch facing
- wall torch support removed
- floating wall torch invalid

---

# 10. Validation statuses

Rule engine dùng:

- `Valid`
- `Warning`
- `Invalid`
- `Unknown`

## Golden semantics

### Valid

Rule đã biết và placement hợp lệ.

### Invalid

Rule đã biết và placement không hợp lệ.

Examples:

- Door thiếu upper space.
- Tall Plant thiếu upper space.
- Wall Torch không có support.

### Unknown

Không đủ dữ liệu/runtime behavior để kết luận.

Examples:

- modded block có behavior phụ thuộc Java runtime chưa support.

### Warning

Dùng khi editor cho phép operation nhưng có condition cần cảnh báo.

---

# 11. Unknown / Modded behavior

Không được:

- đoán vanilla behavior dựa trên registry name;
- chạy Java/Kotlin mod bytecode;
- tự giả định block mod là fence/stairs/door chỉ vì suffix giống vanilla;
- biến missing/unknown block thành air.

Phải:

- preserve registry ID;
- preserve BlockState;
- preserve position;
- preserve metadata hiện có;
- trả `Unknown` hoặc `Partial` khi behavior không xác minh.

---

# 12. Multi-block integrity rules

Verified multi-block logical objects hiện tại:

- Door
- Tall Plant / Sunflower
- Bed

## Invariant

Nếu user thao tác một part thì editor phải resolve toàn logical object.

Áp dụng cho:

- single selection
- box selection closure
- group membership
- active group highlight
- group move
- delete
- lock validation
- history
- Structure NBT export consistency

Không cho phép một logical object bị split do editor operation.

---

# 13. History requirements

Một logical user operation = một history entry.

Examples:

- Place Door → lower + upper + derived updates → 1 entry.
- Delete Sunflower → lower + upper → 1 entry.
- Place Fence làm nhiều neighbor đổi state → 1 entry.
- Group Move chứa Door → toàn group + cả Door pair → 1 entry.

Undo một lần phải restore toàn operation.

Redo một lần phải reapply toàn operation.

Không đưa vào project edit history:

- camera
- selection
- Active Group switch
- Active Block switch
- mode switch
- Current Y
- hover
- pure view-only state

---

# 14. Historical implementation checkpoint and known mismatch

Checklist dưới đây là kết quả của checkpoint lịch sử, không phải xác nhận
independent rằng code ở HEAD hiện tại vẫn parity với toàn bộ behavior Vanilla.
Các dấu `[x]` ghi nhận test/kiểm tra tại checkpoint đó. Source và tests hiện tại
được kiểm tra riêng; mismatch đã xác nhận được ghi rõ bên dưới.

### Confirmed editor-policy divergence (current source and regression tests)

Minecraft làm rơi Torch/Wall Torch và Tall Plant khi support bị mất. Rule engine
hiện giữ các block này trong project, trả validation `Invalid` và không tự xóa
dữ liệu người dùng. Đây là policy bảo toàn dữ liệu có regression coverage, khác
với Vanilla survival behavior; không được đọc policy này như golden fact.
Amethyst attached-six-face dùng policy riêng: floating placement bị reject và
support removal cascade-remove bud/cluster.

Evidence: `Frontend/src/app/core/block-behavior/rules/block-rule-engine.ts`
(`removeUnsupportedAttachedBlocks`) and the corresponding named regression
tests in `Frontend/src/app/core/block-behavior/rules/block-rule-engine.spec.ts`.

The following checklist records what the earlier implementation checkpoint
reported as tested; it must not override the explicit policy divergence above
or substitute for a fresh runtime comparison with Minecraft:

## Wall

- [x] Support `up=false` đúng golden behavior.
- [x] Support `tall`.
- [x] Cross 4 hướng low → `up=false`.
- [x] Block phía trên có thể chuyển sides `low -> tall`.
- [x] Remove upper block recompute đúng.

## Fence

- [x] Wooden fence ↔ different wooden fence connect.
- [x] Wooden fence ↔ Nether Brick Fence không connect.
- [x] Fence ↔ solid block connect.
- [x] Delete neighbor refresh.

## Pane / Iron Bars

- [x] Pane ↔ Pane.
- [x] Pane ↔ Iron Bars.
- [x] Pane ↔ solid block.
- [x] Four-way state.

## Stairs

- [x] 5 shape values đúng.
- [x] Neighbor recompute.
- [x] Preserve unrelated states.
- [x] Placement context hỗ trợ `half=top/bottom`.

## Door

- [x] lower/upper logical integrity.
- [x] open/state synchronization.
- [x] occupied upper target rejects whole operation.

## Tall Plant

- [x] lower/upper logical integrity.
- [x] lost support behavior.
- [x] blocked upper target rejection.

## Bed

- [x] Implement head/foot relationship.
- [x] facing determines second voxel.
- [x] blocked second voxel rejection.
- [x] logical selection/group/move/delete.
- [x] `occupied=false` default for new placement.
- [x] preserve imported occupied.

## Torch / Wall Torch

- [x] Placement context distinguishes standing vs wall torch.
- [x] support direction validation.
- [x] lost support behavior.
- [x] no floating wall torch.

---

# 15. Checkpoint completion criteria

Golden Behavior Checkpoint chỉ coi là đóng khi:

- [x] Fence behavior manually verified.
- [x] Wall behavior manually verified.
- [x] Pane / Iron Bars behavior manually verified.
- [x] Stairs shapes manually verified.
- [x] Door behavior manually verified.
- [x] Tall Plant / Sunflower behavior manually verified.
- [x] Bed relationship manually verified.
- [x] Torch / Wall Torch support behavior manually verified.
- [x] Rule engine implementation được đối chiếu với matrix.
- [x] Các mismatch được sửa.
- [x] Regression tests được thêm.
- [x] TypeScript app/spec PASS.
- [x] Tests PASS.
- [x] Production build PASS.
- [x] `git diff --check` PASS.

Checkpoint này đã hoàn tất. Vanilla asset loading và rendering hiện thuộc
implementation; xem `minecraft-assets.md` cùng source hiện tại để biết trạng
thái hỗ trợ. Matrix này tiếp tục là nguồn chuẩn cho các vanilla facts đã verify.

---

# 16. Ngoài phạm vi checkpoint này (lịch sử)

Phần dưới ghi lại ranh giới của checkpoint khi được thực hiện, không phải danh
sách roadmap hiện tại.

Không thuộc Prompt 12 block behavior:

- Painting
- Item Frame
- Glow Item Frame

Các đối tượng này là attached/decoration entities và nên có prompt riêng sau vanilla renderer foundation.

Kế hoạch lúc checkpoint được ghi nhận:

**Prompt 12.6 — Decoration / Attached Entity Foundation**

Bao gồm:

- Painting
- Item Frame
- Glow Item Frame
- support attachment
- facing
- contained item
- item rotation
- painting motive/size
- selection/group/move
- Undo/Redo
- Structure NBT entity preservation

Các loại khác như Wall Sign / Hanging Sign / Banner vẫn thuộc block / block-entity layer và cần xử lý riêng theo architecture phù hợp.

---

_End of golden matrix._

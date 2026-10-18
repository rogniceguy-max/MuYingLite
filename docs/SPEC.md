# 影视项目协同工作台 — 规格说明

- 状态：待确认（确认后进入前后端骨架搭建）
- 日期：2026-10-18
- 本轮范围：数据模型、API 边界、页面结构，以及支撑它们的协同/媒体/回收站规则
- 不在本轮范围：排期、实施计划、部署上线步骤

---

## 1. 产品定义

这是一个**局域网内使用的影视项目协同工作台**：

- 项目包含多集；
- 每集有一张节拍表；
- 整个项目有一张资产表；
- 每个项目有独立的媒体库；
- 表内内容多人实时协同编辑；
- 视频和图片可在网页内审阅；
- 删除的行和媒体进入回收站；
- 无登录、无权限、完全匿名；
- 不做离线编辑。

它不是视频剪辑器、通用电子表格、网盘、排期工具或聊天工具。

### 1.1 MVP 范围

- 项目列表与进入项目；Root 页头不显示新建项目按钮，空状态和项目网格可打开新建项目对话框
- 集的新增/编辑/删除
- 每集一张节拍表，项目一张资产表
- 固定列编辑、行增删、行拖拽排序
- 多人实时协同与匿名在线状态
- 节拍表多条视频
- 资产表选定唯一、备选多张
- 资产行集数多选，点击集数跳转节拍表
- 批注文本框 + @当前行媒体
- 项目级媒体库：上传、播放/查看、复用、删除
- 回收站：行/表/媒体按批次恢复或彻底删除
- 编辑集号/标题不影响表内内容
- 表名不作为用户可编辑概念；节拍表位置用集号/标题标识

### 1.2 明确不做

- 登录、用户、角色、权限、邀请
- 离线编辑、本地冲突合并
- 跨项目媒体复用
- 评论线程、@人、回复、解决状态、通知
- Excel 公式、透视、宏、批量填充、Excel 式键盘导航
- 时间码批注（后续可加）
- PSD/TIFF 预览（后续可加）
- 项目删除、项目归档
- 导入/导出（CSV/Excel）、全文搜索、版本历史 UI
- 公网部署与认证

---

## 2. 核心概念

| 概念 | 含义 |
|---|---|
| Project | 项目容器，包含集、表、媒体、回收站 |
| Episode | 集；有集号、标题、顺序 |
| Beat Sheet | 节拍表；一集一张，通过 `episode_id` 绑定 |
| Asset Sheet | 资产表；一个项目一张 |
| Row | 表中的一行；行有稳定 ID 和排序键 |
| Cell | 行 × 固定列的值；长文本是协同文本 |
| Media Asset | 项目级媒体文件（视频或图片） |
| Media Link | 媒体挂到某行某列某角色的引用 |
| Deletion Batch | 一次删除动作产生的回收站批次 |
| Client | 一个浏览器标签页；匿名、临时 |

关系：

```text
Project 1─N Episode 1─1 Beat Sheet
Project 1─1 Asset Sheet
Sheet 1─N Row 1─N Cell
Project 1─N Media Asset 1─N Media Link N─1 Row / Sheet
Deletion Batch 1─N Row / Sheet / Media Asset
```

---

## 3. 架构原则

### 3.1 单一写路径

- **Postgres 是元数据的唯一真相**：项目、集、表、列定义、媒体资产、回收站批次、权限（无）、表名。
- **Yjs 是表内容的唯一真相**：行是否存在、行顺序、单元格值、媒体引用。
- **Postgres 中的 `rows` / `cells` / `media_links` 是异步投影**：用于查询、筛选、回收站、统计和导出；允许秒级延迟，可由 Yjs 重建。
- **禁止双写**：客户端不能通过 REST 直接写单元格/行；所有内容写入必须先产生 Yjs update，再经投影 worker 落 SQL。
- **媒体资产是例外**：文件上传和资产元数据走 REST + 对象存储；媒体“挂到哪一行”是内容，走 Yjs；投影生成 `media_links`。

### 3.2 身份与显示名分离

- 项目、集、表、列、行、媒体、链接、评论锚点都用不可变 ID。
- 表名、列标签、媒体显示名只是显示属性。
- 改名 = 元数据事件，不写 Y.Doc、不重连、不重挂载、不改变任何单元格版本。
- URL、WebSocket 房间、React key、对象存储 key、审计记录、评论/媒体引用全部使用 ID。

### 3.3 匿名、无认证、可信局域网

- 没有用户表、角色表、登录页、JWT、Cookie 会话。
- 每个浏览器标签页生成一个临时 `client_id`（UUIDv7，放 `sessionStorage`），仅用于：
  - Yjs awareness / 匿名在线状态；
  - 本标签页撤销范围；
  - 可选的调试日志。
- `client_id` 不是身份，不在 UI 显示姓名，不做权限判断。
- 回收站、媒体删除等操作不记录“谁”，最多记录匿名 `client_id` 供排查。
- 默认部署在可信局域网；**不得直接暴露公网**。若未来需要公网访问，必须先加认证、HTTPS、权限和审计。

### 3.4 在线协同、不做离线

- 使用 Yjs + Hocuspocus 实时同步。
- 不使用 `y-indexeddb`、Service Worker、离线队列。
- 连接断开时：显示“已断开，正在重连”，表格进入只读；恢复连接后继续编辑。
- 重连后从服务端加载最新快照/更新，不合并本地离线改动。

### 3.5 媒体与回收站

- 媒体库按项目隔离，不允许跨项目引用。
- 项目内允许同一媒体被多行复用。
- 删除行只解除该行的引用；媒体仍被其他行使用时保留；没有任何活跃引用时才进入回收站。
- 删除操作按批次组织，恢复和彻底删除都以批次为单位。
- 媒体对象在回收站期间保留在 MinIO；彻底删除时才移除对象。

### 3.6 固定列、可扩展

- MVP 不做自定义列 UI。
- 列定义有稳定 `column_id`、类型、显示名和顺序，存在 `sheet_columns`。
- `sheet.schema_version` 用于未来加列/改类型。
- 未来新增列时，老行该列为空，不做数据迁移；改类型才需要迁移。

---

## 4. 数据模型

### 4.1 通用约定

- 主键使用 UUIDv7（时间有序）。
- 内容型 ID（行、媒体链接）由客户端生成，便于离线乐观插入、幂等和协同；服务端校验格式。
- 元数据型 ID（项目、集、表）由服务端生成。
- 所有时间使用 `timestamptz`，API 返回 ISO 8601。
- 软删除统一用 `deleted_at` + `deletion_batch_id`。
- 行顺序使用 fractional indexing 字符串 `position`，避免并发整数重排冲突。
- 媒体列表顺序由 Yjs `Y.Array` 顺序决定，投影写入整数 `position`。

### 4.2 表：projects

```sql
projects (
  id uuid primary key,
  name text not null,
  metadata_revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
)
```

说明：

- 项目删除不在 MVP 范围；保留 `deleted_at` 供未来使用。
- `name` 只用于显示。

### 4.3 表：episodes

```sql
episodes (
  id uuid primary key,
  project_id uuid not null references projects(id),
  number int not null,
  title text null,
  position int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  deletion_batch_id uuid null references deletion_batches(id)
)
```

约束：

- `unique (project_id, number) where deleted_at is null`
- `index (project_id, position)`

说明：

- `number` 是集号，`title` 是可选标题。
- 集号/标题是页面定位标签；内部节拍表 `name` 不再作为用户可见标签。资产表的“集数”显示集号/标题。

### 4.4 表：sheets

```sql
sheets (
  id uuid primary key,
  project_id uuid not null references projects(id),
  kind text not null check (kind in ('beat', 'asset')),
  episode_id uuid null references episodes(id),
  name text not null,
  position int not null,
  schema_version int not null default 1,
  metadata_revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  deletion_batch_id uuid null references deletion_batches(id),
  check (
    (kind = 'beat' and episode_id is not null)
    or
    (kind = 'asset' and episode_id is null)
  )
)
```

约束：

- `unique (episode_id) where kind = 'beat' and deleted_at is null` — 一集一张节拍表。
- `unique (project_id) where kind = 'asset' and deleted_at is null` — 一个项目一张资产表。
- `index (project_id, position)`

说明：

- `name` 是显示名，可改；不参与外键、URL、WebSocket 房间、对象 key。
- 节拍表默认名：`第{number}集 节拍表`，但名称与集的编号/标题不联动。
- 资产表默认名：`资产表`。

### 4.5 表：sheet_columns

```sql
sheet_columns (
  id text primary key,
  sheet_kind text not null check (sheet_kind in ('beat', 'asset')),
  label text not null,
  data_type text not null,
  config jsonb not null default '{}',
  position int not null,
  schema_version int not null default 1,
  created_at timestamptz not null default now(),
  unique (sheet_kind, position)
)
```

种子数据：

| column_id | sheet_kind | label | data_type | 说明 |
|---|---|---|---|---|
| `beat.scene` | beat | 场景 | `text` | 短文本 |
| `beat.beat_no` | beat | 节拍 | `beat_no` | 只读序号，不存值 |
| `beat.story` | beat | 故事内容 | `long_text` | Y.Text |
| `beat.mark` | beat | 标注 | `enum_color` | 红/黄/绿/空 |
| `beat.plan` | beat | 规划 | `long_text` | Y.Text |
| `beat.note` | beat | 批注 | `note_mentions` | 文本 + 当前行媒体引用 |
| `beat.videos` | beat | 视频 | `media_videos` | 多条视频引用 |
| `asset.category` | asset | 类别 | `text` | 短文本 |
| `asset.name` | asset | 名称 | `text` | 短文本 |
| `asset.episodes` | asset | 集数 | `episode_refs` | 多选 episode |
| `asset.selected` | asset | 选定 | `media_selected` | 唯一图片引用 |
| `asset.alternates` | asset | 备选 | `media_alternates` | 多张有序图片引用 |
| `asset.note` | asset | 批注 | `note_mentions` | 文本 + 当前行媒体引用 |

配置：

```json
// beat.mark
{ "options": ["red", "yellow", "green"], "allowClear": true }
```

说明：

- 列固定；MVP 不提供新增/删除列 UI。
- 未来加列：插入新 `sheet_columns` 行并提升 `schema_version`；老行该列为空。
- `beat_no` 是虚拟列，客户端根据排序后的可见行计算 1-based 序号；投影/导出也按行顺序计算。

### 4.6 表：rows（投影）

```sql
rows (
  id uuid primary key,
  project_id uuid not null references projects(id),
  sheet_id uuid not null references sheets(id),
  position text not null,
  deleted_at timestamptz null,
  deletion_batch_id uuid null references deletion_batches(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

约束/索引：

- `index (sheet_id, position)`
- 部分索引 `(sheet_id) where deleted_at is null`

说明：

- 行 ID 由客户端生成，UUIDv7。
- `position` 为 fractional index；同位置按 `id` 兜底排序。
- 投影 worker 从 Yjs 同步；客户端不直接写这张表。

### 4.7 表：cells（投影）

```sql
cells (
  row_id uuid not null references rows(id),
  sheet_id uuid not null references sheets(id),
  project_id uuid not null references projects(id),
  column_id text not null references sheet_columns(id),
  value jsonb null,
  updated_at timestamptz not null default now(),
  primary key (row_id, column_id)
)
```

索引：

- `index (sheet_id, column_id)`
- 需要按集数筛选时使用 `asset_row_episodes`，不依赖 JSONB 查询。

`value` 形状：

| data_type | value |
|---|---|
| `text` | `"字符串"` |
| `long_text` | `"纯文本"`（Y.Text 投影为纯文本） |
| `enum_color` | `"red" \| "yellow" \| "green" \| null` |
| `episode_refs` | `["episode_uuid", ...]` |
| `media_videos` | `[{ "linkId": "...", "assetId": "..." }, ...]` |
| `media_selected` | `{ "linkId": "...", "assetId": "..." } \| null` |
| `media_alternates` | `[{ "linkId": "...", "assetId": "..." }, ...]` |
| `note_mentions` | `{ "text": "...", "mentions": [{ "mentionId": "...", "linkId": "...", "assetId": "...", "kind": "video" \| "image", "labelSnapshot": "..." }] }` |

说明：

- `beat.beat_no` 不写入 `cells`。
- 长文本只存纯文本；MVP 不做富文本格式。
- `media_*` 只存链接 ID 和资产 ID，不存 URL。
- `note_mentions` 的 `text` 包含 `{{mention:<mentionId>}}` 占位符；渲染时替换为媒体胶囊。

### 4.8 表：asset_row_episodes（投影）

```sql
asset_row_episodes (
  project_id uuid not null references projects(id),
  sheet_id uuid not null references sheets(id),
  row_id uuid not null references rows(id),
  episode_id uuid not null references episodes(id),
  primary key (row_id, episode_id)
)
```

索引：

- `index (project_id, episode_id)`
- `index (sheet_id, row_id)`

说明：

- 从 `asset.episodes` 的 Y.Array 投影。
- 用于按集筛选资产行。
- 如果 episode 被软删除，关联保留；UI 显示“已删除”，恢复后重新可点。

### 4.9 表：media_assets

```sql
media_assets (
  id uuid primary key,
  project_id uuid not null references projects(id),
  kind text not null check (kind in ('video', 'image')),
  display_name text not null,
  storage_key text not null unique,
  mime_type text not null,
  size_bytes bigint not null,
  checksum_sha256 text null,
  width int null,
  height int null,
  duration_ms int null,
  status text not null check (status in ('uploading', 'processing', 'ready', 'failed')),
  processing_error text null,
  thumbnail_key text null,
  proxy_key text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  deletion_batch_id uuid null references deletion_batches(id)
)
```

索引：

- `index (project_id, kind, status)`
- `index (project_id, deleted_at)`

说明：

- `display_name` 只用于显示，默认原文件名；不是对象 key。
- `storage_key` 例子（按表结构归档）：
  - 节拍表视频：`projects/{project_id}/第{episodeNumber}集/第{beatNumber}拍/{safe_filename}`
  - 资产表图片：`projects/{project_id}/资产表/{category}/{assetName}/{选定|备选}/{safe_filename}`
  - 文件库直接上传：`projects/{project_id}/文件库/{safe_filename}`
- 项目隔离：所有查询必须带 `project_id`；对象 key 前缀也带 `project_id`。
- MVP 不做文件版本树；替换图片/视频 = 新建资产，旧资产按回收站规则处理。
- 图片支持 JPEG/PNG/WebP；PSD/TIFF 后续。
- 视频优先 H.264/AAC MP4；其他格式转代理。

### 4.10 表：media_links

```sql
media_links (
  id uuid primary key,
  project_id uuid not null references projects(id),
  asset_id uuid not null references media_assets(id),
  sheet_id uuid not null references sheets(id),
  row_id uuid not null references rows(id),
  column_id text not null references sheet_columns(id),
  role text not null check (role in ('video', 'selected', 'alternate')),
  position int not null default 0,
  deleted_at timestamptz null,
  deletion_batch_id uuid null references deletion_batches(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

约束/索引：

- `unique (row_id, column_id) where role = 'selected' and deleted_at is null` — 每行一个选定。
- `unique (row_id, column_id, role, asset_id) where deleted_at is null` — 同一槽位不重复引用同一资产。
- `index (asset_id) where deleted_at is null` — 引用计数。
- `index (sheet_id, row_id)`
- `index (project_id, asset_id)`

业务规则：

- 节拍表的 `beat.videos` 只能产生 `role='video'`，资产必须是 `kind='video'`。
- 资产表的 `asset.selected` 只能产生一条 `role='selected'`，资产必须是 `kind='image'`。
- 资产表的 `asset.alternates` 只能产生 `role='alternate'`，资产必须是 `kind='image'`。
- 同一行内，selected 与 alternates 的资产集合不重叠。
- 备选“设为选定”：
  1. 在原 alternates Y.Array 中删除该 link；
  2. 将该 link 的 role 变为 selected；
  3. 原 selected link 的 role 变为 alternate，并追加到 alternates；
  4. 整个操作在一个 Yjs transaction 中完成。
- 媒体仍被其他行引用时，删除某行只删除该行 link，不删除 asset。

### 4.11 表：deletion_batches

```sql
deletion_batches (
  id uuid primary key,
  project_id uuid not null references projects(id),
  kind text not null check (kind in ('row', 'sheet', 'media')),
  status text not null check (status in ('active', 'restored', 'purged')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  restored_at timestamptz null,
  purged_at timestamptz null
)
```

索引：

- `index (project_id, status, created_at desc)`

`metadata` 建议字段：

```json
{
  "sheetId": "...",
  "sheetName": "...",
  "episodeId": "...",
  "episodeNumber": 1,
  "rowSummary": "场景一 / 节拍 3",
  "itemCounts": { "rows": 1, "media": 2 }
}
```

说明：

- 一个被删除的行/表/媒体同一时间只属于一个 active batch。
- 彻底删除后 `status='purged'`，记录保留用于排查；也可以之后清理。
- 不记录用户身份；完全匿名。

### 4.12 表：yjs_updates / yjs_snapshots / sheet_projection_state

```sql
yjs_updates (
  id bigserial primary key,
  sheet_id uuid not null references sheets(id),
  update bytea not null,
  created_at timestamptz not null default now()
)
```

```sql
yjs_snapshots (
  id uuid primary key,
  sheet_id uuid not null references sheets(id),
  state bytea not null,
  last_update_id bigint not null,
  created_at timestamptz not null default now()
)
```

```sql
sheet_projection_state (
  sheet_id uuid primary key references sheets(id),
  projected_update_id bigint not null default 0,
  projected_at timestamptz null
)
```

策略：

- Hocuspocus 加载文档：取最新 snapshot + `id > last_update_id` 的 updates，应用。
- 写入：更新先追加到 `yjs_updates`；每 100 条或 60 秒生成一次 snapshot。
- 投影 worker 记录 `projected_update_id`，幂等 upsert；可重放重建。
- `yjs_updates` 保留 30 天；snapshot 每张表保留最近 100 个（可配置）。
- 表被彻底删除时，删除其 updates/snapshots；行级删除不删 Yjs 历史。

### 4.13 Yjs 文档结构

文档名：`sheet:{sheet_id}`。

```text
Y.Doc
└── rows: Y.Map<rowId, Y.Map>
    ├── position: string                  // fractional index
    ├── deleted: boolean
    ├── deletionBatchId: string | null
    ├── deletedAt: string | null
    └── cells: Y.Map<columnId, value>
        ├── beat.scene: string
        ├── beat.story: Y.Text
        ├── beat.mark: "red" | "yellow" | "green" | null
        ├── beat.plan: Y.Text
        ├── beat.note: Y.Map {
        │     text: Y.Text,
        │     mentions: Y.Map<mentionId, {
        │       mentionId, linkId, assetId,
        │       kind: "video" | "image",
        │       labelSnapshot: string
        │     }>
        │   }
        ├── beat.videos: Y.Array<Y.Map { linkId, assetId }>
        ├── asset.category: string
        ├── asset.name: string
        ├── asset.episodes: Y.Array<string>   // episode ids
        ├── asset.selected: Y.Map { linkId, assetId } | null
        ├── asset.alternates: Y.Array<Y.Map { linkId, assetId }>
        └── asset.note: 同 beat.note
```

规则：

- **表名、列定义、权限、评论、媒体元数据不进 Y.Doc。**
- 短文本用普通字符串（LWW）；长文本用 `Y.Text`。
- 枚举标注用字符串；空值用 `null`。
- 媒体引用只存 `linkId` + `assetId`；URL、缩略图、状态来自 REST/媒体资产。
- 行顺序用每个 row 的 `position` fractional index；拖拽只改被移动行的 position。
- 行删除保留 tombstone，不物理移除；便于回收站恢复和 Yjs undo。
- 批注的 `text` 与 `mentions` 分离：文本可以字符级合并；mentions 单独增删。文本中的 `{{mention:<mentionId>}}` 是渲染占位符。
- 批注 @ 只允许当前行已有的 media link；不 @人，不跨行。
- 被引用的媒体从行里移除后，mention 保留，渲染为“已移除”；mention 的 `labelSnapshot` 用于显示旧名称。
- 资产行的 selected/alternates 操作在一个 transaction 中完成，避免出现两个 selected。
- 无 `y-indexeddb`；客户端不持久化 Y.Doc。

### 4.14 关键约束汇总

1. 一集一张节拍表；一个项目一张资产表。
2. 一行资产可以关联多个 episode；selected/alternates 对该行所有 episode 共用。
3. 每行资产最多一个有效 selected。
4. 节拍行的视频 role 必须为 `video`；资产图片 role 必须为 `selected` 或 `alternate`。
5. media_asset 与 sheet 必须属于同一 project。
6. 媒体链接不跨项目。
7. `beat_no` 是派生列，不存储。
8. 表名/列名/媒体显示名不参与任何引用键。
9. 行/媒体删除必须经过删除批次；恢复/彻底删除以批次为单位。
10. Postgres 的 rows/cells/media_links 是投影，不能作为客户端写入入口。

---

## 5. API 边界

### 5.1 总则

- 风格：REST + JSON；Fastify + Zod。
- 前缀：`/api`。
- 无认证、无 Cookie、无 JWT；所有接口在局域网内开放。
- 可选请求头 `X-Client-Id: <uuidv7>`，仅用于日志/排查；不是身份。
- 请求/响应字段使用 camelCase。
- 时间使用 ISO 8601。
- 错误格式：

```json
{
  "error": {
    "code": "MEDIA_IN_USE",
    "message": "该媒体仍被 3 行使用",
    "details": {}
  }
}
```

- 常用状态码：
  - `200` 成功
  - `201` 创建
  - `204` 无内容
  - `400` 参数错误
  - `404` 不存在
  - `409` 冲突（媒体仍在使用、回收站依赖、重名等）
  - `422` 媒体处理/格式不支持
  - `500` 服务端错误
- 列表接口使用 cursor 分页：`?limit=50&cursor=...`。
- 幂等：
  - 媒体上传使用客户端生成的 `asset_id`；重复创建返回同一上传会话。
  - 回收站恢复/彻底删除按批次状态幂等。
  - 表改名可用 `If-Match: <metadata_revision>`；不传则最后写入生效。
- **内容写入边界**：
  - 公共 REST **不提供**写行/单元格/媒体链接的接口。
  - 行、单元格、媒体引用只能通过 Hocuspocus WebSocket 的 Yjs update 写入。
  - 服务端内部命令（恢复回收站、强制移除媒体链接、删除整表）可以调用 collab 服务的内部接口，不暴露给浏览器。

### 5.2 项目

#### `GET /api/projects`

返回项目列表。

```json
{
  "projects": [
    {
      "id": "uuid",
      "name": "项目 A",
      "episodeCount": 3,
      "assetSheetId": "uuid",
      "createdAt": "2026-10-18T08:00:00Z",
      "updatedAt": "2026-10-18T08:00:00Z"
    }
  ]
}
```

#### `POST /api/projects`

创建项目，并在同一事务中创建：

- 项目；
- 默认第 1 集；
- 第 1 集的 **8 行空白节拍表**；
- 项目资产表。

请求：

```json
{
  "name": "项目 A",
  "firstEpisode": {
    "number": 1,
    "title": null
  }
}
```

`firstEpisode` 可省略，默认 `{ number: 1 }`。

响应 `201`：

```json
{
  "project": { "id": "uuid", "name": "项目 A" },
  "episode": { "id": "uuid", "number": 1, "title": null },
  "sheets": [
    { "id": "uuid", "kind": "beat", "episodeId": "uuid", "name": "第1集 节拍表" },
    { "id": "uuid", "kind": "asset", "episodeId": null, "name": "资产表" }
  ]
}
```

#### `GET /api/projects/{projectId}`

返回项目详情、集列表、表列表。

```json
{
  "project": { "id": "uuid", "name": "项目 A" },
  "episodes": [
    { "id": "uuid", "number": 1, "title": null, "position": 0, "deletedAt": null }
  ],
  "sheets": [
    {
      "id": "uuid",
      "kind": "beat",
      "episodeId": "uuid",
      "name": "第1集 节拍表",
      "metadataRevision": 3,
      "schemaVersion": 1
    },
    {
      "id": "uuid",
      "kind": "asset",
      "episodeId": null,
      "name": "资产表",
      "metadataRevision": 1,
      "schemaVersion": 1
    }
  ]
}
```

#### `PATCH /api/projects/{projectId}`

可选；只改项目显示名。

```json
{ "name": "新项目名" }
```

不写 Y.Doc，不影响任何内容。

### 5.3 集（Episode）

#### `POST /api/projects/{projectId}/episodes`

新增一集，并自动创建该集的 **8 行空白节拍表**。

```json
{
  "number": 2,
  "title": "第二集标题"
}
```

响应 `201`：

```json
{
  "episode": { "id": "uuid", "number": 2, "title": "第二集标题" },
  "sheet": {
    "id": "uuid",
    "kind": "beat",
    "episodeId": "uuid",
    "name": "第2集 节拍表",
    "metadataRevision": 1
  }
}
```

约束：同一项目内有效集号唯一；冲突返回 `409`。

#### `PATCH /api/episodes/{episodeId}`

```json
{ "number": 3, "title": "新标题" }
```

只改集元数据；不改内部 `sheet.name`，不写 Y.Doc。资产表“集数”和顶栏面包屑随之更新。

#### `DELETE /api/episodes/{episodeId}`

软删除该集及其节拍表：

- 创建 `kind='sheet'` 的 deletion batch；
- 标记 episode、sheet 为已删除；
- collab 服务将该 sheet 设为只读/关闭连接；
- 投影 worker 把该表的行、链接、无其他引用的媒体加入批次；
- 资产表中引用该集的资产行保留 `episode_id`，UI 显示“该集已删除”；恢复该集后重新可点。

响应：

```json
{
  "batchId": "uuid",
  "sheetId": "uuid"
}
```

### 5.4 表（Sheet）

#### `GET /api/sheets/{sheetId}`

返回表元数据 + 列定义。

```json
{
  "sheet": {
    "id": "uuid",
    "projectId": "uuid",
    "kind": "beat",
    "episodeId": "uuid",
    "name": "第1集 节拍表",
    "metadataRevision": 3,
    "schemaVersion": 1
  },
  "columns": [
    {
      "id": "beat.scene",
      "label": "场景",
      "dataType": "text",
      "config": {},
      "position": 1
    }
  ]
}
```

资产表还会包含当前项目的 episodes（供集数多选和跳转）：

```json
{
  "episodes": [
    { "id": "uuid", "number": 1, "title": null, "deletedAt": null }
  ]
}
```

#### `PATCH /api/sheets/{sheetId}`

只改表显示名。

请求头（可选）：

```text
If-Match: 3
```

请求：

```json
{ "name": "第1集 节拍表（修改版）" }
```

响应：

```json
{
  "sheetId": "uuid",
  "name": "第1集 节拍表（修改版）",
  "metadataRevision": 4
}
```

行为：

- 只更新 `sheets.name`、`metadata_revision`、`updated_at`；
- 写一条可选的操作记录；
- 通过项目 SSE 广播 `sheet.renamed`；
- **不写 Y.Doc、不重连、不重挂载、不改变任何行/单元格/媒体引用**。

#### `DELETE /api/sheets/{sheetId}`

不支持。

- 节拍表删除 = 删除对应 episode（见上）。
- 资产表不可单独删除。

### 5.5 媒体

#### 5.5.1 创建上传会话

`POST /api/projects/{projectId}/media/uploads`

请求：

```json
{
  "assetId": "0199...uuidv7",
  "kind": "video",
  "filename": "shot_001.mp4",
  "mimeType": "video/mp4",
  "sizeBytes": 524288000
}
```

行为：

- 校验 project、kind、MIME、大小上限；
- 创建 `media_assets` 行，状态 `uploading`；
- 生成 MinIO 预签名 PUT URL；
- 返回上传信息和资产记录。

响应：

```json
{
  "asset": {
    "id": "uuid",
    "kind": "video",
    "displayName": "shot_001.mp4",
    "status": "uploading",
    "mimeType": "video/mp4",
    "sizeBytes": 524288000
  },
  "upload": {
    "url": "http://minio.local/...",
    "method": "PUT",
    "headers": { "Content-Type": "video/mp4" },
    "expiresAt": "2026-10-18T09:00:00Z"
  }
}
```

上传方式：

- MVP 使用单次预签名 PUT；客户端用流式上传。
- 如果实际视频经常超过 2GB，再增加 multipart/resumable；不影响资产模型。

#### 5.5.2 完成上传

`POST /api/media/{assetId}/complete`

请求：

```json
{ "checksumSha256": "可选" }
```

行为：

- HEAD MinIO 对象，校验存在、大小、Content-Type；
- 状态改为 `processing`；
- 投递媒体处理任务；
- 返回资产。

```json
{
  "asset": {
    "id": "uuid",
    "status": "processing"
  }
}
```

#### 5.5.3 媒体列表

`GET /api/projects/{projectId}/media?kind=&status=&usage=&q=&limit=&cursor=`

参数：

- `kind`: `video | image`
- `status`: `uploading | processing | ready | failed`
- `usage`: `linked | unlinked`
- `q`: 文件名模糊搜索
- `limit`: 默认 50，最大 100
- `cursor`: 分页游标

响应：

```json
{
  "items": [
    {
      "asset": {
        "id": "uuid",
        "kind": "video",
        "displayName": "shot_001.mp4",
        "status": "ready",
        "durationMs": 12000,
        "width": 1920,
        "height": 1080,
        "sizeBytes": 524288000
      },
      "thumbnailUrl": "http://minio.local/...",
      "usageCount": 2,
      "linkedRows": [
        {
          "sheetId": "uuid",
          "sheetKind": "beat",
          "rowId": "uuid",
          "columnId": "beat.videos",
          "role": "video"
        }
      ]
    }
  ],
  "nextCursor": null
}
```

#### 5.5.3.1 文件夹归档任务

`POST /api/projects/{projectId}/archive-jobs`

请求体：

```json
{ "folder": ["第1集"] }
```

`folder` 是文件库当前显示路径的分段数组；服务端按当前显示目录匹配媒体，不按物理存储目录匹配。

响应：

```json
{
  "job": {
    "jobId": "uuid",
    "projectId": "uuid",
    "folderName": "第1集",
    "status": "queued",
    "totalFiles": 12,
    "processedFiles": 0,
    "totalBytes": 524288000,
    "processedBytes": 0,
    "missingFiles": 0,
    "error": null
  }
}
```

`GET /api/projects/{projectId}/archive-jobs/{jobId}` 返回同一结构的最新进度；`status` 为 `queued | running | done | error | cancelled`。

`GET /api/projects/{projectId}/archive-jobs/{jobId}/file` 流式返回 `application/zip`，只能启动一次：

- ZIP 根目录为请求路径的最后一段，例如 `第1集/第1拍/flower.mp4`。
- 使用 store 模式，不做压缩；条目名使用 UTF-8。
- 缺失文件跳过，并写入 `_缺失文件.txt`。
- 任务保存在内存中，完成或排队超时后自动清理；不落盘、不持久化。

#### 5.5.4 媒体详情与播放地址

`GET /api/media/{assetId}`

```json
{
  "asset": {
    "id": "uuid",
    "kind": "video",
    "displayName": "shot_001.mp4",
    "status": "ready",
    "durationMs": 12000,
    "width": 1920,
    "height": 1080
  },
  "urls": {
    "thumbnail": "http://minio.local/...",
    "proxy": "http://minio.local/...",
    "original": "http://minio.local/..."
  },
  "usageCount": 2,
  "linkedRows": []
}
```

- 视频播放优先 `proxy`；无 proxy 且原文件浏览器可播时用 `original`。
- 图片缩略图用 `thumbnail`；灯箱用 `original`。
- 预签名 URL 有效期默认 1 小时；过期后客户端重新请求。
- 私有桶；不暴露 MinIO 凭证。

#### 5.5.5 重命名媒体

`PATCH /api/media/{assetId}`

请求：

```json
{ "displayName": "新文件名.mp4" }
```

行为：

- 只更新 `display_name` 和 `updated_at`；
- 不改 `storage_key`、不移动文件、不影响任何行/单元格引用；
- 通过 SSE 广播 `media.updated`。

响应：

```json
{ "asset": { "id": "uuid", "displayName": "新文件名.mp4" } }
```

#### 5.5.6 删除媒体

`DELETE /api/media/{assetId}?force=false`

行为：

- 如果资产有活跃 media_links 且 `force=false`：返回 `409 MEDIA_IN_USE`，附使用位置。
- 如果 `force=true`：
  - 通过 collab 服务从各 Yjs 单元格移除对应 link；
  - 创建 `kind='media'` 的 deletion batch；
  - 软删除资产；
  - 通过 SSE 通知。
- 如果没有任何活跃 link：直接创建 batch 并软删除。
- 已删除/回收站中的资产再次删除返回 `409`。

响应：

```json
{
  "batchId": "uuid",
  "removedLinks": 2
}
```

### 5.6 回收站

#### `GET /api/projects/{projectId}/recycle-bin`

响应：

```json
{
  "batches": [
    {
      "id": "uuid",
      "kind": "row",
      "status": "active",
      "createdAt": "2026-10-18T08:10:00Z",
      "metadata": {
        "sheetId": "uuid",
        "sheetName": "第1集 节拍表",
        "episodeNumber": 1,
        "rowSummary": "场景一 / 节拍 3",
        "itemCounts": { "rows": 1, "media": 2 }
      },
      "media": [
        {
          "assetId": "uuid",
          "kind": "video",
          "displayName": "shot_001.mp4",
          "thumbnailUrl": "http://minio.local/..."
        }
      ],
      "canRestore": true,
      "restoreBlockedReason": null
    }
  ],
  "nextCursor": null
}
```

#### `POST /api/projects/{projectId}/recycle-bin/{batchId}/restore`

行为：

- 根据批次类型恢复：
  - `row`：通过 collab 服务清除行 tombstone；恢复该批次的 media_links 和 media_assets（如果它们仍在回收站且未被彻底删除）。
  - `sheet`：清除 episode/sheet 删除标记；恢复该批次的行、链接、媒体；节拍表重新可连接。
  - `media`：恢复媒体资产到项目媒体库；不自动重新挂到行（除非该媒体属于某个 row batch，由 row restore 处理）。
- 如果依赖项仍被删除（例如行所属的节拍表还在回收站），返回 `409 RESTORE_DEPENDENCY`，并附依赖批次。
- 幂等：已恢复的批次再次调用返回当前状态。

响应：

```json
{
  "batchId": "uuid",
  "status": "restored",
  "restored": { "rows": 1, "sheets": 0, "media": 2 }
}
```

#### `DELETE /api/projects/{projectId}/recycle-bin/{batchId}`

请求：

```json
{ "confirm": "DELETE" }
```

行为：

- 彻底删除批次内的数据库记录；
- 对批次内媒体资产，检查无其他活跃 link 后删除 MinIO 对象（original/proxy/thumbnail）；
- 如果是 sheet 批次，删除该表的 Yjs updates/snapshots；
- 批次状态改为 `purged`。

#### `DELETE /api/projects/{projectId}/recycle-bin`

请求：

```json
{ "confirm": "DELETE" }
```

清空项目回收站；按批次执行彻底删除。

### 5.7 项目事件 SSE

`GET /api/projects/{projectId}/events`

- `Content-Type: text/event-stream`
- 无认证
- 客户端在项目工作区打开时订阅
- 每 15 秒发送一次注释心跳

事件类型：

```text
event: sheet.renamed
data: {"sheetId":"uuid","name":"新表名","metadataRevision":4}

event: episode.created
data: {"episodeId":"uuid","number":2,"sheetId":"uuid"}

event: episode.updated
data: {"episodeId":"uuid","number":3,"title":"新标题"}

event: episode.deleted
data: {"episodeId":"uuid","sheetId":"uuid","batchId":"uuid"}

event: media.updated
data: {"assetId":"uuid","status":"ready","thumbnailUrl":"..."}

event: recycle_bin.changed
data: {"batchId":"uuid","action":"created"}

event: project.updated
data: {"projectId":"uuid"}
```

MVP 不做事件回放；SSE 重连后客户端重新拉取项目元数据。

### 5.8 协同 WebSocket

- 地址：`/collab`
- 协议：Hocuspocus
- 文档名：`sheet:{sheetId}`
- 无认证；服务端校验：
  - sheet 存在；
  - 项目存在；
  - sheet 未删除；已删除则只读或拒绝连接。
- 客户端使用 HocuspocusProvider，不启用 IndexedDB。
- Awareness 字段：

```json
{
  "clientId": "uuid",
  "color": "#4f8cff",
  "selection": {
    "rowId": "uuid",
    "columnId": "beat.story"
  }
}
```

- 不传姓名；UI 只显示匿名彩色光标/选中框。
- 撤销：客户端 `Y.UndoManager`，只撤销本标签页 origin 的改动。
- 无服务器端撤销/历史 API。

### 5.9 内部服务接口（不暴露给浏览器）

API 进程调用 collab 服务的私有接口，用于服务端发起的内容写入：

```text
POST /internal/sheets/{sheetId}/rows/{rowId}/restore
POST /internal/sheets/{sheetId}/media-links/remove
POST /internal/sheets/{sheetId}/deleted
POST /internal/sheets/{sheetId}/restore
```

要求：

- 只监听 `127.0.0.1` 或 Docker 内部网络；
- 不经过 Caddy/Nginx 对外暴露；
- 请求体包含操作上下文（rowId、linkId、batchId）；
- collab 服务是唯一能把服务端命令写进 Y.Doc 的组件。

### 5.10 禁止的 API 设计

- ❌ `POST /sheets/{id}/rows` 或 `PATCH /cells/...`：会绕开 Yjs，造成双写。
- ❌ 通过表名/列名查找资源。
- ❌ 公共 bucket 或直接暴露 MinIO 凭证。
- ❌ 用 `sheet.name` 作为 WebSocket 房间名、URL 路径或对象 key。
- ❌ 在 API 中实现用户身份/权限（MVP 无认证）。

---

## 6. 页面结构

### 6.1 路由

| 路由 | 页面 | 说明 |
|---|---|---|
| `/` | 项目列表 | 无登录页 |
| `/projects/:projectId` | 项目入口 | 重定向到第一张节拍表；无集则到资产表 |
| `/projects/:projectId/sheets/:sheetId` | 表格页 | 节拍表或资产表；URL 用 sheetId |
| `/projects/:projectId/media` | 文件库 | 项目级媒体 |
| `/projects/:projectId/recycle-bin` | 回收站 | 批次恢复/彻底删除 |
| `/projects/:projectId/settings` | 项目设置 | 项目名、集管理 |
| `*` | 404 | 项目/表不存在或已删除 |

### 6.2 全局布局

**左侧栏：**

- 品牌（沐影库）：点击返回项目列表
- 项目名：双击或右键重命名；只改项目显示名，不影响表内内容或正在编辑的其他用户
- 集列表（独立滚动）：
  - 只显示集号/标题，不重复显示表名
  - 点击进入对应节拍表
  - 添加集按钮
  - 集操作菜单：鼠标右键集条目打开，包含编辑集、删除集；不显示更多图标按钮，也不提供表改名
- 固定项目工具区（不随集列表滚动）：
  - 资产表（不显示子标题或更多图标按钮，不提供表改名）
  - 文件库
  - 回收站
- 项目设置

**顶栏：**

- 项目/当前位置面包屑：
  - 节拍表页显示 `第X集 · 集标题`
  - 资产表页显示 `资产表`
  - 文件库/回收站/设置页显示对应页面名
- 主题切换（黑色/白色）
- 顶栏不显示设置图标；项目设置入口仅在侧栏底部
- 不显示匿名在线圆点、姓名或连接状态 pill；协作者正在编辑的单元格以彩色边框提示
- 仅在断线/同步时显示提示条

**内容区：**

- 表格页、文件库、回收站、设置页。

**响应式：**

- 桌面优先，最小宽度 1280px；
- 表格列宽按比例自适应，1280px 及以上不出现横向滚动；列变窄时换行、行高增加；
- MVP 不做移动端专门布局。

### 6.3 项目列表页 `/`

- 项目卡片/列表：只显示项目名、集数；不显示项目序号、日期、节拍表/资产表数量。
- 页头不显示“新建项目”按钮。
- 有项目时，项目网格末尾显示“新建项目”卡片。
- 空状态显示“创建第一个项目”按钮。
- 新建项目对话框：
  - 项目名（必填）
  - 第一集集号（默认 1）
  - 第一集标题（可选）
- 创建后跳转到第一集节拍表；项目仍可通过 API 创建。
- 空状态：还没有项目，并提供创建入口。
- 无登录、无用户菜单。

### 6.4 节拍表页

路由：`/projects/:projectId/sheets/:sheetId`

**工具栏：**

- 不显示独立 sheet-toolbar；顶栏面包屑显示集号/标题。
- 添加行入口位于表格底部，按钮在 table-shell 内水平居中。

**表格列：**

| 列 | 交互 |
|---|---|
| 场景 | 点击编辑短文本 |
| 节拍 | 只读序号，按当前行顺序显示；拖拽后自动重排 |
| 故事内容 | 点击编辑长文本，自动增高；Y.Text 协同 |
| 标注 | 颜色圆点；点击选择红/黄/绿/清除 |
| 规划 | 点击编辑长文本，自动增高；Y.Text 协同 |
| 批注 | 文本框；输入 `@` 弹出当前行视频列表；插入媒体胶囊；点击胶囊打开视频 |
| 视频 | 视频卡片列表；点击卡片播放；右键卡片移除；从系统拖入视频到该行任意单元格即可上传到该行视频列 |

**行操作：**

- 行首拖拽手柄：拖拽排序。
- 右键行：打开上下文菜单，选择“删除行”。
- 删除行确认：
  - 行进入回收站；
  - 行内媒体若仍被其他行使用，保留；
  - 无其他引用的媒体进入回收站。

**视频单元格：**

- 每个视频卡片显示：媒体图标、文件名、大小/处理状态。
- 不显示播放胶囊、上移/下移按钮或可见移除按钮。
- 点击卡片：打开播放器弹窗。
- 右键卡片：选择“移除”。
- 从系统拖入视频文件到该行任意单元格：上传到该行视频列；支持多文件。
- 右键视频单元格空白区域：从文件库添加已有视频。
- 播放器：播放/暂停、进度、音量、全屏、倍速。
- 时间码批注不在 MVP；播放器不显示批注入口。

**批注单元格：**

- 普通文本框外观，无富文本工具栏。
- 输入 `@`：下拉当前行已有的视频（未来资产行则为图片）。
- 选择后插入媒体胶囊（缩略图 + 文件名）。
- 点击胶囊：打开对应媒体查看器。
- 媒体从行中移除后：胶囊显示“已移除”，不可点击。
- 不支持 @人、回复、解决状态、通知。

**实时状态：**

- 其他匿名用户正在编辑的单元格显示彩色边框/光标。
- 无姓名标签。
- 断线时表格只读，顶部提示“已断开，正在重连”。

**空状态：**

- “还没有节拍，添加第一行。”

### 6.5 资产表页

路由：`/projects/:projectId/sheets/:sheetId`（asset sheet）

**工具栏：**

- 不显示独立 sheet-toolbar；顶栏面包屑显示“资产表”。
- 添加行入口位于表格底部，按钮在 table-shell 内水平居中。

**表格列：**

| 列 | 交互 |
|---|---|
| 类别 | 点击编辑短文本 |
| 名称 | 点击编辑短文本 |
| 集数 | 多选 episode；行内最多显示 2 个集号/标题胶囊，更多显示 `+N`，保持单行高度稳定；点击胶囊跳转对应节拍表；点击 `+N` 打开隐藏集的导航菜单，每个隐藏集可跳转，不复用“集数”选择菜单；**已删除的集不进入 `+N` 菜单和计数**；菜单最大高度 320px，集数过多时内部滚动 |
| 选定 | 单张图片缩略图；点击预览；无选中图时显示“选择图片”，有选中图时不显示“更换”按钮；右键缩略图菜单提供“更换 / 移到备选”；“移到备选”只把引用移回备选列，不删除媒体、不进入回收站 |
| 备选 | 多张图片缩略图；点击预览；右键缩略图移除；从系统拖入图片到该行任意单元格即上传到备选列 |
| 批注 | 文本框；输入 `@` 弹出当前行图片（选定 + 备选）；插入媒体胶囊 |

**选定/备选交互：**

- “选择图片”/右键“更换”只打开当前行已有备选的选择器，不提供上传或从项目文件库选择。
- 有选定图时不显示可见“更换”按钮，必须右键缩略图选择“更换”或“移到备选”。
- “移到备选”：选定的引用移回备选列，媒体本体保留，不进入回收站。
- 当前行没有备选时，选择器显示空状态，提示先在备选列添加图片。
- 备选图片预览中提供“设为选定”按钮。
- 点击后：
  - 该图从备选移到选定；
  - 原选定图回到备选；
  - 不进入回收站。
- 选定单元格始终最多一张图。
- 备选可以为空。
- 同一张图不会同时出现在选定和备选中。
- 备选缩略图为 68×50，按单元格宽度换行；超过 10 张会继续增加行高（实测 11 张为 4+4+3 排列，行高约 179px）。

**图片查看器：**

- 灯箱打开原图；
- 鼠标滚轮以鼠标位置为中心缩放（25%–400%），不显示缩放工具栏；
- 放大后按住鼠标拖动平移；双击图片区域重置缩放和位置；
- 显示文件名；
- 可在当前行的选定/备选之间切换；
- 备选图片显示“设为选定”；
- 不做图片标注/画笔。

**批注：**

- @ 只列当前行已有的图片；
- 图片被移除后，胶囊显示“已移除”；
- 无 @人/回复/通知。

**行删除：**

- 行进入回收站；
- 选定/备选图片若仍被其他行使用，保留；
- 无其他引用的图片进入回收站。

**空状态：**

- “还没有资产，添加第一行。”

### 6.6 文件库页

路由：`/projects/:projectId/media`

采用 Windows 资源管理器式大图标网格，不显示左侧文件夹树：

**工具栏：**

- 上一级、面包屑、类型筛选、使用状态筛选、文件名搜索。

**大图标网格：**

- 文件夹卡片：大文件夹图标 + 文件夹名 + “文件夹”；文件夹包括 `第X集` → `第X拍`、`资产表` → 类别 → 名称 → 选定/备选、`成片` → `第X集`、`文件库`（直接上传）。
- `成片` 及其 `第X集` 子文件夹是虚拟文件夹，由当前有效集生成；即使还没有文件也显示，便于直接上传。物理目录在首次上传时创建。
- 成片文件不限制数量，每集可以有多个文件（例如 A/B 两版并存）。
- 新建项目默认包含：第 1 集、该集节拍表、项目资产表，以及文件库中可见的 `成片` / `成片 / 第1集` 虚拟文件夹。
- 文件卡片：大缩略图（图片）或媒体图标（视频）+ 文件名 + 类型/大小；搜索时显示所在文件夹。
- 单击卡片选中；双击文件夹进入；双击文件打开视频播放器/图片灯箱。
- 文件夹和文件按名称排序，文件夹排在文件之前。
- 右键文件：
  - 下载原文件
  - 重命名显示名（只改 `display_name`，不改 `storage_key`）
  - 删除（若仍被使用，提示使用位置；可确认强制删除）
- 右键文件夹：
  - 打开
  - 下载文件夹（ZIP）：以被右键的文件夹为 ZIP 根目录，保留其下层级
- 文件卡片可拖拽；拖到表格行可把已有媒体挂到对应行。

**文件夹下载（ZIP）：**

- 下载范围按文件库当前显示目录计算，而不是按物理 `storage_key` 目录；资产图片的选定/备选角色、共享媒体的当前显示位置都会反映在 ZIP 中。
- 只打包当前未删除的媒体；缺失原文件跳过，并在 ZIP 内生成 `_缺失文件.txt`。
- 使用流式 ZIP（store，不压缩），不在内存中聚合文件；支持大视频。
- ZIP 文件名使用所选文件夹名，例如 `第1集.zip`；条目从 `第1集/...` 开始。
- 打包过程创建内存中的归档任务，前端轮询进度：`totalFiles / processedFiles`、`totalBytes / processedBytes`、状态。
- 文件库右下角显示非模态进度面板（标题、进度条、已处理文件数/字节）；打包完成后提示“浏览器正在下载”，6 秒后自动收起，也可手动关闭。
- 同一时间前端只允许一个打包任务；关闭进度面板不会中断已经开始的浏览器下载。

**上传：**

- 支持从系统资源管理器一次拖入多个文件到文件库当前文件夹。
- 拖放时显示虚线高亮覆盖层和“松开即可上传到当前文件夹”提示；覆盖层不拦截鼠标事件。
- 上传按当前文件夹规则过滤类型；错误类型跳过，全部不符合时提示；多个文件顺序上传。
- 拖入文件与顶部上传按钮共用同一套文件夹规则和提示；内部文件卡片拖拽不会被当作系统文件上传。

文件库顶部上传按当前文件夹决定存储位置、类型和是否自动挂表：

- 在 `第X集 / 第Y拍` 文件夹：
  - 只接受视频；按钮显示“上传视频”。
  - 文件存到 `第X集 / 第Y拍`。
  - 上传成功后自动把视频挂到第 X 集节拍表第 Y 拍（按当前有效行顺序）；节拍表无需刷新即可收到 Yjs 更新。
- 在 `第X集` 文件夹（未进入具体节拍）：
  - 只接受视频；文件存到 `第X集 / 未分拍`，不自动挂表。
- 在 `资产表 / 类别 / 名称 / 选定` 文件夹：
  - 只接受图片；按钮显示“上传图片”。
  - 文件存到该角色文件夹，并自动设为该“类别 + 名称”资产行的选定图；原选定图回到备选。
- 在 `资产表 / 类别 / 名称 / 备选` 文件夹：
  - 只接受图片；文件存到该角色文件夹，并自动追加到该资产行的备选列。
- 资产表每个有效行都会在文件库生成 `选定` 和 `备选` 两个虚拟文件夹，即使为空，也可以直接上传。
- 在 `资产表 / 类别` 或 `资产表 / 类别 / 名称`（没有角色文件夹）：
  - 只接受图片；按类别/名称归档，不自动挂表。
- 在 `资产表` 文件夹：
  - 只接受图片；存到 `资产表 / 未分类`。
- 在 `成片 / 第X集` 文件夹：
  - 只接受视频；可上传多个文件，不限制版本数。
  - 不自动挂到节拍表，成片列不会出现在节拍表视频列。
- 在 `成片` 根文件夹：
  - 只接受视频；存到 `成片 / 未分集`，不自动挂表。
- 在 `文件库` 或其他根位置：
  - 视频和图片都可上传；存到 `文件库`。
- 上传后停留在当前文件夹；文件库上传在根位置时进入 `文件库`。
- 类型错误文件会被跳过并提示；后端同时按 MIME/扩展名校验 `video`/`image`，并校验 `columnId` 与媒体类型一致，不能绕过前端上传错误类型。
- 从表格行拖入系统文件仍按行上下文上传：节拍行只接受视频，资产行只接受图片。

**删除：**

- 未被使用：确认后进入回收站。
- 仍被使用：弹出使用位置列表；确认“强制删除”后：
  - 从所有 Yjs 单元格移除该媒体；
  - 媒体进入回收站；
  - 相关行保留，媒体槽位变空。

**无跨项目：**

- 只显示当前项目媒体；
- 不提供“从其他项目导入”。

### 6.7 回收站页

路由：`/projects/:projectId/recycle-bin`

采用与文件库一致的大图标网格：

**工具栏：**

- 类型筛选：全部 / 行 / 整集 / 媒体
- 显示当前分类的批次数

**批次卡片：**

- 整集批次显示为**文件夹卡片**（大文件夹图标）；行批次显示行图标；媒体批次显示图片缩略图或视频图标。
- 卡片标题：集号/集标题 + 行摘要，或媒体文件名。
- 元信息：批次类型、行数（整集）、引用媒体数、仍在使用数、删除时间。
- 整集/行卡片不显示引用媒体缩略图条；引用媒体在文件夹视图内查看。
- 引用媒体包括本批次已删除的媒体，以及仍被其他表引用、本体未删除的媒体；后者在文件夹视图显示绿色“仍在使用”徽标，已删除媒体不显示删除徽标或“媒体已移入回收站”文案。
- 多媒批次在缩略图右上角显示引用媒体数量。
- 不可恢复的批次显示“不可恢复”徽标和阻塞原因。

**文件夹视图：**

- 双击整集/行卡片进入文件夹视图；媒体批次双击直接预览媒体。
- 文件夹视图与文件库一致：大图标网格、上一级、面包屑。
- 整集文件夹内按引用媒体的存储路径显示节拍文件夹（如 `第4集` 文件夹内是 `第1拍`、`第2拍`），点进节拍文件夹查看媒体。
- 行批次按完整媒体存储路径显示文件夹层级。
- 文件夹/媒体卡片右键仍打开该批次的“恢复 / 彻底删除”菜单。
- 文件夹卡片双击进入下一级；媒体卡片双击打开视频播放器或图片灯箱。
- 媒体卡片显示类型/大小；共享媒体额外显示绿色“仍在使用”徽标。

**操作：**

- 单击卡片选中。
- 鼠标右键卡片打开菜单：
  - 恢复
  - 彻底删除
- 卡片上不显示恢复/彻底删除按钮。
- 单批“彻底删除”只弹普通确认框，不要求输入文字。
- 顶部“清空回收站”仍为高强度二次确认，必须输入 `DELETE`。

**恢复规则：**

- 行批次：恢复行、行内媒体引用、同一批次内仍在回收站的媒体。
- 表批次（删除整集）：恢复集、节拍表、行、本批次删除的媒体；仍被其他表引用的媒体无需恢复，直接重新建立引用。
- 媒体批次：恢复到媒体库，不自动挂回行。
- 如果依赖项还在回收站（例如行所属的节拍表被删），显示阻塞原因；先恢复表批次。

**引用关系与彻底删除：**

- 删除整集/行时，只有不再被任何表引用的媒体才会标记为删除并进入本批次。
- 仍被其他表引用的媒体保留本体，只删除本批次的引用；它会显示在回收站文件夹的引用媒体中，但不计入“已删除媒体”。
- 彻底删除时，只删除本批次内已删除的媒体本体；共享媒体只删除本批次引用，文件本体保留。
- 二次确认；有共享媒体时提示“只会删除本批次引用，不会删除媒体本体”。

**彻底删除内容：**

- 删除数据库记录；
- 删除本批次内已删除媒体的原文件/代理/缩略图；
- 表批次还会删除该表的 Yjs updates/snapshots；
- 不删除仍被其他表引用的媒体本体。

**空状态：**

- 无任何批次：“回收站是空的。”
- 当前筛选分类为空：“这个分类没有内容。”

### 6.8 项目设置页

路由：`/projects/:projectId/settings`

内容：

- 项目名（可修改）
- 集列表：
  - 第 X 集 / 集标题
  - 添加集（自动创建 8 行空白节拍表）
  - 编辑集号/标题
  - 删除集（整批进回收站）
- 不显示“表名”区块，也不提供表改名。
- 无成员/权限/邀请/登录设置。

项目删除不在 MVP 范围。

### 6.9 通用交互与状态

- **点击编辑**：不做 Excel 式键盘导航、区域选择、批量填充。
- **保存**：单元格编辑实时写入 Yjs，无“保存”按钮。
- **连接状态**：
  - 已连接：正常编辑
  - 重连中：只读，提示
  - 已断开：只读，提示；恢复后自动重新加载
  - 切换节拍表时连接会瞬间重置为 `connecting`；这个瞬时状态不显示横幅，仅真实断线（`disconnected`）时提示，避免蓝色横幅闪一下
- **匿名在线状态**：彩色点/光标，无姓名。
- **确认对话框**：
  - 删除行
  - 删除集
  - 删除媒体
  - 彻底删除/清空回收站
- **错误提示**：
  - 项目/表不存在
  - 媒体上传失败/处理失败
  - 媒体仍在使用
  - 回收站依赖阻塞
  - 连接失败
- **加载状态**：骨架屏/加载指示。
- **语言**：中文 UI。
- **字体/静态资源**：本地打包，不依赖外网 CDN。

---

## 7. 实时协同与数据流

### 7.1 初始加载

1. 客户端请求 `GET /api/projects`。
2. 进入项目后请求 `GET /api/projects/{id}`，拿到集、表、资产表。
3. 进入表格页：
   - `GET /api/sheets/{sheetId}` 获取表元数据和列定义；
   - 连接 `/collab`，文档名 `sheet:{sheetId}`；
   - Hocuspocus 返回最新 Y.Doc 状态；
   - 客户端按 `position` 排序、过滤 tombstone，渲染行；
   - `beat_no` 由可见行顺序计算。
4. 订阅 `GET /api/projects/{id}/events` SSE。
5. 媒体单元格通过 REST 获取资产元数据和缩略图 URL。

### 7.2 单元格编辑

- 短文本：直接写 Y.Map 字符串。
- 长文本：Y.Text 插入/删除，字符级合并。
- 标注：写枚举字符串。
- 集数：Y.Array 增删 episode ID。
- 视频/备选：Y.Array 增删有序 link。
- 选定：写/清空 Y.Map。
- 批注：Y.Text 编辑 + mentions Y.Map 增删。
- 所有编辑在一个 Yjs transaction 内提交；Hocuspocus 广播；投影 worker 异步落 SQL。
- 不经过 REST；不整表保存。

### 7.3 行新增/删除/排序

- 新增行：客户端生成 row UUIDv7，写入 `rows` Y.Map，position 为 fractional index。
- 删除行：设置 `deleted=true`、`deletionBatchId`、`deletedAt`；不物理移除。
- 排序：只更新被移动行的 position；客户端重新排序。
- 节拍序号：由排序后的可见行计算，不写任何值。
- 投影 worker 根据 tombstone 和 batch 更新 SQL 与回收站。

### 7.4 媒体上传/处理

1. 客户端生成 assetId，调用上传会话接口。
2. 直接 PUT 到 MinIO。
3. 调用 complete，服务端入队。
4. worker 处理：
   - 图片：缩略图；
   - 视频：探测、封面、代理；
   - 更新状态，SSE 通知。
5. 客户端在单元格中插入 link（Yjs），此时可以引用处理中的资产；UI 显示状态。
6. ready 后可播放/查看。

### 7.5 行删除与回收站

1. 客户端在 Yjs 中标记行删除，生成 batchId。
2. 投影 worker：
   - 更新 rows 删除字段；
   - 将该行 media_links 标记删除；
   - 对每个 asset 统计活跃 link；
   - 无活跃 link 的 asset 标记删除，归入同一 batch；
   - 创建/更新 deletion_batches。
3. SSE `recycle_bin.changed`。
4. 其他客户端从 Yjs 收到行 tombstone，行消失；媒体仍被其他行引用时不受影响。
5. 回收站页面按 batch 展示。

### 7.6 媒体多行复用

- 同一 asset 可被多个 sheet/row/column 引用。
- `media_links` 每个引用一行。
- 删除任一 link：
  - 只删除该 link；
  - 若 asset 仍有活跃 link，asset 保留；
  - 若没有活跃 link，asset 进入回收站。
- 强制删除媒体资产：
  - 通过 collab 服务移除所有引用；
  - asset 进入回收站。

### 7.7 表名（内部元数据）

当前 Web UI 不提供表改名，表名仅作为内部默认标签存在（如 `第1集 节拍表`、`资产表`）。页面上用集号/标题或“资产表”定位，不显示表名。

- 后端保留 `PATCH /api/sheets/{id}` 与 SSE `sheet.renamed` 作为兼容能力。
- 如被调用，只更新 Postgres `name`、`metadata_revision`；不写 Y.Doc、不重连、不重挂载、不改变单元格版本。
- 不暴露表名后，用户不会因为“集标题已改但表名没改”产生混淆。

### 7.8 删除整集

1. `DELETE /api/episodes/{id}`。
2. 创建 sheet batch，标记 episode/sheet 删除。
3. 通知 collab 服务：该 sheet 只读/关闭。
4. 投影 worker 处理该表 rows/links/media：
   - 只被该表使用的媒体进入 batch；
   - 仍被资产表或其他表使用的媒体保留。
5. 资产表中该集的引用保留，显示“已删除”。
6. 恢复整批时，集、节拍表、行、媒体一起恢复。

### 7.9 断线重连

- 无离线编辑。
- HocuspocusProvider 自动重连。
- 断开期间表格只读。
- 重连成功后重新同步 Y.Doc；客户端以服务端状态为准。
- 不把断开期间的本地输入排队重放。

---

## 8. 媒体管线

### 8.1 支持格式

| 类型 | MVP 支持 | 处理 |
|---|---|---|
| 视频 | MP4 (H.264/AAC) | 浏览器可直接播放；生成封面；可选转 720p/1080p 代理 |
| 视频 | MOV/ProRes/HEVC/其他 | FFmpeg 转 H.264/AAC MP4 代理 |
| 图片 | JPEG/PNG/WebP | 生成缩略图；原图用于灯箱 |
| 图片 | PSD/TIFF | 后续版本；MVP 不支持或仅提示 |
| 图片 | SVG | 不建议支持；如支持必须消毒 |

### 8.2 处理状态机

```text
uploading → processing → ready
                     ↘ failed
```

- `uploading`：已创建资产，等待文件上传。
- `processing`：已收到文件，worker 处理中。
- `ready`：缩略图/代理可用。
- `failed`：处理失败；保留错误信息；可删除/重新上传。

### 8.3 视频处理

- `ffprobe` 获取时长、分辨率、编码、旋转。
- 生成 poster（例如第 1 秒）。
- 如果不是浏览器友好格式，转 H.264/AAC MP4，`faststart`。
- 代理分辨率默认 720p；可配置 1080p。
- MVP 不做 HLS；后续需要时再加。
- 播放优先代理；原文件不直接对外。

### 8.4 图片处理

- `sharp`/`libvips` 生成缩略图（例如最长边 480px，WebP/JPEG）。
- 原图保留用于灯箱。
- 读取宽高。
- PSD/TIFF 后置。

### 8.5 存储与 URL

- 私有桶，不公开。
- 对象 key：

```text
projects/{projectId}/第{episodeNumber}集/第{beatNumber}拍/{safeFilename}
projects/{projectId}/资产表/{category}/{assetName}/{选定|备选}/{safeFilename}
projects/{projectId}/成片/第{episodeNumber}集/{safeFilename}
projects/{projectId}/文件库/{safeFilename}

# 系统派生文件
projects/{projectId}/media/{assetId}/thumbnail/{name}.webp
projects/{projectId}/media/{assetId}/proxy/{name}.mp4
```

- 原始文件按表结构归档；缩略图/代理文件留在系统派生目录。
- 同一媒体被多行复用时，原始文件按上传时的集/节拍或类别/名称/角色归档；所有引用使用 `asset_id`，移动行或改名不会断链。
- 文件库展示资产图片时，优先按当前活跃引用的角色（选定/备选）归入虚拟角色文件夹；角色切换后展示会随媒体列表刷新。

- API 返回短时预签名 URL（默认 1 小时）。
- MinIO 配置 CORS，允许应用 origin 的 GET/PUT。
- 媒体删除先软删除；彻底删除时移除对象。

### 8.6 引用计数

- 活跃 link：`media_links.deleted_at is null`。
- 删除行/单元格时只处理 link。
- asset 的活跃 link 数为 0 时，才进入回收站。
- 回收站中的 asset 仍有活跃 link 属于异常；投影/清理任务应对账并修复。

---

## 9. 部署与运行

### 9.1 Docker Compose 服务

```text
web      — Vite 构建产物，Caddy/Nginx 提供静态文件
api      — Fastify REST + SSE
collab   — Hocuspocus WebSocket + Yjs 持久化
worker   — pg-boss 消费者：媒体处理、投影、回收站清理
postgres — PostgreSQL 16
minio    — 对象存储
caddy    — 反向代理/HTTPS（可选自签名）
```

- pg-boss 运行在 api/worker 内，不需要 Redis。
- 单机单 collab 实例，不需要 Redis 广播。
- 未来多实例时再加 Redis/Hocuspocus Redis extension。

### 9.2 网络

- 只绑定局域网地址。
- 不暴露公网；不使用云存储/CDN。
- 前端静态资源、字体、依赖全部本地化。
- 可选：自签名 HTTPS；如果使用 HTTP，部分浏览器 API（如剪贴板）可能受限，但本 MVP 不依赖。
- CORS 仅允许应用 origin。
- 上传大小限制可配置。

### 9.3 备份

- Postgres 每日 dump；保留 7–30 天。
- MinIO 媒体目录/桶同步到 NAS/外置盘。
- 定期做恢复演练。
- 回收站不是备份；彻底删除后不可恢复。

### 9.4 日志与监控

- Pino 结构化日志。
- 记录：
  - HTTP 请求/错误
  - WebSocket 连接数
  - 媒体处理任务失败
  - 投影延迟/失败
  - 回收站清理结果
- 局域网可能无外网，不使用云 Sentry；可选自托管错误收集或仅本地日志。
- 健康检查：`GET /healthz`（api）、collab 端口、worker 心跳。

### 9.5 资源

- FFmpeg 转码吃 CPU；视频量大时限制 worker 并发。
- 磁盘主要被媒体占用；监控剩余空间。
- 局域网带宽影响多人同时播放；代理文件降低码率。

---

## 10. 验收标准

以下全部满足才算 MVP 完成：

### 10.1 项目与集

- [ ] Root 页头不显示新建项目按钮；空状态和项目网格可创建项目；新建项目自动创建第 1 集、节拍表、资产表。
- [ ] 新增一集自动创建 8 行空白节拍表。
- [ ] 删除一集后，该集节拍表、行、无其他引用的媒体进入同一个回收站批次。
- [ ] 恢复该批次后，集、节拍表、行、媒体恢复。
- [ ] 资产表“集数”可多选；点击集号/标题打开对应节拍表。

### 10.2 节拍表

- [ ] 固定列正确显示：场景、节拍、故事内容、标注、规划、批注、视频。
- [ ] 场景/故事内容/规划可编辑并实时同步。
- [ ] 标注只能选红/黄/绿/空。
- [ ] 节拍是只读序号，按行顺序显示；拖拽行后自动重排。
- [ ] 一个节拍行可添加多条视频；点击卡片播放；右键卡片移除。
- [ ] 视频可播放/暂停/全屏/倍速。
- [ ] 批注输入 `@` 只显示当前行视频；插入胶囊；点击打开视频。
- [ ] 视频从行中移除后，批注胶囊显示“已移除”。

### 10.3 资产表

- [ ] 固定列正确显示：类别、名称、集数、选定、备选、批注。
- [ ] 类别/名称可编辑。
- [ ] 集数可多选 episode；点击跳转。
- [ ] 选定最多一张图片；备选多张、可排序。
- [ ] 备选图片预览中“设为选定”：该图成为选定，原选定回到备选。
- [ ] 批注 @ 只显示当前行图片。
- [ ] 图片灯箱支持缩放/平移。

### 10.4 媒体库与复用

- [ ] 项目级媒体库只显示当前项目媒体。
- [ ] 上传视频/图片，显示处理状态，ready 后可播放/查看。
- [ ] 同一媒体可被多行引用。
- [ ] 删除一行时，仍被其他行引用的媒体保留；无其他引用的媒体进入回收站。
- [ ] 从单元格移除媒体后，若不再被引用，进入回收站。
- [ ] 强制删除仍被引用的媒体会移除所有引用并进入回收站。
- [ ] 回收站恢复媒体后，媒体回到媒体库；行批次恢复会恢复原引用。

### 10.5 协同与集信息

- [ ] 两个浏览器同时编辑不同单元格，互不覆盖。
- [ ] 两个浏览器同时编辑同一长文本，字符级合并。
- [ ] 在线状态显示匿名彩色光标/选中框，无姓名。
- [ ] A 修改集号/标题时 B 正在编辑：
  - B 焦点不变；
  - 滚动位置不变；
  - 选区不变；
  - 未提交输入不丢；
  - WebSocket 不断开；
  - URL 不变；
  - B 看到面包屑和集列表标签更新。
- [ ] 编辑集不改变任何行/单元格版本，不触发重挂载。
- [ ] 断线后表格只读，恢复后继续同步；无离线编辑。

### 10.6 无认证与匿名

- [ ] 没有登录页/用户菜单/权限按钮。
- [ ] 局域网内打开即可编辑。
- [ ] 不在 UI 显示用户姓名；回收站不显示“谁删除”。
- [ ] 服务端无用户/角色表。

### 10.7 表格操作

- [ ] 点击编辑；无 Excel 式键盘导航/批量填充。
- [ ] 行可拖拽排序。
- [ ] 右键行可打开菜单并删除行，删除有确认。
- [ ] 编辑集号/标题不影响表内容。

### 10.8 运行与部署

- [ ] Docker Compose 可在局域网单机启动。
- [ ] Postgres、MinIO、api、collab、worker、web 全部健康。
- [ ] 媒体上传/播放不经过 API 中转大文件。
- [ ] 备份和恢复流程可用。

---

## 11. 假设与待确认项

以下按当前理解写成默认值；如果哪条不对，请在确认时指出：

1. **节拍序号**：只读，按行顺序自动生成；拖拽后自动重排。若需要手填数字/字母（如 3A），改为可编辑文本。
2. **资产跨集**：一行资产可勾选多集，选定/备选对所选各集共用一套。某集造型不同则复制一行，集数只勾该集。若需要“一行内每集不同图”，需增加 per-episode 选图层，MVP 不做。
3. **项目创建**：Root 页头不提供新建按钮，空状态/项目网格提供创建入口；新建项目默认创建第 1 集与资产表，其他集后续添加。
4. **表名不作为用户概念**：Web UI 不提供表改名；节拍表通过集号/标题定位，资产表固定显示“资产表”。内部 `sheets.name` 仅保留默认标签供兼容。
5. **媒体复用**：项目内允许多行复用；回收站按活跃引用计数。
6. **媒体版本**：MVP 不做文件版本树；替换媒体 = 新建资产，旧资产按引用/回收站规则处理。
7. **视频**：H.264/AAC MP4 直接播；其他格式转 720p/1080p MP4 代理；MVP 不做 HLS；时间码批注后续。
8. **图片**：JPEG/PNG/WebP；PSD/TIFF 后续。
9. **表格组件**：MUI X Data Grid Community 优先；如果自定义单元格/自适应行高不满足，再换 TanStack Table + Virtual。
10. **无历史 UI**：提供每标签页 undo/redo 和回收站，不做“恢复到任意版本/逐单元格审计”。
11. **无导入/导出**：CSV/Excel 导入导出不在 MVP。
12. **无项目删除**：项目删除/归档不在 MVP。
13. **无公网**：按可信局域网设计；公网必须另加认证/HTTPS/权限。
14. **SSE 事件**：不做事件回放；重连后重新拉取元数据。
15. **媒体上传**：MVP 单次预签名 PUT；超大文件再增加分片/断点续传。

---

## 12. 技术栈

| 层 | 选择 |
|---|---|
| 前端 | React + TypeScript + Vite |
| 表格 | MUI X Data Grid Community；dnd-kit 行拖拽 |
| 状态 | TanStack Query + Zustand |
| 协同 | Yjs + Hocuspocus；HocuspocusProvider；不使用 y-indexeddb |
| 后端 | Node.js + TypeScript + Fastify；Zod 校验；REST + SSE |
| 数据库 | PostgreSQL 16 + Drizzle ORM |
| 队列 | pg-boss（Postgres 队列） |
| 存储 | MinIO（局域网服务器/NAS） |
| 媒体 | FFmpeg/ffprobe + sharp/libvips |
| 部署 | Docker Compose + Caddy/Nginx |
| 测试 | Vitest + Playwright |
| 日志 | Pino |
| 明确不用 | 认证库、RBAC、JWT、Redis、y-indexeddb、云存储/CDN、富文本编辑器 |

说明：

- 批注是普通文本框 + 媒体引用，不需要 TipTap/ProseMirror。
- 视频播放使用原生 `<video>` 控件 + 倍速/全屏；未来需要 HLS 时再加 hls.js。
- 图片灯箱使用轻量 lightbox 库。
- 所有 ID 使用 UUIDv7；行顺序使用 fractional-indexing 库。

---

## 13. 本地成品实现说明

本仓库同时包含一个可运行的局域网成品。由于交付环境没有 Docker 和 FFmpeg，成品在保持数据模型、API 边界和交互语义不变的前提下，做了三处可替换适配：

1. **PostgreSQL → Node.js 内置 `node:sqlite`**
   - 表结构、UUIDv7、软删除、删除批次、外键关系保持一致。
   - 本地演示库为 `data/app.db`；切换生产时替换 `apps/api/src/db.ts` 与 ORM 层即可。
2. **MinIO/S3 + FFmpeg → 本地文件 + `sharp`**
   - 上传文件保存在 `data/uploads/`；图片生成 WebP 缩略图；视频按浏览器可播的 MP4 直接提供。
   - 不做服务端转码/HLS；生产环境接 MinIO/S3 与 FFmpeg worker 时，API 契约不变。
3. **MUI X Data Grid Community → 自定义固定列表格 + dnd-kit**
   - MUI X Community 对行拖拽和自适应行高支持不足；按第 12 节 fallback 采用自定义表格。
   - 点击编辑、固定列、自定义媒体单元格、匿名协同选中框、行拖拽均已实现。

成品还包含一份演示数据（项目“雾港”、2 集、资产表、文件库、截图），运行方式与验收脚本见根目录 `README.md`。
```


---

## 14. UI 修订（已实现）

按交付反馈，界面与交互做了以下调整：

- **双主题**：黑色 / 白色两套配色，右上角太阳/月亮按钮切换；选择保存在 `localStorage` 的 `frame-theme`。
- **图标**：统一使用 Lucide（`lucide-react`），不再使用 MUI Icons。
- **去除描述性元素**：
  - 不显示匿名/无登录标签；
  - 不显示 `Yjs 实时协同 / 项目级媒体库 / 按批次回收站 / 无登录 · 可信局域网` 等页脚描述；
  - 不显示 eyebrow（大写小标签）；
  - 不显示连接状态 pill；
  - 不显示 presence 文案或匿名彩色圆点；协作者正在编辑的单元格以彩色边框提示。
- **行删除**：去掉行尾删除按钮列，改为在行上右键打开上下文菜单，选择“删除行”；仍保留确认对话框。
- **文件库右键菜单**：下载、重命名、删除；重命名只改显示名，不改存储路径。
- **文件库**：Windows 资源管理器式大图标网格，无左侧文件夹树；单击选中、双击文件夹进入/文件预览；右键下载/重命名/删除；文件卡片显示大缩略图/媒体图标、文件名、类型与大小，搜索时显示所在文件夹。
- **文件库按表结构分组**：文件夹卡片展示 `第X集 / 第X拍 / 视频`、`资产表 / 类别 / 名称 / 选定|备选 / 图片`、`文件库`。
- **侧栏**：集条目右键仅提供“编辑集 / 删除整集”；资产表不再提供右键改名；不显示 episode-more/nav-more 图标按钮，资产表不显示 nav-sub 子标题。
- **表名移除**：顶栏面包屑改为显示集号/标题（资产表页显示“资产表”）；移除集菜单的“重命名节拍表”、资产表的右键改名、设置页“表名”区块及其重命名铅笔按钮；内部 `sheets.name` 仅保留默认标签。
- **顶栏**：只保留主题切换，不再显示设置图标；项目设置入口保留在侧栏底部。
- **回收站**：改为与文件库一致的大图标网格；支持全部/行/整集/媒体筛选；整集批次显示为文件夹卡片；双击进入文件夹视图，按媒体存储路径显示节拍/类别文件夹，可继续点进并预览媒体；仍被其他表引用的媒体带“仍在使用”标记，彻底删除不会删本体；卡片右键“恢复 / 彻底删除”，不再显示卡片内操作按钮；根卡片不再显示引用媒体缩略图条，文件夹内媒体不再显示“已删除”徽标和“媒体已移入回收站”文案。
- **集数 +N**：`+N` 改为打开隐藏已选集的导航菜单，每个隐藏集可跳转，不再复用“集数”选择菜单；已删除的集不显示、不计数；集数选择菜单也不再显示已删除集；+N 与选择菜单按集号排序。
- **选定图**：有选中图时不再显示“更换”按钮；右键缩略图菜单提供“更换 / 移到备选”；“移到备选”不删除媒体、不进入回收站。
- **图片查看器**：去掉缩放工具栏；滚轮以鼠标位置为中心缩放，放大后可拖动平移，双击重置。
- **文件库文件夹上传**：`第X集 / 第Y拍` 只接受视频并自动挂到第 X 集第 Y 拍；`资产表 / 类别 / 名称 / 选定|备选` 只接受图片并自动设置该资产行的选定/备选；每个资产行生成空的选定/备选虚拟文件夹；其他根位置可上传视频/图片。后端校验 MIME/扩展名、`video`/`image` 以及节拍表/资产表列上下文。
- **资产文件夹展示**：资产图片按当前活跃引用的角色归入虚拟的选定/备选文件夹；表内切换角色后，文件库刷新即显示在对应角色文件夹。
- **表格页**：不显示 sheet-toolbar；添加行按钮位于表格底部并水平居中。
- **拖拽上传**：从系统拖入视频到节拍行任意单元格 → 该行视频列（只接受视频）；拖入图片到资产行任意单元格 → 该行备选列（只接受图片，不会自动设为选定）。
- **从文件库添加**：视频/备选单元格空白区域右键 → 从文件库选择已有媒体；不显示添加按钮。
- **侧栏**：项目名双击/右键重命名；品牌点击返回项目列表；集列表独立滚动，资产表/文件库/回收站固定在底部。
- **项目卡片**：只显示项目名和集数，不显示项目序号/日期/表数量。
- **滚动条稳定**：侧栏集列表、表格容器、文件库网格使用 `scrollbar-gutter: stable`，避免滚动条出现/消失造成布局跳变；已用 20+ 集数据验证。
- **浅色状态徽标**：处理中/失败徽标适配浅色背景；就绪状态不再显示徽标。
- **文件存储按表结构**：
  - 节拍表视频：`projects/{projectId}/第{episodeNumber}集/第{beatNumber}拍/`
  - 资产表图片：`projects/{projectId}/资产表/{category}/{assetName}/{选定|备选}/`
  - 成片：`projects/{projectId}/成片/第{episodeNumber}集/`（每集多个文件，不自动挂表）
  - 文件库直接上传：`projects/{projectId}/文件库/`
- **输入控件**：所有 MUI `TextField` / `FormControl` 替换为自定义原生输入框，DOM 中不再出现 `MuiTextField-root`、`MuiFormControl-root`、`css-ghwvnd`。
- **表格**：使用自定义固定列表格 + dnd-kit；点击编辑；行拖拽排序；无 Excel 式键盘操作。
- **媒体单元格**：
  - 去掉播放胶囊；点击视频卡片直接播放；
  - 去掉视频/备选的上移、下移；
  - 去掉可见移除按钮；在视频卡片、选定图、备选图上右键选择“移除”；
  - 去掉图片文件名 caption；
  - 去掉 `cell-placeholder`，空单元格不显示占位提示。
- **侧栏**：不再重复显示集序号（episode-index）和节拍表名（episode-sheet），只保留集标题。
- **图标清理**：项目空状态符号、加号等改用 Lucide，不再有硬编码字符图标。

### 视觉系统统一（2026-10）

- **设计 token**：颜色、字号、间距、圆角、阴影、动效统一使用 `styles.css` 中的 `--*` 变量；浅色为暖中性纸白（`#f5f4f1`），深色为中性石墨（`#0a0b0d`），强调色为琥珀金。
- **字体**：自托管 MiSans Regular / Medium / Semibold（400/500/600；700 映射到 600），字体文件位于 `apps/web/public/fonts/` 并附授权说明；全站只有 14 / 16 / 18px 三档：菜单/下拉选项 18px，标题 18px，正文/表格单元格/按钮/侧栏 16px，表头/说明文字/徽标/计数/状态胶囊 14px；数字使用 `tabular-nums`。
- **页面骨架**：项目内页面（节拍表、资产表、文件库、回收站、项目设置）共享顶栏面包屑和 24px 内容边距；节拍表、资产表、文件库、回收站铺满工作区，不再使用 1680px 最大宽度；表格列宽按比例自适应，1280/1440/2560 均无横向滚动，列变窄时换行、行高增加；项目列表保留独立的 Root 页头。文件库、回收站、项目设置移除重复的大号页标题，文件库上传与回收站清空操作移入工具栏。
- **视口填充**：工作区固定为 100vh，表格容器、文件库、回收站使用 flex 填充剩余高度，不再依赖 `calc(100vh - Npx)`；表格和文件网格自带滚动。
- **布局稳定**：首屏前通过内联脚本应用 `data-theme`；滚动容器使用 `scrollbar-gutter: stable`；图片舞台设置最小高度，视频元素预留 16:9，避免媒体加载导致弹窗跳动。
- **动效**：统一 140ms / 180ms 与 `cubic-bezier(.2,0,0,1)`；MUI 菜单、弹窗、Snackbar 使用同一组时长/缓动；支持 `prefers-reduced-motion`。
- **品牌**：图标使用透明底 Aqua 3D 胶卷/金色夕阳插画，资源位于 `apps/web/public/brand/`（256/512 透明 WebP，源图 1024 透明 PNG）；favicon 使用透明底 `favicon-16/32/64/128.png`，`apple-touch-icon.png` 使用暖白底；字标与空状态标识共用同一图标；加载态使用简短字标而不是长字母间距。
- **明暗适配**：状态徽标、标记点、选中态、主按钮、文件库选中卡片均使用语义 token；选中态统一为琥珀色，蓝色仅用于提及、输入焦点和拖拽目标。
- **滚动条槽覆盖**：表头通过顶部同色背景带覆盖右侧 gutter；行 hover 时用一条 10px 的右侧覆盖条跟随当前行，颜色与行 hover 完全一致，覆盖滚动条槽但不改变列宽或滚动行为。

以上均已在本仓库的本地成品中实现并实际验证。

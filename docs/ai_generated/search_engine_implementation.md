# 搜索引擎实现细节

本文档描述了搜索引擎当前的 Rust 后端实现。
它通过解释引擎内部的工作原理（数据结构、算法、缓存和排名）来补充 `docs/search_engine_commands.md` 中的命令/API 文档。

主要代码位置：

- `src-tauri/src/search_engine/search_core.rs`（策略编排）
- `src-tauri/src/search_engine/art_v5.rs`（ART 前缀树）
- `src-tauri/src/search_engine/fast_fuzzy_v2.rs`（基于三元组的模糊搜索）
- `src-tauri/src/search_engine/lru_cache_v2.rs`（LRU + TTL 缓存）
- `src-tauri/src/search_engine/path_cache_wrapper.rs`（线程安全缓存包装器）
- `src-tauri/src/state/searchengine_data.rs`（Tauri 状态、指标、索引/搜索门控）
- `src-tauri/src/commands/search_engine_commands.rs`（Tauri 命令）

## 端到端调用链

典型的前端调用 `invoke("search", { query })` 会经过以下层级：

1. Tauri 命令：`src-tauri/src/commands/search_engine_commands.rs`
   - `search()` / `search_with_extension()` 验证输入并转发到 `SearchEngineState`。
2. 状态层：`src-tauri/src/state/searchengine_data.rs`
   - `SearchEngineState::search()` 控制并发工作（如果正在索引/搜索则阻塞），设置状态，
     设置当前目录上下文，执行搜索，并更新指标。
3. 核心引擎：`src-tauri/src/search_engine/search_core.rs`
   - `SearchCore::search()` 运行组合策略：
     `缓存 -> ART 前缀 -> （可选）三元组模糊 -> 排名 -> 缓存`。

## 高级搜索策略（缓存 -> 前缀 -> 模糊 -> 排名）

查询执行的主要入口点是 `src-tauri/src/search_engine/search_core.rs` 中的 `SearchCore::search()`。

流程如下：

1. 空查询返回 `[]`。
2. `query.trim()` 用作规范化查询（此处没有深度规范化）。
3. 通过 `PathCache::get(query)` 进行缓存查找。
4. 如果缓存未命中：
   - 使用 `ART::search(query, None, false)` 进行前缀搜索。
   - 如果前缀结果"太少"，则使用模糊搜索来填充结果：
     `if results_buffer.len() < self.max_results.min(10)`。
   - 对前缀和模糊结果进行去重。
5. 对组合结果进行排名（`rank_results`）并截断至 `max_results`。
6. 将结果缓存以供后续相同查询使用。

注意：`SearchCore::search()` 目前会两次缓存结果：

- `self.cache.insert(normalized_query.to_string().clone(), cached_results)`
- `self.cache.put(normalized_query_owned, CachedSearchResults { results: ... })`

两个路径最终都通过 `PathCache` 写入同一个底层 `LruPathCache`。
这可能是历史遗留的冗余；此处按原样记录该行为。

## 路径规范化

当前代码中有两种不同的规范化路径：

- `src-tauri/src/search_engine/search_core.rs` 中的 `SearchCore::normalize_path()`
  - 去除前导 Unicode 空白字符
  - 将 `\\` 转换为 `/`
  - 合并重复斜杠
  - 去除尾部斜杠（根目录除外）
  - 重用内部 `String` 缓冲区（`path_buffer`）以减少内存分配

- `src-tauri/src/search_engine/art_v5.rs` 中的 `ART::normalize_path()`
  - 目标类似：去除前导空白字符、规范化分隔符、合并重复斜杠、
    去除尾部斜杠

索引（`SearchCore::add_path`）在插入 ART 和模糊匹配器之前对路径进行规范化。
但是，ART 本身在插入时也会在内部进行规范化。

实际影响：如果你修改规范化规则，请确保 SearchCore 和 ART 保持一致，
否则可能会出现模块间键不匹配的情况。

## ART 前缀搜索（自适应基数树）

实现：`src-tauri/src/search_engine/art_v5.rs`。

### 数据结构

ART 存储路径字节，并将连续字节压缩为每个节点的 `prefix`：

- 每个节点包含：
  - `prefix: SmallVec<[u8; 8]>`（压缩的路径段）
  - `is_terminal: bool`（完整键在此节点结束）
  - `score: Option<f32>`（与此终端键关联的基础分数）

子节点存储使用自适应节点类型：

- `Node4`：最多 4 个子节点（小的有序键数组 + 子节点数组）
- `Node16`：最多 16 个子节点
- `Node48`：最多 48 个子节点（256 的密集索引数组 -> 槽位索引，加上 48 个子节点槽位）
- `Node256`：最多 256 个子节点（直接的 256 数组）

节点根据扇出动态增长和收缩：

- `ARTNode::grow()` 将 Node4 -> Node16 -> Node48 -> Node256 转换。
- `ARTNode::shrink()` 根据大小阈值将 Node256 -> Node48 -> Node16 -> Node4 转换。

其目的是在不同的扇出模式下保持良好的内存/缓存行为。

### 插入

公共插入方法：

- `ART::insert(path, score)` 规范化路径并调用 `insert_recursive`。

重要方面：

- 前缀压缩：节点存储 `prefix`，仅在需要时分支。
- 终端节点存储分数（`set_score(Some(score))`）。

### 搜索

公共搜索方法：

- `ART::search(query, current_dir, allow_partial_components)`

在 `SearchCore::search()` 中，当前调用为：

- `self.trie.search(normalized_query, None, false)`

因此，当前目录上下文目前未在 ART 级别应用（排名在稍后使用
当前目录提升）。

`allow_partial_components` 可能触发更昂贵的操作（通过 `collect_all_paths()` 进行组件扫描），
因此核心路径补全搜索保持其为 `false`。

### 补全 API

ART 还暴露了面向补全的 API：

- `ART::find_completions(prefix)`

它定位与前缀匹配的子树，然后使用 `collect_results_with_limit()` 收集路径，
该方法使用基于队列的遍历，一旦达到 `max_results` 就停止。

如果你需要严格基于前缀且有界的自动补全，`find_completions`
是最直接的 ART 钩子。

## 模糊搜索（三元组索引）

实现：`src-tauri/src/search_engine/fast_fuzzy_v2.rs`（`PathMatcher`）。

此模块是当前代码库中主要的"模糊"引擎。

### 索引

`PathMatcher` 存储的状态：

- `paths: Vec<String>`（索引路径的规范列表）
- `trigram_index: FxHashMap<u32, SmallVec<[u32; 4]>>`
  - 键：打包的三元组（3 个字节打包成 u32）
  - 值：包含该三元组的路径索引的小向量

三元组提取：

- 每个路径在两端用两个空格填充。
- 三元组使用预计算的 `CHAR_MAPPING` 表进行大小写折叠，以实现快速 ASCII 小写转换。
- 使用临时的 `FxHashSet` 跳过同一路径内的重复三元组。

### 查询执行

`PathMatcher::search(query, max_results)`：

1. 小写查询（`query.to_lowercase()`）。
2. 提取查询三元组。
3. 使用 `hit_counts: Vec<u16>` 计算每个路径的三元组重叠数。
4. 按命中计数降序排序候选路径。
5. 仅对前 N 个候选者打分：

- `const MAX_SCORING_CANDIDATES: usize = 2000;`

这个"仅对前 N 个打分"的步骤是一个主要的性能杠杆：即使索引有许多匹配项，
它也限制了昂贵的每路径打分工作。

打分启发式方法包括：

- 重叠率：`hits / query_trigram_count`
- 文件名级匹配的奖励（精确/包含）
- 首字符匹配的奖励
- 如果查询包含 `.` 且路径以该扩展名结尾，则给予扩展名奖励
- 如果查询出现在路径中较早位置，给予小的位置奖励
- 长度规范化（类 sigmoid）以避免对长路径的偏见

如果 `total_hits == 0`，匹配器会回退到基于变体的方法：

- `fallback_search()` 生成查询的删除/转置/替换，并
  重复三元组收集以找到近似候选者。

## 带 TTL 的 LRU 缓存

核心缓存：`src-tauri/src/search_engine/lru_cache_v2.rs`（`LruPathCache`）。

`SearchCore` 使用的包装器：`src-tauri/src/search_engine/path_cache_wrapper.rs`（`PathCache`）。

### 数据结构

`LruPathCache` 使用经典布局：

- `HashMap<K, NonNull<Node<K,V>>>` 用于 O(1) 查找
- 双向链表用于 O(1) 移动到前端和逐出排序

每个节点存储：

- `key`、`value`
- `prev`、`next`
- `last_accessed: Instant`（用于 TTL）

TTL 行为：

- 在 `get()` 时，如果过期，则移除该条目并返回 `None`。
- `purge_expired()` 扫描所有条目（O(n)）并移除过期键。

### 并发包装器

`PathCache` 将 `LruPathCache<String, PathData>` 包装在 `Arc<parking_lot::RwLock<...>>` 中。

重要细节：`PathCache::get()` 接受 `&mut self` 并获取写锁：

- `self.inner.write().get(...)`

这是必要的，因为 `LruPathCache::get()` 会更新 LRU 顺序和 `last_accessed`。
在 LRU 缓存中，即使是读取在逻辑上也是"写入"。

### 缓存值类型

`PathCache` 存储 `PathData { results: Vec<(String, f32)> }`。

`SearchCore` 也有一个 `CachedSearchResults` 包装结构体，但最终两者都
在内部存储为相同的 `PathData`。

## 排名

排名在前缀/模糊结果组合之后进行。

实现：`src-tauri/src/search_engine/search_core.rs` 中的 `SearchCore::rank_results()`。

输入：

- `Vec<(String, f32)>`，其中 `f32` 起始为模块提供的基础分数
  （ART 终端分数或模糊分数）。

提升因素包括：

- 频率提升：`frequency_map[path] * ranking_config.frequency_weight`
  - 上限为 `ranking_config.max_frequency_boost`
- 最近性提升：使用 `ranking_config.recency_weight` 和
  `ranking_config.recency_lambda` 的衰减函数
- 当前目录上下文：
  - 如果 `path.starts_with(current_dir)` 则给予 `context_same_dir_boost`
  - 如果 `path.starts_with(parent_dir)` 则给予 `context_parent_dir_boost`
- 首选扩展名提升：
  - `extension_boost` 按扩展名在首选列表中的位置缩放
  - 如果查询包含该扩展名，额外给予 `extension_query_boost`
- 文件名匹配提升：
  - 精确 / 前缀 / 包含（`exact_match_boost`、`prefix_match_boost`、`contains_match_boost`）
- 目录提升：
  - 如果 `path.is_dir()` 则给予 `directory_ranking_boost`

添加提升后，使用 sigmoid 对分数进行规范化：

- `score = 1.0 / (1.0 + (-score).exp())`

然后按分数降序排序结果。

### RankingConfig 和 prefer_directories

`RankingConfig` 位于 `src-tauri/src/models/ranking_config.rs`。

`src-tauri/src/state/searchengine_data.rs` 中的 `SearchEngineState::new()` 在不应提升目录时
通过设置 `ranking_config.directory_ranking_boost = 0.0` 来应用 `SearchEngineConfig.prefer_directories`。

`search_with_extension` 流程会临时覆盖 `SearchCore` 的首选扩展名。
注意：`SearchCore::set_preferred_extensions()` 会清除缓存以避免陈旧的排名行为。

## 索引：添加路径

需要注意两个与索引相关的层：

- 引擎级添加 API（`SearchCore::add_path`、`SearchCore::add_paths_batch`、
  `SearchCore::add_paths_recursive`）位于 `src-tauri/src/search_engine/search_core.rs`。
- 状态级分块/流式索引（`SearchEngineState::start_chunked_indexing` 和辅助函数）
  位于 `src-tauri/src/state/searchengine_data.rs`。

状态层执行广度优先目录遍历，强制执行深度/文件限制，
频繁更新进度，并以较小的批次向引擎提供路径。

`SearchEngineState` 流式遍历中的关键旋钮/限制：

- `MAX_DEPTH: 25`
- `MAX_FILES: 500000`
- `chunk_size`（由调用者提供；命令默认使用 150）
- `SUB_BATCH_SIZE: 25`（引擎写锁窗口）

取消：

- 索引频繁检查 `SearchCore::should_stop_indexing()` 并提前返回。
- 命令 `stop_indexing` 将状态设置为已取消并调用 `engine.stop_indexing()`。

## 配置旋钮

配置结构体是 `src-tauri/src/models/search_engine_config.rs` 中的 `SearchEngineConfig`。
当前实现使用的字段：

- `search_engine_enabled`：状态方法中的硬门控
- `max_results`：核心引擎中的截断上限
- `cache_size`：LRU 容量
- `cache_ttl`：可选的 TTL（如果在 `SearchEngineState::new()` 中缺失，默认为 1 小时）
- `preferred_extensions`：影响排名（可以按搜索覆盖）
- `prefer_directories`：启用/禁用目录提升（通过 RankingConfig）
- `excluded_patterns`：索引期间用于跳过路径

## 性能说明和权衡

- ART 前缀搜索对于前缀/路径补全很快，但有意使用
  `allow_partial_components = false` 以避免昂贵的全路径扫描。
- 模糊搜索受 `MAX_SCORING_CANDIDATES = 2000` 限制以保持延迟稳定。
- 缓存读取需要写锁，因为 LRU 更新是突变。
- `SearchEngineState::search()` 为引擎获取写锁以确保缓存和
  使用跟踪行为正确。

## 已知注意事项（记录当前行为）

- `SearchCore::search()` 中的重复缓存写入（`insert` 和 `put`）。
- 当前目录上下文目前未从 `SearchCore` 传递到 `ART::search()`。
- 规范化存在于多个层（SearchCore 和 ART）。如果这些不一致，可能会出现细微的错误
  （遗漏匹配、重复条目、缓存不一致）。

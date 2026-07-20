# Extract QA 缺陷码 → 重生改法速查

page-designer 的 `repochan starter asset-apply` 失败时，会按结构化信封里的 `defects[].code` 回流重生请求。本表只有 Painter 视角的「如何改 prompt / matte / 拆单」。切分与 QA 本身归 page-designer 拥有：Painter **不**对 order 产物运行 `image edit extract*` 做交付预检，也不把派生 alpha 写回 order——每次回流只交付新的原图 version。

| defect code | 含义 | 重生时怎么改 |
|------|------|------|
| `edge_touch` / `sheet_edge_touch` | 主体碰到 cell 内缘或整表外缘 | 加强 margin prompt（generous margin on all four sides, subject never touches any cell edge）；cell 内缩约 10% 作为安全区，主体含道具/特效/描边都不进入边距带；整表外圈加留白；把 layout-guide PNG 与 foundation 一起作为 `--reference` |
| `empty_cell` | 某个 cell 没有可提取的前景 | 检查该 cell 的语义是否被省略、画得太小或与邻格粘连；prompt 明确每个 cell 必须各有一个完整、居中的主体 |
| `frame_count_mismatch` | ML 检出的 blob 数 ≠ 格子数 | 贴纸粘连或碎裂：加大间距、合并跨 cell 连体元素、去掉碎装饰/散落小物件，让每个贴纸是单一连通轮廓 |
| `matte_subject_collision` | matte 与主体颜色距离太近 | 换 matte hex：按主体色相选——粉/紫主体 → 绿 matte；绿主体 → 洋红 matte；深红主体 → 绿 matte。确保 matte 不出现在角色、服装、道具、描边和特效里，且非白/近白 |
| `chroma_residue` | matte 没抠净，贴边残留 key 色 | 加强 flat matte prompt：perfectly flat uniform matte, no gradient/texture/shadow/vignette/ambient light；避免辉光、溢色、环境光污染和背景色细节 |
| `foreground_ratio_low` / `foreground_ratio_high` | 前景占比过低/过高 | 过低：主体画大一些、填满安全区，检查是否被 matte 污染吞掉；过高：主体收小，留出安全边距 |
| `ml_unavailable` / `invalid_options` | 环境或参数问题，非生成问题 | 不需要重生；由 page-designer 修 ML 环境或 starter 的 extract-grid args |

**连续 2 次 apply 失败**：按 page-designer 的决定拆单——把整表订单拆成按 row 或 single-cell 的多个订单分别生成，各单仍遵守本表与模板 constraints。

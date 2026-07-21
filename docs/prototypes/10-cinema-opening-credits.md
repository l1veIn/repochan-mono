# 10 · Cinema Opening Credits（电影片头 · 演职员表）

| 字段 | 值 |
|------|-----|
| **style ID** | `cinema-opening-credits` |
| **类型** | 仪式感单页 / 片头式叙事落地页 |
| **优先级** | 实验 |
| **情绪轴** | 剧场 · 庄重又俏皮 · multi-agent 剧组 |
| **建议目录名** | `landing-cinema-credits` |

---

## 1. 定位

黑场、宽银幕 letterbox、演职员表式名单——把 RepoChan 的 skill 角色写成 **剧组**。  
仓库酱是主演；分析师 / 访谈 / 人设 / 美术总监 / 画师 / 页设计师是职员表上的名字。

### 与 Scrollytelling 的关键差

| Scrollytelling | Cinema Credits |
|----------------|----------------|
| 画室场景 + 终端 + 进度轨 | **影院仪式**：黑场、片头、职员表、终幕 |
| 解释 pipeline 步骤细节 | 用电影语言赋予 agent 协作以「制作组」神话 |
| 强交互 scrub | 更接近线性放映 + 可跳过 |

---

## 2. 视觉系统

### 色板

| Token | 色值 | 用途 |
|-------|------|------|
| `--void` | `#000000` | 主场 |
| `--letterbox` | `#000000` 上下条 | 21:9 感 |
| `--credit` | `#F5F5F5` | 职员表字 |
| `--role` | `#A3A3A3` | 职位小字 |
| `--spot` | `#38BDF8` | 主演名点缀 |
| `--end-card` | 可淡入品牌色 | 终幕 |

中段可短暂切到「场景卡」（静帧插画），再回黑场字幕。

### 字体

- **职员表**：经典电影感——Trajan 气质慎用（授权）；可用 `Cinzel` / `Playfair` + 中文宋体
- **职位**：小号 tracking 很开的无衬线
- **终幕标题**：可切回现代无衬线

### 布局法则

- 上下 letterbox 恒定（桌面）；移动端改为常规竖屏但保留淡入字幕节奏
- 字幕块：左职位 / 右姓名 或 居中堆叠（两种电影传统可混）
- 主演卡：角色全名 + dig 割侧光

---

## 3. 信息架构（放映顺序）

1. **Studio Card** — `SUGAR RIFF PRESENT` / RepoChan  
2. **Title Card** — 片名单字：`仓库酱` 或 `给仓库一个灵魂`  
3. **Starring** — 仓库酱 dig 割 + 「主演」  
4. **Cast & Crew** — skill 映射表，例如：

   | 银幕职位 | 实际角色 |
   |----------|----------|
   | 原作 / 世界观 | repochan-persona · 世界架构师 |
   | 角色设计 | 角色设计师 |
   | 美术总监 | repochan-art-director |
   | 摄影 / 生成 | repochan-painter |
   | 剪辑 / 装配 | repochan-page-designer |
   | 剧本顾问 | repochan-interviewer |
   | 调研 | repochan-analysis |

5. **Scene Stills** — 2–3 张真资产作「剧照」  
6. **Tagline Card** — 一句话产品  
7. **End Card CTA** — 命令 + GitHub（灯光亮起）  
8. **Post-credits**（可选）— 一句梗 / sticker

---

## 4. 动效与交互

- **签名**：字幕淡入淡出、缓慢上滚职员表、侧光扫过角色
- **Skip intro** 按钮（尊重用户）
- 音效 **默认关**；若加 BGM 必须用户手势开启
- **reduced-motion**：静态职员表一页 + 剧照网格

---

## 5. 资产与 slot

| Slot | 必要性 | 说明 |
|------|--------|------|
| `title-treatment` | 建议 | 片名字标（可纯 CSS） |
| `star-cutout` | 必须 | 主演光下 dig 割 |
| `still-01..03` | 必须 | 剧照：foundation / scene / poster |
| `end-logo` | 必须 | icon + wordmark |
| 无需大量 sticker 墙 | | 克制 |

---

## 6. 文案语气

- 电影片头腔：`SUGAR RIFF 出品` `主演` `本片全部画面来自生成流水线实拍（实绘）`
- 职员表用正式职位名，括号可跟 skill id
- **禁忌**：把整页做成假视频无法暂停的长动画（必须可跳过、可滚动）

---

## 7. 风险与验收

| 风险 | 缓解 |
|------|------|
| 华而不实 | End Card 转化清晰；Skip 常驻 |
| 与 Scrolly 重复 | 审查时并排：影院黑场 vs 画室终端 |
| 动效预算 | 原型阶段纯 CSS 淡入即可 |

**验收：**

- [ ] 用户能说出「这是 multi-agent 剧组」隐喻  
- [ ] 30 秒内可跳到 CTA  
- [ ] 无自动声音  

---

## 8. 下一步

1. 写死职员表映射（上表定稿）  
2. 黑场 + 5 张字幕卡静态原型  
3. 决定是否进入正式制作线（实验级可只留 brief）  

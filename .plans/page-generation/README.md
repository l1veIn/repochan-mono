# 静态页面生成 — 实施计划

> **执行方式：** 逐个 task 喂给 Codex CLI（`codex exec --full-auto`），Lumi 负责逐个 review。
> 每个 task 文件是自包含的——Codex 可以直接读 task 文件 + 现有代码来完成。

## 目标

让 RepoChan 从「产出散装图片素材」升级到「交付可直接部署的项目落地页」。
Agent 读 analysis + persona + orders，输出 Page JSON，core 校验+存储，renderer 渲染成零 JS 静态 HTML。

## 架构

```
core（纯 TS）          → PageData type + Schema + entity + asset check
page-renderer（新包）   → Page JSON → 静态 HTML + CSS（模板改编自 Meraki UI, MIT）
pi（后续）             → page-designer skill + tool action
```

## 任务清单

| Task | 包 | 内容 | 依赖 |
|------|----|------|------|
| task-01 | core | Page 类型定义 + TypeBox Schema | 无 |
| task-02 | core | Protocol 路径 + Entity 函数 + 资产检查 | task-01 |
| task-03 | core | 完整测试套件 | task-01, task-02 |
| task-04 | page-renderer | 包脚手架 + 主题编译器 | task-01 |
| task-05 | page-renderer | Section HTML 模板（全部 variant） | task-04 |
| task-06 | page-renderer | 渲染引擎 + 资产解析器 | task-04, task-05 |
| task-07 | page-renderer | 测试套件 | task-04, task-05, task-06 |

## 约定

- 遵循 AGENTS.md：core 零 Pi 依赖
- 所有新代码用 TypeScript，跟现有 core 代码风格一致（`.js` 后缀 import、TypeBox schema、vitest）
- 每个 task 完成后运行对应测试验证
- Git commit message 格式：`feat(page): <description>`

export default {
  'common.loading': '加载中...',

  // Wizard
  'wizard.title': '=== RepoChan 向导 ===',
  'wizard.select': '选择一个部分:',
  'wizard.analysis': '分析（Analyst）',
  'wizard.persona': '人物档案 / Persona',
  'wizard.orders': '订单 / 结果',
  'wizard.model': '模型（登录 / 选择）',
  'wizard.settings': '设置',
  'wizard.chat': '聊天（未实现）',
  'wizard.hint': '↑↓ 选择  •  Enter 进入  •  q / Esc 退出',

  // Settings
  'settings.title': '=== 设置 ===',
  'settings.header': 'RepoChan 设置:',
  'settings.model': '模型（登录 / 选择模型）',
  'settings.language': '语言（当前: {lang}）',
  'settings.hint': '↑↓ 选择  •  Enter  •  Esc 返回向导',

  // Model / Login
  'model.title': '=== 模型 / 登录 ===',
  'model.auth_type': '选择认证方式:',
  'model.auth_subscription': '使用订阅',
  'model.auth_apikey': '使用 API Key',
  'model.provider_oauth': '选择提供商（订阅）:',
  'model.provider_apikey': '选择提供商（API Key）:',
  'model.apikey_prompt': '请输入 {provider} 的 API Key:',
  'model.login_success': '✓ 已登录 {provider}。按 Esc 返回。',
  'model.apikey_saved': '✓ 已保存 {provider} 的 API Key。按 Esc 返回。',
  'model.no_providers': '没有可用的提供商。\n按 Esc 返回',
  'model.hint': 'Esc / q : 返回向导',
  'model.loading': '正在加载 Pi runtime...',
  'model.no_oauth': '没有可用的订阅提供商。\n按 Esc 返回',
  'model.no_apikey': '没有可用的 API Key 提供商。\n按 Esc 返回',
  'model.apikey_empty': 'API key 不能为空',
  'model.waiting': '等待认证中...',
  'model.error': '登录错误: {msg}\n\n按 Esc 返回向导。',
  'launch.started': 'RepoChan 向导已启动。使用方向键、Enter、q 退出。',
  'language.title': '=== 语言选择 ===',
  'language.prompt': '选择你的语言：',
  'language.hint': '↑↓ 选择  •  Enter 确认  •  Esc 取消',

  // Analysis
  'analysis.title': '=== 分析 ===',
  'analysis.subtitle': '由 Analyst 角色产出的仓库理解。',
  'analysis.empty': '尚未找到 .repochan/analysis.json。',
  'analysis.repo': '仓库',
  'analysis.summary': '摘要',
  'analysis.tech': '技术画像',
  'analysis.visual': '视觉信号',
  'analysis.creative': '创意信号',
  'analysis.done': '分析阶段已完成，已刷新。',
  'analysis.hint': 'u: 运行/重跑 Analyst • r: 刷新 • Esc/q: 返回（运行中 Esc 取消）',

  // Persona
  'persona.title': '=== 人物档案 / Persona ===',
  'persona.subtitle': '由 Creative Writer 角色产出的活体吉祥物档案。',
  'persona.empty': '尚未找到 .repochan/persona/current.json。',
  'persona.needs_analysis': '生成人物档案前需要先有 .repochan/analysis.json。',
  'persona.done': '人物档案阶段已完成，已刷新。',
  'persona.name': '名字',
  'persona.concept': '核心概念',
  'persona.profile': '角色档案',
  'persona.appearance': '外观',
  'persona.relationships': '关系',
  'persona.hooks': '美术指导钩子',
  'persona.boundaries': '边界',
  'persona.hint': 'u: 重新生成人物档案 • r: 刷新 • Esc/q: 返回（运行中 Esc 取消）',

  // Orders / Results
  'orders.title': '=== 订单管理 ===',
  'orders.subtitle': 'Art Director 产出的资产订单。进行中的工作会嵌入 AgentStatus。',
  'orders.empty': '暂无订单。通过 analysis + persona + orders 阶段创建。',
  'orders.hint': '↑↓ 选择 • Enter: 详情 • g: 生成订单 • p: 运行画师 • a: 批准 • r: 刷新 • Esc: 返回/取消',
  'orders.status': '状态: {status}',
  'orders.approved': '已批准 {id}。',
  'orders.in_progress': '订单 {id} 已设为 in_progress 以允许画师执行。',
  'orders.done': 'Agent 阶段已完成，已刷新订单。',
  'orders.detail.title': '=== 订单详情: {id} ===',
  'orders.detail.subtitle': '订单 JSON、结果版本和画师执行。',
  'orders.detail.json': '订单 JSON',
  'orders.detail.images': '订单结果版本 / 文件:',
  'orders.detail.no_images': '（暂无关联文件 — 画师可能仍在工作中）',
  'orders.detail.switch_version': 's: 设为当前版本',
  'orders.detail.switched': '当前版本已设为 {id}。',
  'orders.detail.done': '画师阶段已完成，已刷新订单和结果。',
  'orders.detail.hint': '↑↓ 版本 • p 运行画师 • s 设当前 • r 刷新 • Esc 返回/取消',

  // Confirm flow (shared)
  'confirm.skip': '使用现有（跳过）',
  'confirm.version': '重新生成（归档旧版 → 新版本）',
  'confirm.overwrite': '覆盖（不保留旧版）',

  // Analysis
  'analysis.confirm_title': '=== 分析已存在 ===',

  // Persona confirm
  'persona.confirm_title': '=== 人物档案已存在 ===',

  // Foundation
  'foundation.title': '=== 设定集封面 ===',
  'foundation.subtitle': '所有下游视觉资产的锚点。由 Art Director 创建。',
  'foundation.empty': '尚未找到设定集封面。',
  'foundation.confirm_title': '=== 设定集封面已存在 ===',
  'foundation.has_foundation': '设定集封面已存在',
  'foundation.needs_persona': '创建设定集需要先有 analysis + persona。',
  'foundation.needs_analysis': '创建设定集需要先有 analysis。',
  'foundation.done': '设定集阶段已完成。',
  'foundation.hint': 'u/Enter: 创建/重新生成 • r: 刷新 • Esc/q: 返回/取消',

  // Paint
  'paint.title': '=== 画师 ===',
  'paint.subtitle': '通过 Painter 角色执行资产订单。',
  'paint.no_orders': '没有可用订单。请先运行 `repochan foundation`。',
  'paint.select_order': '选择要执行的订单：',
  'paint.order_hint': '↑↓ 选择 • Enter: 执行选中订单 • Esc/q: 返回',
  'paint.confirm_title': '=== 该订单已有结果 ===',
  'paint.needs_foundation': '该订单引用的设定集封面尚不存在。',
  'paint.done': '画师阶段已完成。',
  'paint.hint': 'u/Enter: 执行/重新生成 • r: 刷新 • Esc/q: 返回/取消',
  'paint.status_draft': '订单尚未审批。请先审批或按 [a] 自动审批。',
  'paint.auto_approved': '订单 {id} 已自动审批，允许画师执行。',

  // Agent status
  'agent.status.painter': '画师 (painter) 正在处理 {orderId}...',
  'agent.status.analyst': '分析师工作中...',
  'agent.status.creative': '创意写手 (Creative Writer) 工作中...',
  'agent.status.pm': '美术指导 / 产品经理工作中...',
  'agent.status.running': '运行中 {elapsed}s',
  'agent.status.events': '最近活动:',
  'agent.status.cancelled': 'Agent 运行已取消。',
} as const;

export default {
  'common.loading': 'Loading...',

  // Wizard
  'wizard.title': '=== RepoChan Wizard ===',
  'wizard.select': 'Select a section:',
  'wizard.analysis': 'Analysis (Analyst)',
  'wizard.persona': 'Persona / 人物档案',
  'wizard.foundation': 'Foundation Sheet',
  'wizard.orders': 'Orders / Results',
  'wizard.chat': 'Chat',
  'wizard.sessions': 'Sessions',
  'wizard.model': 'Model (login / select)',
  'wizard.settings': 'Settings',
  'wizard.hint': '↑↓ select  •  Enter to enter  •  r refresh  •  q / Esc to quit',

  // Settings
  'settings.title': '=== Settings ===',
  'settings.header': 'RepoChan settings:',
  'settings.model': 'Model (login / select model)',
  'settings.language': 'UI language (current: {lang})',
  'settings.hint': '↑↓ select  •  Enter  •  Esc back to wizard',

  // Sessions
  'sessions.title': '=== Sessions ===',
  'sessions.subtitle': 'Saved RepoChan Pi sessions for this project.',
  'sessions.empty': 'No saved sessions found for this project yet.',
  'sessions.hint': '↑↓ select  •  Enter open in Pi  •  r refresh  •  Esc/q back',

  // Model / Login
  'model.title': '=== Model / Login ===',
  'model.auth_type': 'Select authentication method:',
  'model.auth_subscription': 'Use a subscription',
  'model.auth_apikey': 'Use an API key',
  'model.provider_oauth': 'Select provider (subscription):',
  'model.provider_apikey': 'Select provider (API key):',
  'model.apikey_prompt': 'Enter API key for {provider}:',
  'model.login_success': '✓ Logged in to {provider}. Press Esc to return.',
  'model.apikey_saved': '✓ API key saved for {provider}. Press Esc to return.',
  'model.no_providers': 'No providers available.\nEsc to go back',
  'model.hint': 'Esc / q : back to wizard',
  'model.loading': 'Loading Pi runtime...',
  'model.no_oauth': 'No OAuth providers available.\nEsc to go back',
  'model.no_apikey': 'No API key providers available.\nEsc to go back',
  'model.apikey_empty': 'API key cannot be empty',
  'model.waiting': 'Waiting for authentication...',
  'model.error': 'Login error: {msg}\n\nEsc to return to wizard.',
  'launch.started': 'RepoChan wizard started. Use arrow keys, Enter, q to quit.',
  'language.title': '=== Language Selection ===',
  'language.prompt': 'Select your language:',
  'language.hint': '↑↓ select  •  Enter confirm  •  Esc cancel',

  // Analysis
  'analysis.title': '=== Analysis ===',
  'analysis.subtitle': 'Repository understanding produced by the Analyst role.',
  'analysis.empty': 'No .repochan/analysis/current.json found yet.',
  'analysis.repo': 'Repository',
  'analysis.summary': 'Summary',
  'analysis.tech': 'Technical profile',
  'analysis.visual': 'Visual signals',
  'analysis.creative': 'Creative signals',
  'analysis.done': 'Analysis phase completed. Refreshed artifact view.',
  'analysis.hint': 'u: run/re-run Analyst • e: edit artifact • r: refresh • Esc/q: back (Esc cancels while running)',

  // Persona
  'persona.title': '=== Persona / 人物档案 ===',
  'persona.subtitle': 'Living mascot profile produced by the Creative Writer role.',
  'persona.empty': 'No .repochan/persona/current.json found yet.',
  'persona.needs_analysis': 'Persona generation requires .repochan/analysis/current.json first.',
  'persona.done': 'Persona phase completed. Refreshed artifact view.',
  'persona.name': 'Name',
  'persona.concept': 'Core concept',
  'persona.profile': 'Character profile',
  'persona.appearance': 'Appearance',
  'persona.relationships': 'Relationships',
  'persona.hooks': 'Art direction hooks',
  'persona.boundaries': 'Boundaries',
  'persona.hint': 'u: regenerate Persona • e: edit artifact • r: refresh • Esc/q: back (Esc cancels while running)',

  // Orders / Results
  'orders.title': '=== Orders ===',
  'orders.subtitle': 'Asset orders from the Art Director. In-progress work embeds AgentStatus.',
  'orders.empty': 'No orders found. Create via analysis + persona + orders phase.',
  'orders.hint': '↑↓ select • Enter: detail • g: generate orders • p: run painter • a: approve • r: refresh • Esc: back/cancel',
  'orders.status': 'Status: {status}',
  'orders.approved': 'Approved {id}.',
  'orders.in_progress': 'Order {id} set to in_progress to allow painter execution.',
  'orders.done': 'Agent phase completed. Refreshed orders.',
  'orders.detail.title': '=== Order Detail: {id} ===',
  'orders.detail.subtitle': 'Order JSON, result versions, and painter execution.',
  'orders.detail.json': 'Order JSON',
  'orders.detail.images': 'Order result versions / files:',
  'orders.detail.no_images': '(no linked files yet — painter may still be running)',
  'orders.detail.switch_version': 's: set as current version',
  'orders.detail.switched': 'Current version set to {id}.',
  'orders.detail.done': 'Painter phase completed. Refreshed order and results.',
  'orders.detail.hint': '↑↓ versions • p run painter • s set current • r refresh • Esc back/cancel',

  // Confirm flow (shared)
  'confirm.skip': 'Use existing (skip)',
  'confirm.version': 'Regenerate (archive old → new version)',
  'confirm.overwrite': 'Overwrite (no backup)',

  // Analysis
  'analysis.confirm_title': '=== Analysis already exists ===',

  // Persona confirm
  'persona.confirm_title': '=== Persona already exists ===',

  // Foundation
  'foundation.title': '=== Foundation Sheet ===',
  'foundation.subtitle': 'The visual anchor for all downstream art. Created by Art Director.',
  'foundation.empty': 'No foundation sheet found yet.',
  'foundation.confirm_title': '=== Foundation sheet already exists ===',
  'foundation.has_foundation': 'Foundation sheet exists',
  'foundation.needs_persona': 'Foundation requires analysis + persona first.',
  'foundation.needs_analysis': 'Foundation requires analysis first.',
  'foundation.done': 'Foundation phase completed.',
  'foundation.hint': 'u/Enter: create/regenerate • r: refresh • Esc/q: back/cancel',

  // Paint
  'paint.title': '=== Painter ===',
  'paint.subtitle': 'Execute an asset order through the Painter role.',
  'paint.no_orders': 'No orders available. Run `repochan foundation` first.',
  'paint.select_order': 'Select an order to paint:',
  'paint.order_hint': '↑↓ select • Enter: paint selected • Esc/q: back',
  'paint.confirm_title': '=== Order already has results ===',
  'paint.needs_foundation': 'This order references a foundation sheet that does not exist yet.',
  'paint.done': 'Paint phase completed.',
  'paint.hint': 'u/Enter: paint/regenerate • r: refresh • Esc/q: back/cancel',
  'paint.status_draft': 'Order is still draft. Approve first or press [a] to auto-approve.',
  'paint.auto_approved': 'Order {id} auto-approved for painting.',

  // Agent status
  'agent.status.painter': 'Painter (画师) working on {orderId}...',
  'agent.status.analyst': 'Analyst working...',
  'agent.status.creative': 'Creative Writer (创意写手) working...',
  'agent.status.pm': 'Art Director / PM (产品经理) working...',
  'agent.status.running': 'running {elapsed}s',
  'agent.status.events': 'Recent activity:',
  'agent.status.cancelled': 'Agent run cancelled.',
} as const;

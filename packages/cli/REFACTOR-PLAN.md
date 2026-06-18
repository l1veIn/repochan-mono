# RepoChan CLI Refactor & Feature Plan (Agent-Driven Pages + Structure Cleanup)

**Status**: Plan only. Do **NOT** implement until reviewed.  
**Owner**: Human (will invoke `pi` locally)  
**Reviewer**: Grok (will review all diffs/changes made by pi)  
**Goal**: Make the new modular CLI the production CLI inside the monorepo. Clean structure, complete the four core agent-generated pages, embed AgentStatus everywhere an agent is working, add necessary commands, and properly integrate the 4 personality skills from `repochan-pi`.

## 1. Guiding Principles

- The CLI is primarily a **TUI** (default `repochan` launches the wizard).
- Four main "artifact pages" are produced by agents:
  1. Analysis (from `repochan-analysis`)
  2. Persona / 人物档案 (from `repochan-persona`)
  3. Orders (from `repochan-art-director`)
  4. Assets / Order execution (from `repochan-painter`)
- Whenever an agent is actively working on one of these, the corresponding page **must** prominently embed the `AgentStatus` component (and optionally a live activity feed).
- Use `@repochan/core` for **all** protocol reads/writes (never duplicate logic).
- Use `repochan-pi` skills + Pi runtime for creative/agent work.
- Keep the existing modular pattern (`WizardHost` as router + `currentSub` delegation + `OnBack`).
- Structure must be clean and intuitive: **pages**, **components**, **lib**.
- Old monolithic code lives in `packages/cli.bak/` as reference only. Do not copy large chunks blindly.
- Support both interactive TUI and deterministic sub-commands (`repochan init`, `repochan status`, etc.).

## 2. Target Directory Structure (after cleanup)

```
packages/cli/
├── package.json
├── tsconfig.json
├── README.md
├── REFACTOR-PLAN.md          # this file
└── src/
    ├── pages/                # Full navigable pages (renamed from "hosts")
    │   ├── wizard.ts         # Main router / home
    │   ├── model.ts
    │   ├── settings.ts       # Settings *page* (UI only)
    │   ├── language.ts
    │   ├── analysis.ts       # NEW: Analysis detail page
    │   ├── persona.ts        # NEW: 人物档案 / Persona page
    │   ├── orders.ts         # Orders list page (was orders-host)
    │   └── order-detail.ts   # Order detail page (was order-detail-host)
    │
    ├── components/           # Small, reusable, embeddable widgets
    │   └── agent-status.ts   # The key component for live agent feedback
    │
    ├── lib/                  # Pure logic, no UI, no side effects in render
    │   ├── runtime.ts        # Pi runtime wrapper (custom agent dir isolation)
    │   ├── settings-manager.ts  # yaml persistence for ~/.repochan/settings.yaml
    │   ├── protocol.ts       # Thin wrappers around @repochan/core (optional but recommended)
    │   └── i18n-helpers.ts   # (if needed)
    │
    ├── commands/             # Deterministic CLI sub-commands (non-TUI)
    │   ├── init.ts
    │   ├── status.ts
    │   ├── inspect.ts
    │   ├── validate.ts
    │   ├── order.ts
    │   └── asset.ts
    │
    ├── i18n.ts
    ├── locales/
    │   ├── en.ts
    │   └── zh.ts
    │
    ├── types.ts              # OnBack, TuiRef, AgentRole, etc.
    └── index.ts              # Entry point (arg parsing + launchWizard or run command)
```

**Rules**:
- `pages/*.ts` = full screens that implement `Component`, handle navigation, embed `AgentStatus` when appropriate.
- `components/` = only small widgets that other pages can render inline.
- `lib/` = no `chalk`, no `SelectList`, no rendering logic.
- Never put manager code and page code in the same file.

## 3. The Four Core Pages + AgentStatus Integration

### 3.1 Analysis Page (`pages/analysis.ts`)
- Shows current `.repochan/analysis.json` (or versions).
- If analysis is running → embed large `AgentStatus(role="analyst")` + "Analysis in progress..." state.
- After completion → render nice summary (repo identity, tech stack, visual signals, creative signals, etc.).
- Button / hotkey to "Run / Re-run Analyst" → launches Pi session with `repochan-analysis` skill + conductor prompt.
- Uses `core.inspectProtocol` + direct read of analysis.json.

### 3.2 Persona Page (`pages/persona.ts`)
- Shows current `.repochan/persona/current.json` (the living mascot character).
- If persona generation is running → embed `AgentStatus(role="creative")`.
- Rich view of the persona JSON (name, coreConcept, personality, appearance, relationships, artDirectionHooks, etc.).
- "Regenerate Persona" action (requires analysis first).
- Uses `core` helpers + direct JSON read.

### 3.3 Orders List Page (`pages/orders.ts`)
- Current implementation (move from `hosts/orders-host.ts`).
- List with prominent **status** badges.
- For any order with `status === "in_progress"` (or during orders generation) → embed `AgentStatus(role="pm" | "painter"?)`.
- Actions: approve, request revision, view detail, run orders phase.
- "Generate / Regenerate Orders" → uses `repochan-art-director` skill.

### 3.4 Order Detail Page (`pages/order-detail.ts`)
- Full order JSON + linked assets.
- Version list + image files for each version.
- "Switch current version" using `setCurrentAsset`.
- While the painter is working on this order → embed `AgentStatus(role="painter")`.
- During painting, show live feedback from the skill.
- After delivery → show produced images/files + manifest info.

**Unified AgentStatus embedding rule**:
- Every page above must check current protocol state (via `inspectProtocol` + specific file existence + order status).
- If the corresponding agent "should be running" or an order status indicates work in progress → render the `AgentStatus` component in a prominent location (usually top of the content area or in a dedicated "Activity" section).
- The page should also be able to launch the role session itself and pass the live `session` object into `AgentStatus`.

## 4. Agent Execution Architecture (Unified)

1. User triggers a role from the page (button "Run Analyst", "Generate Persona", "Create Orders", "Execute Painter for this order").
2. The page creates a constrained Pi runtime + session using:
   - `createRepoChanRuntime` (or equivalent from `lib/runtime`)
   - Load the correct skill (`repochan-analysis`, `repochan-persona`, `repochan-art-director`, `repochan-painter`)
   - Load the main `repochan` extension + conductor prompt
3. Subscribe to session events.
4. While running:
   - Show the host page (analysis / persona / orders / order-detail).
   - Embed `AgentStatus` (pass the `session`).
   - `AgentStatus` calls `session.subscribe(...)` and `ingestEvent`.
5. On completion:
   - `AgentStatus` shows "done".
   - The page auto-refreshes using core APIs and displays the produced artifact.
6. User can cancel with Esc / q.

`AgentStatus` must evolve to:
- Accept optional `session?: any`
- Accept `role: AgentRole`
- Accept `orderId?: string` (for painter context)
- Display role-specific header
- Show recent tool calls / messages relevant to the role

## 5. Commands to Implement / Port

- `repochan` (no args) → launch TUI wizard (default)
- `repochan init` → `core.initProtocol(cwd)`
- `repochan status` → nice text overview using `inspectProtocol` + lists (this can also be the default non-TUI view)
- `repochan inspect [--json]`
- `repochan validate [--json]`
- `repochan order list|get ...`
- `repochan asset list|get ...`
- Optional later: `repochan role analyst|persona|art-director|painter [--order xxx]`

The TUI should also be invocable for specific pages (future: `repochan app orders` etc.).

## 6. Skill & Runtime Integration

- Use `repochan-pi` resources (via `getRepoChanPiResources` if it exists, or direct path).
- The four skills must be discoverable and loadable when starting a phase/role.
- Conductor prompt (from old `app/conductor.ts` in .bak) should coordinate the roles and enforce gates (analysis before persona, etc.).
- All protocol writes inside skills go through the `repochan` tool (action = "analysis.run", "persona.create", "order.create", "asset.create_version", "order.set_status", etc.).

## 7. Phased Implementation Steps (for the AI agent `pi`)

**Phase 0 — Preparation (do first)**
- Read `packages/cli.bak/` only as reference for old logic and commands. Never overwrite the new files directly from it.
- Read current `src/` files.
- Read `packages/core/src/` (especially entities, protocol, inspect).
- Read the four skill `SKILL.md` files in `packages/pi/skills/`.
- Confirm `pi --help` usage and available tools.

**Phase 1 — Structure Cleanup (mandatory before adding new pages)**
1. Create `src/pages/`, `src/lib/`, `src/commands/` directories.
2. Move and rename:
   - All current page-like files (`wizard.ts`, `model.ts`, `settings.ts`, `language.ts`, `hosts/orders*.ts`) → `pages/`
   - Rename `orders-host.ts` → `orders.ts`
   - Rename `order-detail-host.ts` → `order-detail.ts`
   - Move `settings-manager.ts` and `runtime.ts` → `src/lib/`
3. Delete the now-empty `hosts/` folder.
4. Update **every** import across the project.
5. Update `index.ts` exports.
6. Make sure `npm run lint` (or `tsc --noEmit`) still passes after moves.
7. Update locales if any strings mentioned "host".

**Phase 2 — Analysis & Persona Pages (new)**
- Create skeleton `pages/analysis.ts` and `pages/persona.ts` following the same `Component` + `OnBack` + `TuiRef` pattern as `orders.ts`.
- Implement basic state loading using `@repochan/core`.
- Add placeholder "Run ..." actions (they can just log for now).
- Add the pages to the Wizard menu (temporarily as "Analysis (TODO)", "Persona (TODO)").

**Phase 3 — AgentStatus Enhancement + Unified Embedding**
- Update `AgentStatus`:
  - Accept `session?`
  - Implement real subscription when session is provided.
  - Improve role headers and messages (use the four roles clearly).
  - Add `orderId` awareness.
- Modify the four pages (analysis, persona, orders, order-detail) to:
  - Detect "agent is working" state.
  - Render `<AgentStatus ... />` in the right place when appropriate.
  - Pass session when available.

**Phase 4 — Launching Agent Work from Pages**
- Create or adapt a helper in `lib/` to start a role session for a given role + optional orderId.
- Wire the "Run" actions in the four pages to actually start the constrained session + show the page + AgentStatus.
- Make sure Esc during execution cancels the session cleanly.

**Phase 5 — Commands (init, status, etc.)**
- Implement `commands/init.ts`, `commands/status.ts`.
- Hook them in `index.ts` (simple arg parsing).
- Make `repochan status` give a useful overview even without TUI.
- Port/adapt the other deterministic commands from `.bak` style but using the new runtime if needed.

**Phase 6 — Polish & i18n**
- Add all missing locale keys for the four pages and roles.
- Improve loading / error states in every page.
- Make language switch rebuild lists correctly (already partially working).
- Ensure that after an agent finishes, the page automatically refreshes and hides/replaces the AgentStatus with real data.

**Phase 7 — Verification**
- Run the TUI via `pnpm --filter repochan exec tsx src/index.ts`
- Test navigation between wizard → analysis/persona/orders
- Simulate / actually run one role and verify AgentStatus appears
- Test `repochan init` and `repochan status`
- Check i18n (both en/zh)
- Run type check

## 8. Review Criteria (Grok will check these)

- Structure matches the target (no more random `hosts/`, settings vs manager clearly separated).
- AgentStatus is embedded in **all four** pages during their active generation/execution phases.
- No direct file writes — only through `@repochan/core`.
- Skills are referenced by name and loaded via the proper repochan-pi mechanism.
- Code remains readable and follows the existing delegation pattern.
- No large blind copies from `cli.bak` — logic is adapted to the new page model.
- Commands are small and focused.
- Plan steps were followed in order (or deviations are justified and minimal).

## 9. How to Use This Plan with `pi`

Recommended invocation (run from the monorepo root):

```bash
cd repochan-mono
pi --name "RepoChan CLI Refactor v1" \
   --skill packages/pi/skills/repochan \
   --approve \
   @packages/cli/REFACTOR-PLAN.md \
   "You are an expert coding agent. Read the full plan. Execute it step by step. 
    After every major phase, stop and wait for review. 
    Use the read, ls, grep, edit, write, bash tools responsibly. 
    Prefer small, reviewable changes. 
    Never run the full refactor in one shot."
```

Then work in phases. After each phase (or after structural changes), the human will share the diff with Grok for review.

If Grok finds issues, the human will reply to `pi` with the review comments and say "please fix according to the review".

## 10. Out of Scope for v1 (can be later)

- Full image thumbnail rendering in terminal
- Multi-order batch UI
- Complex revision workflow UI
- Brand-kit export page
- Full test suite for every page

---

**End of Plan**

Start only after the human confirms and invokes `pi` with this file.
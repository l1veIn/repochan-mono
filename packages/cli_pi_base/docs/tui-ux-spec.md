# RepoChan CLI TUI UX Spec

## Product model

RepoChan has two distinct TUI modes:

1. **Guided creation wizard** — the default for unfinished projects. It is linear and keeps guiding until the first foundation visual anchor exists.
2. **Home** — the default for completed projects. It is a control center: status + navigation, not a wizard and not a next-action coach.

The old mixed "wizard dashboard" model is intentionally retired. A page is either guiding a linear flow or acting as Home.

## Default entry behavior

```text
repochan
  if foundation visual anchor is missing -> Guided creation wizard
  else -> Home

repochan wizard
  if incomplete -> continue from current wizard step
  if complete -> show completion state and offer restart/review

repochan home
  force open Home
```

`repochan setup` remains environment/runtime setup; it should not overwrite creative artifacts.

## Wizard completion definition

The guided creation wizard is complete only when all of these are true:

- `.repochan/analysis/current.json` exists
- `.repochan/persona/current.json` exists
- a foundation-type order exists (`foundation_sheet` or `cover_sheet`)
- that foundation order has an actual image result and is discoverable as the visual anchor

A foundation order without an image is not enough. The user must reach the moment where Spiria has a visible visual anchor.

## Guided wizard steps

| Step | Page | Purpose |
| --- | --- | --- |
| Analysis | `AnalysisPage` | Ground RepoChan in repository evidence |
| Persona | `PersonaPage` | Generate Spiria's character profile |
| Foundation order | `FoundationPage` | Ask Art Director to create foundation-sheet order |
| Foundation paint | `PaintPage` scoped to foundation order | Produce the first visual anchor image |
| Complete | Home | Manage assets from Home |

Wizard behavior:

- `Enter` continues the current step.
- `Esc`/`q` stops the wizard.
- If complete, `Enter` opens Home and `w` restarts/reviews the flow.
- Restarting does not silently overwrite artifacts; each step retains its own skip/version/overwrite confirmation.

## Home behavior

Home is a status-and-navigation page. It must not show `Next action` or a primary CTA that pretends to know what the user wants next.

Home should show:

- Spiria status: Analysis / Persona / Foundation
- Asset status: order count, result count, status breakdown where useful
- Navigation entries with lightweight badges

Example:

```text
RepoChan Home · repochan-mono
Spiria 与 RepoChan 资产的项目控制台。

Spiria
  ✓ Analysis     ready
  ✓ Persona      ready
  ✓ Foundation   ready

Assets
  orders       4
  results      2

Sections
  > Guided creation · complete
    Analysis · ready
    Persona · ready
    Foundation · ready
    Orders / Results · 4 orders
    Painter / Generate Images · 2 results
    Chat
    Sessions
    Settings

[Enter] Open   [r] Refresh   [w] Wizard   [s] Settings   [q] Quit
```

## Page shell

Every role page should render in this order:

1. Header: page title + concise subtitle.
2. Running state if an agent is active.
3. Decision-level state/content, not raw JSON first.
4. Warnings and status messages.
5. Action bar.

## State vocabulary

| State | UX purpose |
| --- | --- |
| `missing` | Required artifact does not exist yet. |
| `ready` | Artifact exists and can be reviewed or regenerated. |
| `running` | Agent is active; show progress and cancel affordance. |
| `blocked` | Required upstream artifact missing; show recovery path. |
| `error` | Operation failed; show cause plus next recovery action. |

## Visual language

- Cyan: current focus / primary heading.
- Green: completed or safe success.
- Yellow: incomplete but recoverable.
- Red: blocked or failed.
- Gray: meta help, paths, secondary details.
- Prefer aligned status rows and action bars over dense prose.

## Migration checkpoint

React Ink should only be evaluated after this split is stable. The spike should replicate:

1. Guided creation wizard shell.
2. Home shell.
3. One running role page.

Decision criteria: focus handling, Pi runtime integration, streaming logs, packaging, testability, and terminal rendering stability.

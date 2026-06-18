import { truncateToWidth, type Component } from "@earendil-works/pi-tui";
import chalk from "chalk";
import { t } from "../i18n.js";

const theme = {
  accent: (s: string) => chalk.cyan(s),
  dim: (s: string) => chalk.gray(s),
  success: (s: string) => chalk.green(s),
  error: (s: string) => chalk.red(s),
  warn: (s: string) => chalk.yellow(s),
};

export type AgentRole = "analyst" | "creative" | "pm" | "painter";

type State = "running" | "done" | "error" | "cancelled";
type LogEntry = { at: Date; text: string; tone?: "dim" | "success" | "error" | "warn" };

export interface AgentStatusOpts {
  role: AgentRole;
  orderId?: string;
  session?: any;
  onRequestRender?: () => void;
  pollMs?: number;
}

export class AgentStatus implements Component {
  private logs: LogEntry[] = [];
  private startedAt = Date.now();
  private frame = 0;
  private state: State = "running";
  private timer: NodeJS.Timeout | null = null;
  private unsubscribe?: () => void;

  constructor(private opts: AgentStatusOpts) {
    this.attachSession(opts.session);
    this.timer = setInterval(() => {
      this.frame = (this.frame + 1) % 10;
      this.opts.onRequestRender?.();
    }, opts.pollMs ?? 300);
    if (!opts.session) this.log("watching protocol state (no live session attached)", "dim");
  }

  setSession(session: any) {
    if (session === this.opts.session) return;
    this.detachSession();
    this.opts.session = session;
    this.attachSession(session);
  }

  markDone() {
    this.state = "done";
    this.log("agent finished", "success");
    this.opts.onRequestRender?.();
  }

  markError(error: unknown) {
    this.state = "error";
    this.log(error instanceof Error ? error.message : String(error), "error");
    this.opts.onRequestRender?.();
  }

  markCancelled() {
    this.state = "cancelled";
    this.log("cancelled", "warn");
    this.opts.onRequestRender?.();
  }

  private attachSession(session: any) {
    if (session && typeof session.subscribe === "function") {
      this.unsubscribe = session.subscribe((event: any) => this.ingestEvent(event));
      this.log("attached to live Pi session", "success");
    }
  }

  private detachSession() {
    try { this.unsubscribe?.(); } catch {}
    this.unsubscribe = undefined;
  }

  private log(text: string, tone?: LogEntry["tone"]) {
    if (!text) return;
    if (this.logs.at(-1)?.text === text) return;
    this.logs.push({ at: new Date(), text, tone });
    if (this.logs.length > 80) this.logs.splice(0, this.logs.length - 80);
  }

  ingestEvent(event: any) {
    const type = event?.type || "event";
    if (type === "agent_start") this.log("provider request started", "dim");
    else if (type === "message_update") this.log("streaming assistant response…", "dim");
    else if (type === "tool_execution_start") this.log(`[tool] ${event.toolName ?? "tool"} ${shortJson(event.args)}`, "dim");
    else if (type === "tool_execution_end") this.log(`[tool ${event.isError ? "error" : "ok"}] ${event.toolName ?? "tool"}`, event.isError ? "error" : "success");
    else if (type === "agent_end") {
      this.state = "done";
      this.log("agent_end", "success");
    } else if (event?.message || event?.text) {
      this.log(String(event.message || event.text), "dim");
    } else {
      this.log(type, "dim");
    }
    this.opts.onRequestRender?.();
  }

  dispose() {
    this.detachSession();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  invalidate(): void {}

  handleInput(_data: string): void {}

  render(width: number): string[] {
    const w = Math.max(30, width);
    const lines: string[] = [];
    const header = roleHeader(this.opts.role, this.opts.orderId);
    lines.push(theme.accent(header));

    const elapsed = Math.floor((Date.now() - this.startedAt) / 1000);
    const spin = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"[this.frame % 10];
    const stateText = this.state === "running" ? `${spin} ${t("agent.status.running", { elapsed })}` : this.state;
    const stateTheme = this.state === "error" ? theme.error : this.state === "done" ? theme.success : this.state === "cancelled" ? theme.warn : theme.dim;
    lines.push(stateTheme(stateText));

    const stats = this.opts.session?.getSessionStats?.();
    if (stats?.tokens) {
      lines.push(theme.dim(`tokens in/out/cache: ${stats.tokens.input}/${stats.tokens.output}/${(stats.tokens.cacheRead ?? 0) + (stats.tokens.cacheWrite ?? 0)}`));
    }

    lines.push(theme.dim(t("agent.status.events")));
    const recent = this.logs.slice(-5);
    if (recent.length === 0) lines.push(theme.dim("  waiting for activity…"));
    for (const entry of recent) {
      const paint = entry.tone ? theme[entry.tone] : theme.dim;
      lines.push(truncateToWidth(paint(`  ${entry.at.toLocaleTimeString().slice(0, 8)} ${entry.text}`), w, "…"));
    }

    return lines.map((l) => truncateToWidth(l, w, "…"));
  }
}

function roleHeader(role: AgentRole, orderId?: string): string {
  if (role === "painter") return orderId ? t("agent.status.painter", { orderId }) : t("agent.status.painter", { orderId: "" });
  if (role === "analyst") return t("agent.status.analyst");
  if (role === "creative") return t("agent.status.creative");
  return t("agent.status.pm");
}

function shortJson(value: unknown) {
  if (value === undefined) return "";
  try {
    const text = JSON.stringify(value);
    return text.length > 120 ? `${text.slice(0, 117)}…` : text;
  } catch {
    return "";
  }
}

import { Key, matchesKey, truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { Theme } from "@earendil-works/pi-coding-agent";
import {
  buildRunPhaseInitialMessage,
  createRunPhaseRuntime,
} from "../../app/run-phase.js";
import {
  createGuidedRuntime,
  DEFAULT_GUIDED_INITIAL_MESSAGE,
} from "../../app/run-guided.js";
import { createRepoChanRuntime, type RepoChanRuntimeResult } from "../../app/pi-runtime.js";
import { messageFromError, safeJson } from "../utils.js";

type RuntimeTask =
  | { type: "guided"; options: any }
  | { type: "phase"; args: any };

type ActivityLog = { at: Date; text: string; tone?: "dim" | "success" | "warning" | "error" };

export class PhaseTaskScreen implements Component {
  private status: "idle" | "starting" | "running" | "done" | "error" | "cancelled" = "idle";
  private logs: ActivityLog[] = [];
  private frame = 0;
  private runtime: RepoChanRuntimeResult | undefined;
  private error: string | undefined;
  private timer: NodeJS.Timeout | undefined;
  private startedAt: number | undefined;

  constructor(
    private readonly opts: {
      cwd: string;
      theme: Theme;
      task: RuntimeTask;
      requestRender: () => void;
      onClose: () => void;
      onDone: () => void;
    },
  ) {}

  invalidate(): void {}

  async dispose() {
    if (this.timer) clearInterval(this.timer);
    await this.runtime?.runtime.dispose();
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || data === "q") {
      if (this.status === "running" || this.status === "starting") {
        this.status = "cancelled";
        void this.runtime?.runtime.session.abort();
      } else {
        this.opts.onClose();
      }
      this.opts.requestRender();
    }
    if ((data === "r" || data === "R") && (this.status === "done" || this.status === "error")) {
      this.opts.onDone();
    }
  }

  async start() {
    if (this.status !== "idle") return;
    this.status = "starting";
    this.startedAt = Date.now();
    this.log("思考中.. preparing constrained RepoChan runtime", "dim");
    this.timer = setInterval(() => {
      this.frame += 1;
      this.opts.requestRender();
    }, 300);
    this.opts.requestRender();

    try {
      if (this.opts.task.type === "guided") {
        this.runtime = await createGuidedRuntime({ ...this.opts.task.options, cwd: this.opts.cwd });
      } else {
        this.runtime = await createRunPhaseRuntime({ ...this.opts.task.args, cwd: this.opts.cwd });
      }
      this.logDiagnostics();
      const session = this.runtime.runtime.session;
      const unsubscribe = session.subscribe((event: any) => {
        if (event.type === "agent_start") this.log("[请求中] provider request started", "dim");
        else if (event.type === "message_update") this.log("streaming assistant response…", "dim");
        else if (event.type === "tool_execution_start") this.log(`[tool] ${event.toolName} ${safeJson(event.args)}`, "dim");
        else if (event.type === "tool_execution_end") this.log(`[tool ${event.isError ? "error" : "ok"}] ${event.toolName}`, event.isError ? "error" : "success");
        else if (event.type === "agent_end") this.log("agent_end", "success");
        this.opts.requestRender();
      });
      this.status = "running";
      const message = this.initialMessage();
      this.log(`执行阶段: ${this.label()}`, "dim");
      await session.prompt(message);
      unsubscribe();
      if ((this.status as any) !== "cancelled") {
        this.status = "done";
        this.log("完成。Press r to refresh result views, esc to return.", "success");
        this.opts.onDone();
      }
    } catch (error) {
      this.status = "error";
      this.error = messageFromError(error);
      this.log(this.error, "error");
    } finally {
      if (this.timer) clearInterval(this.timer);
      this.timer = undefined;
      this.opts.requestRender();
    }
  }

  render(width: number): string[] {
    const lines: string[] = [];
    lines.push(this.opts.theme.fg("accent", this.opts.theme.bold(`Phase task: ${this.label()}`)));
    lines.push(this.opts.theme.fg("dim", "Constrained runtime reuses RepoChan conductor prompts and repochan tool gates."));
    lines.push("");
    lines.push(...this.statusBox(width));
    lines.push("");
    lines.push(this.opts.theme.fg("muted", "Recent activity"));
    for (const log of this.logs.slice(-12)) {
      const fn = log.tone ? (s: string) => this.opts.theme.fg(log.tone!, s) : (s: string) => this.opts.theme.fg("text", s);
      lines.push(truncateToWidth(fn(`${log.at.toLocaleTimeString()}  ${log.text}`), width, "…"));
    }
    if (this.error) {
      lines.push("");
      lines.push(this.opts.theme.fg("warning", "If this is an auth/model error, open Settings or run `repochan chat` for full /login and /model commands."));
    }
    lines.push("");
    lines.push(this.opts.theme.fg("dim", "esc/q cancel or return · r refresh result views after completion"));
    return lines;
  }

  private statusBox(width: number) {
    const stats = this.runtime?.runtime.session.getSessionStats();
    const elapsed = this.startedAt ? Math.round((Date.now() - this.startedAt) / 1000) : 0;
    const spinner = ["思考中.", "思考中..", "思考中..."][this.frame % 3];
    const request = this.status === "running" || this.status === "starting" ? `[请求中] ${spinner}` : this.status;
    const tokens = stats ? `tokens in/out/cache: ${stats.tokens.input}/${stats.tokens.output}/${stats.tokens.cacheRead + stats.tokens.cacheWrite}` : "tokens: n/a";
    const lines = [
      `┌${"─".repeat(Math.max(10, Math.min(width - 2, 76)))}┐`,
      `│ ${request} · ${tokens} · ${elapsed}s`,
      `│ model: ${this.runtime?.runtime.session.model?.id ?? "not selected"}`,
      `└${"─".repeat(Math.max(10, Math.min(width - 2, 76)))}┐`,
    ];
    return lines.map((line) => truncateToWidth(this.opts.theme.fg(this.status === "error" ? "error" : "accent", line), width, "…"));
  }

  private initialMessage() {
    if (this.opts.task.type === "guided") return this.opts.task.options.initialMessage ?? DEFAULT_GUIDED_INITIAL_MESSAGE;
    return buildRunPhaseInitialMessage(this.opts.task.args);
  }

  private label() {
    return this.opts.task.type === "guided" ? "guided" : this.opts.task.args.phase;
  }

  private log(text: string, tone?: ActivityLog["tone"]) {
    if (this.logs.at(-1)?.text === text && text === "streaming assistant response…") return;
    this.logs.push({ at: new Date(), text, tone });
    if (this.logs.length > 80) this.logs.splice(0, this.logs.length - 80);
  }

  private logDiagnostics() {
    const d = this.runtime?.diagnostics;
    if (!d) return;
    if (d.availableModelCount === 0) this.log("No configured Pi model detected.", "warning");
    for (const item of d.runtime) this.log(`${item.type}: ${item.message}`, item.type === "error" ? "error" : "warning");
    for (const item of d.resources) this.log(`resource ${item.type}: ${item.message}`, item.type === "error" ? "error" : "warning");
    if (d.modelFallbackMessage) this.log(`model: ${d.modelFallbackMessage}`, "warning");
  }
}

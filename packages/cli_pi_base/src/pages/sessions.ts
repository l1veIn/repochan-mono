import { Key, matchesKey, SelectList, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import type { SessionInfo } from "@earendil-works/pi-coding-agent";
import chalk from "chalk";

import { t } from "../i18n.js";
import { listRepoChanSessions } from "../lib/runtime.js";
import type { OnBack, TuiRef } from "../types.js";

const theme = {
  accent: (s: string) => chalk.cyan(s),
  dim: (s: string) => chalk.gray(s),
  error: (s: string) => chalk.red(s),
};

type Phase = "loading" | "idle" | "error";

type SessionItem = {
  value: string;
  label: string;
  session: SessionInfo;
};

export class SessionsPage implements Component {
  private phase: Phase = "loading";
  private sessions: SessionInfo[] = [];
  private list: SelectList | null = null;
  private error: string | null = null;

  constructor(
    private onBack: OnBack,
    private tuiRef: TuiRef,
    private onOpenSession: (session: SessionInfo) => void,
  ) {
    void this.load();
  }

  private async load() {
    this.phase = "loading";
    this.error = null;
    this.tuiRef.requestRender();
    try {
      this.sessions = await listRepoChanSessions(process.cwd());
      this.list = this.createList();
      this.phase = "idle";
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      this.phase = "error";
    } finally {
      this.tuiRef.requestRender();
    }
  }

  private createList() {
    const items: SessionItem[] = this.sessions.map((session) => ({
      value: session.path,
      label: formatSessionLabel(session),
      session,
    }));
    const list = new SelectList(items, 12, {
      selectedPrefix: (s) => theme.accent("> " + s),
      selectedText: (s) => theme.accent(s),
      description: (s) => theme.dim(s),
      scrollInfo: (s) => theme.dim(s),
      noMatch: (s) => theme.dim(s),
    });
    list.onSelect = (item) => this.onOpenSession((item as SessionItem).session);
    return list;
  }

  invalidate(): void {}

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || data === "q" || data === "Q") {
      this.onBack();
      return;
    }
    if (data === "r" || data === "R") {
      void this.load();
      return;
    }
    this.list?.handleInput(data);
  }

  render(width: number): string[] {
    const w = Math.max(40, width);
    const lines: string[] = [];
    lines.push(theme.accent(t("sessions.title")));
    lines.push(theme.dim(t("sessions.subtitle")));
    lines.push("");

    if (this.phase === "loading") {
      lines.push(theme.dim(t("common.loading")));
    } else if (this.phase === "error") {
      lines.push(theme.error(this.error ?? "Error"));
    } else if (this.sessions.length === 0) {
      lines.push(theme.dim(t("sessions.empty")));
    } else {
      lines.push(...(this.list?.render(w - 2) ?? []));
    }

    lines.push("");
    lines.push(theme.dim(t("sessions.hint")));
    return lines.map((line) => truncateToWidth(line, w, "…"));
  }
}

function formatSessionLabel(session: SessionInfo) {
  const phase = inferSessionPhase(session);
  const time = formatTime(session.modified ?? session.created);
  const title = readableSessionTitle(session, phase);
  return `${time}  ${phase}  ${title}  ${session.id.slice(0, 8)}`;
}

function inferSessionPhase(session: SessionInfo) {
  const text = `${session.name ?? ""}\n${session.firstMessage ?? ""}\n${session.allMessagesText ?? ""}`.toLowerCase();
  if (text.includes("repochan-painter") || text.includes("painter")) return "complete";
  if (text.includes("repochan-art-director") || text.includes("foundation")) return "visual";
  if (text.includes("repochan-persona") || text.includes("persona")) return "spiria";
  if (text.includes("repochan-analysis") || text.includes("analysis")) return "profile";
  return "chat";
}

function readableSessionTitle(session: SessionInfo, phase: string) {
  const candidates = [session.name, session.firstMessage, session.allMessagesText]
    .map((value) => cleanSessionText(String(value ?? "")))
    .filter(Boolean);
  const candidate = candidates.find((text) => isReadableTitle(text));
  return truncateTitle(candidate || fallbackSessionTitle(phase), 56);
}

function cleanSessionText(message: string) {
  return message
    .replace(/<skill\b[^>]*>/gi, "")
    .replace(/<\/skill>/gi, "")
    .replace(/^\/skill:repochan-[^\s]+/i, "")
    .replace(/location="[^"]+"/gi, "")
    .replace(/CLI request:\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isReadableTitle(title: string) {
  if (!title) return false;
  if (title.length < 4) return false;
  if (/^Ref$/i.test(title)) return false;
  if (title.includes("<skill")) return false;
  if (title.includes("/packages/pi/skills/")) return false;
  return true;
}

function fallbackSessionTitle(phase: string) {
  if (phase === "complete") return t("sessions.fallback.complete");
  if (phase === "visual") return t("sessions.fallback.visual");
  if (phase === "spiria") return t("sessions.fallback.spiria");
  if (phase === "profile") return t("sessions.fallback.profile");
  return t("sessions.fallback.chat");
}

function truncateTitle(title: string, max: number) {
  return title.length <= max ? title : `${title.slice(0, Math.max(0, max - 1))}…`;
}

function formatTime(date: Date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "unknown";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export class SessionsHost extends SessionsPage {}

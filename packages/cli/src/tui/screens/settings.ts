import { LoginDialogComponent, OAuthSelectorComponent, type Theme } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import { createRepoChanRuntime, type RepoChanRuntimeResult } from "../../app/pi-runtime.js";
import { messageFromError } from "../utils.js";

type SettingsScreenOpts = {
  cwd: string;
  theme: Theme;
  requestRender: () => void;
  onClose?: () => void;
};

export class SettingsScreen implements Component {
  private runtime: RepoChanRuntimeResult | undefined;
  private error: string | undefined;

  // Real Pi components when available (preferred - no reimplementation)
  private authComponent: any = null; // LoginDialogComponent | OAuthSelectorComponent

  constructor(private readonly opts: SettingsScreenOpts) {
    void this.load();
  }

  async dispose() {
    await this.runtime?.runtime.dispose();
  }

  invalidate(): void {}

  handleInput(data: string): void {
    // Delegate to real Pi auth component if active (this is the key: use SDK, don't reinvent)
    if (this.authComponent && typeof this.authComponent.handleInput === "function") {
      try { this.authComponent.handleInput(data); } catch {}
      this.opts.requestRender();
      return;
    }

    if (data === "r" || data === "R") {
      void this.load();
      return;
    }

    if (data.toLowerCase() === "l" || data.toLowerCase() === "a") {
      this.startRealAuthComponent();
      this.opts.requestRender();
      return;
    }

    // esc in main status closes or goes back
    if (matchesKey(data, Key.escape)) {
      this.opts.onClose?.();
    }
  }

  modelLabel() {
    const model = this.runtime?.runtime.session.model;
    return model ? `${model.provider}/${model.id}` : "model: none";
  }

  render(width: number): string[] {
    // Prefer real Pi component render (authentic /login experience)
    if (this.authComponent && typeof this.authComponent.render === "function") {
      try {
        const lines = this.authComponent.render(width);
        if (Array.isArray(lines)) return lines.map((l: string) => truncateToWidth(l, width, "…"));
      } catch {
        // fall through to status on error
        this.authComponent = null;
      }
    }

    // Clean status view - no 900-model dump
    const lines = [this.opts.theme.fg("accent", this.opts.theme.bold("Settings / login / model"))];
    if (!this.runtime && !this.error) {
      return [...lines, this.opts.theme.fg("dim", "Loading Pi SDK model registry…")];
    }
    if (this.error) lines.push(this.opts.theme.fg("error", this.error));

    const rt = this.runtime;
    if (rt) {
      const available = rt.modelRegistry.getAvailable();
      lines.push(`Current model: ${rt.runtime.session.model ? `${rt.runtime.session.model.provider}/${rt.runtime.session.model.id}` : "none"}`);
      lines.push(`Available authenticated models: ${available.length}`);
      lines.push("");
      lines.push(this.opts.theme.fg("muted", "Configured auth providers"));
      const providers = rt.authStorage.list();
      if (!providers.length) lines.push(this.opts.theme.fg("warning", "No stored credentials found."));
      for (const provider of providers) {
        const status = rt.authStorage.getAuthStatus(provider);
        lines.push(`• ${provider} · ${status.configured ? status.source ?? "configured" : "missing"}`);
      }
      lines.push("");
      lines.push(this.opts.theme.fg("dim", "l / a  login (uses real Pi LoginDialogComponent / OAuthSelectorComponent) · r reload · esc back"));
    }
    return lines.map((line) => truncateToWidth(line, width, "…"));
  }

  private async load() {
    try {
      await this.runtime?.runtime.dispose();
      this.runtime = await createRepoChanRuntime({ cwd: this.opts.cwd, initialSession: "memory", appendConductorPrompt: false });
      this.error = undefined;
    } catch (error) {
      this.error = messageFromError(error);
    } finally {
      this.opts.requestRender();
    }
  }

  /**
   * Prefer SDK components over our own code.
   * This gives the exact same high-quality login flow (subscription vs API key selector etc.)
   * that you see in Pi's /login, without us reimplementing it.
   */
  private startRealAuthComponent() {
    if (!this.runtime) return;

    const authStorage = this.runtime.authStorage;
    const modelRegistry = this.runtime.modelRegistry;
    const theme = this.opts.theme;

    this.authComponent = null;

    try {
      // Best: full dialog that internally handles the auth method choice
      if (typeof LoginDialogComponent === "function") {
        this.authComponent = new (LoginDialogComponent as any)({
          authStorage,
          modelRegistry,
          theme,
          onAuthChanged: () => { void this.load(); },
          onComplete: () => {
            this.authComponent = null;
            void this.load();
            this.opts.requestRender();
          },
        });
        return;
      }

      // Fallback: the specific OAuth selector component (the one matching the screenshot)
      if (typeof OAuthSelectorComponent === "function") {
        this.authComponent = new (OAuthSelectorComponent as any)(
          authStorage,
          modelRegistry,
          theme,
          (provider: string) => {
            try { (authStorage as any).login?.(provider, {}); } catch {}
            this.authComponent = null;
            void this.load();
            this.opts.requestRender();
          },
          null,
          null,
        );
        return;
      }
    } catch (e) {
      this.error = "Failed to instantiate native Pi login component: " + messageFromError(e);
    }

    // If we reach here, the real components couldn't be used in this context.
    // We keep a very minimal fallback (no giant custom wizard) and strongly recommend chat.
    this.error = "Native Pi login components could not be fully initialized here. " +
      "Use `repochan chat` then type /login for the complete experience (recommended).";
    this.opts.requestRender();
  }
}

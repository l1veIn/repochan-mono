import { matchesKey, Key, Text, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import {
  LoginDialogComponent,
  ExtensionSelectorComponent,
  OAuthSelectorComponent,
} from "@earendil-works/pi-coding-agent";
import chalk from "chalk";

import { getRepoChanRuntime } from "../lib/runtime.js";
import { type OnBack } from "../types.js";
import { t } from "../i18n.js";

const theme = {
  accent: (s: string) => chalk.cyan(s),
  error: (s: string) => chalk.red(s),
  success: (s: string) => chalk.green(s),
  dim: (s: string) => chalk.gray(s),
};

export class ModelHost implements Component {
  private current: Component | null = null;
  private onBack: OnBack;
  private runtime: any = null;
  private tui: any;

  constructor(onBack: OnBack, tui?: any) {
    this.onBack = onBack;
    this.tui = tui;
    this.init();
  }

  private async init() {
    this.runtime = await getRepoChanRuntime();
    this.startAuthTypeSelector();
  }

  private startAuthTypeSelector() {
    const selector = new ExtensionSelectorComponent(
      t("model.auth_type"),
      [t("model.auth_subscription"), t("model.auth_apikey")],
      (option: string) => {
        const authType = option.includes("subscription") || option.includes("订阅") ? "oauth" : "api_key";
        this.showProviderSelector(authType);
      },
      () => this.onBack()
    );
    this.current = selector;
  }

  private showProviderSelector(authType: "oauth" | "api_key") {
    const registry = this.runtime.modelRegistry;
    registry.refresh();

    if (authType === "oauth") {
      const oauthProviders = registry.authStorage.getOAuthProviders();
      if (oauthProviders.length === 0) {
        this.current = new Text(theme.error(t("model.no_oauth")), 1, 1);
        if (this.tui && typeof this.tui.requestRender === 'function') {
          this.tui.requestRender();
        }
        return;
      }

      const providerOptions = oauthProviders.map((p: any) => ({
        id: p.id,
        name: p.name,
        authType: "oauth" as const,
      }));

      const selector = new OAuthSelectorComponent(
        "login",
        registry.authStorage,
        providerOptions,
        (provId: string) => {
          const prov = providerOptions.find((p: any) => p.id === provId)!;
          this.startRealLogin(prov.id, prov.name, "oauth");
        },
        () => this.startAuthTypeSelector(),
        (provId: string) => (registry as any).getProviderAuthStatus(provId)
      );
      this.current = selector;
      return;
    }

    // API key
    const allModels = registry.getAll();
    const oauthIds = new Set(registry.authStorage.getOAuthProviders().map((p: any) => p.id));
    const apiProviders = new Map<string, string>();
    for (const m of allModels) {
      if (!oauthIds.has(m.provider)) {
        apiProviders.set(m.provider, registry.getProviderDisplayName(m.provider));
      }
    }
    const providerItems = Array.from(apiProviders.entries()).map(([id, name]) => ({ value: id, label: name }));

    if (providerItems.length === 0) {
      this.current = new Text(theme.error(t("model.no_apikey")), 1, 1);
      if (this.tui && typeof this.tui.requestRender === 'function') {
        this.tui.requestRender();
      }
      return;
    }

    const selector = new ExtensionSelectorComponent(
      t("model.provider_apikey"),
      providerItems.map(p => p.label),
      (label: string) => {
        const item = providerItems.find(p => p.label === label)!;
        this.startRealLogin(item.value, item.label, "api_key");
      },
      () => this.startAuthTypeSelector()
    );
    this.current = selector;
  }

  private async startRealLogin(providerId: string, providerName: string, authType: "oauth" | "api_key") {
    const authStorage = this.runtime.authStorage;
    const dialog = new LoginDialogComponent(
      this.tui,
      providerId,
      (success: boolean, message?: string) => {
        const text = success
          ? theme.success(t("model.login_success", { provider: providerName }) + (message ? " " + message : "") )
          : theme.error(t("model.error", { msg: message || "" }));
        this.current = new Text(text, 1, 1);
        if (this.tui && typeof this.tui.requestRender === 'function') {
          this.tui.requestRender();
        }
      },
      providerName
    );

    this.current = dialog;

    try {
      if (authType === "api_key") {
        const apiKey = await (dialog as any).showPrompt(t("model.apikey_prompt", { provider: providerName }));
        if (!apiKey || !apiKey.trim()) {
          throw new Error(t("model.apikey_empty"));
        }
        authStorage.set(providerId, { type: "api_key", key: apiKey.trim() });
        this.runtime.modelRegistry.refresh();
        this.showProviderSelector(authType);
        if (this.tui && typeof this.tui.requestRender === 'function') {
          this.tui.requestRender();
        }
      } else {
        let manualCodeResolve: ((value: string) => void) | undefined;
        let manualCodeReject: ((err: Error) => void) | undefined;
        const manualCodePromise = new Promise<string>((resolve, reject) => {
          manualCodeResolve = resolve;
          manualCodeReject = reject;
        });

        await authStorage.login(providerId, {
          onAuth: (info: any) => (dialog as any).showAuth?.(info.url, info.instructions),
          onDeviceCode: (info: any) => {
            (dialog as any).showDeviceCode?.(info);
            (dialog as any).showWaiting?.(t("model.waiting"));
          },
          onPrompt: (p: any) => (dialog as any).showPrompt?.(p.message, p.placeholder),
          onProgress: (msg: string) => (dialog as any).showProgress?.(msg),
          onSelect: (prompt: any) => this.showOAuthPromptSelector(dialog, prompt),
          onManualCodeInput: () => manualCodePromise,
          signal: (dialog as any).signal,
        });

        this.runtime.modelRegistry.refresh();
        // 刷新 provider 列表以显示 ✓ configured
        this.showProviderSelector(authType);
        if (this.tui && typeof this.tui.requestRender === 'function') {
          this.tui.requestRender();
        }
      }
    } catch (e: any) {
      const msg = e.message || String(e);
      if (msg.toLowerCase().includes("cancel") || msg === "Login cancelled") {
        this.onBack();
      } else {
        this.current = new Text(theme.error(t("model.error", { msg })), 1, 1);
        if (this.tui && typeof this.tui.requestRender === 'function') {
          this.tui.requestRender();
        }
      }
    }
  }

  private showOAuthPromptSelector(dialog: any, prompt: any): Promise<string | undefined> {
    return new Promise((resolve) => {
      const labels = prompt.options.map((o: any) => o.label);
      const selector = new ExtensionSelectorComponent(
        prompt.message,
        labels,
        (optionLabel: string) => {
          this.current = dialog;
          const found = prompt.options.find((o: any) => o.label === optionLabel);
          resolve(found?.id);
        },
        () => {
          this.current = dialog;
          resolve(undefined);
        }
      );
      this.current = selector;
    });
  }

  invalidate(): void {
    this.current?.invalidate?.();
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || data === "q") {
      this.onBack();
      return;
    }
    this.current?.handleInput?.(data);
  }

  render(width: number): string[] {
    const lines: string[] = [];
    lines.push(theme.accent(t("model.title")));
    lines.push("");

    if (this.current) {
      lines.push(...this.current.render(width));
    } else {
      lines.push(t("model.loading"));
    }

    lines.push("");
    lines.push(theme.dim(t("model.hint")));
    return lines.map((l) => truncateToWidth(l, width));
  }
}

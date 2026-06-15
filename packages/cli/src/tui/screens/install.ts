import { DefaultPackageManager, getAgentDir, SettingsManager, Theme } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import { buildInstallPiPackagePlan, parseInstallPiPackageArgs, type InstallPiPackagePlan } from "../../app/install-pi-package.js";
import { messageFromError } from "../utils.js";

export class InstallScreen implements Component {
  private plan: InstallPiPackagePlan | undefined;
  private error: string | undefined;
  private state: "confirm" | "installing" | "cancelled" | "done" | "error" = "confirm";
  private logs: string[] = [];

  constructor(
    private readonly opts: { cwd: string; args: string[]; theme: Theme; requestRender: () => void; onClose: () => void },
  ) {
    try {
      this.plan = buildInstallPiPackagePlan(parseInstallPiPackageArgs(opts.args));
    } catch (error) {
      this.error = messageFromError(error);
      this.state = "error";
    }
  }

  invalidate(): void {}

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || data === "q" || data === "n" || data === "N") {
      if (this.state === "confirm") {
        this.state = "cancelled";
        this.logs.push("Installation cancelled. No Pi settings were changed.");
        this.opts.requestRender();
      } else this.opts.onClose();
      return;
    }
    if ((data === "y" || data === "Y") && this.state === "confirm") void this.install();
  }

  render(width: number): string[] {
    const lines: string[] = [];
    lines.push(this.opts.theme.fg("accent", this.opts.theme.bold("Install RepoChan Pi package")));
    lines.push("This will install the 'repochan-pi' package into your normal Pi user environment.");
    if (this.plan) {
      lines.push(`Source: ${this.plan.sourceLabel}`);
      lines.push(`Pi agent dir: ${getAgentDir()}`);
      if (this.plan.detectedWorkspacePath && !this.plan.localWorkspacePath) {
        lines.push(this.opts.theme.fg("dim", `Local package detected: ${this.plan.detectedWorkspacePath}; use --local to install it.`));
      }
    }
    if (this.error) lines.push(this.opts.theme.fg("error", this.error));
    lines.push("");
    if (this.state === "confirm") lines.push(this.opts.theme.fg("warning", "Proceed with installation? y/N"));
    else lines.push(this.opts.theme.fg(this.state === "done" ? "success" : this.state === "error" ? "error" : "muted", this.state));
    for (const log of this.logs) lines.push(this.opts.theme.fg("dim", log));
    lines.push("");
    lines.push(this.opts.theme.fg("dim", "y install · n/esc cancel · q close after completion"));
    return lines.map((line) => truncateToWidth(line, width, "…"));
  }

  private async install() {
    if (!this.plan) return;
    this.state = "installing";
    this.opts.requestRender();
    const agentDir = getAgentDir();
    const settingsManager = SettingsManager.create(this.opts.cwd, agentDir);
    const packageManager = new DefaultPackageManager({ cwd: this.opts.cwd, agentDir, settingsManager });
    packageManager.setProgressCallback((event: any) => {
      if (event.message) this.logs.push(event.message);
      this.opts.requestRender();
    });
    try {
      await packageManager.install(this.plan.source);
      packageManager.addSourceToSettings(this.plan.source);
      await settingsManager.flush();
      this.state = "done";
      this.logs.push(`Installed and persisted ${this.plan.sourceLabel}.`);
    } catch (error) {
      this.state = "error";
      this.logs.push(messageFromError(error));
    } finally {
      this.opts.requestRender();
    }
  }
}

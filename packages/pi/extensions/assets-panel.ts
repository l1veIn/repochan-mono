import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

export function registerRepoChanPanel(pi: ExtensionAPI) {
  pi.registerCommand("repochan_panel", {
    description: "RepoChan order results replaced the legacy asset browser panel; use order detail views instead.",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      ctx.ui.notify(
        "RepoChan no longer stores order deliverables as separate assets. Use the CLI order detail page or repochan order.list_results/order.get_result.",
        "info",
      );
    },
  });
}

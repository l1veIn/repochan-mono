import { inspectProtocol, listAssets, listOrders } from "@repochan/core";
import { asArray, bullet, dim, heading, printJson, type OutputOptions, yesNo } from "./common.js";

export async function runStatus(cwd: string, options: OutputOptions = {}) {
  const protocol = await inspectProtocol(cwd);
  const orders = protocol.exists ? await listOrders(cwd) : { files: [], orders: [] };
  const assets = protocol.exists ? await listAssets(cwd) : { assets: [] };
  const overview = { protocol, orders, assets };

  if (options.json) {
    printJson(overview);
    return;
  }

  heading("RepoChan status");
  bullet(".repochan", yesNo(protocol.exists));
  bullet("analysis", yesNo(protocol.analysis));
  bullet("persona", yesNo(protocol.persona));
  bullet("analysis versions", asArray(protocol.analysisVersions).length);
  bullet("persona versions", asArray(protocol.personaVersions).length);
  bullet("orders", asArray(orders.orders).length);
  bullet("assets", asArray(assets.assets).length);

  const active = asArray(orders.orders).filter((o: any) => o.status === "in_progress");
  if (active.length) {
    console.log("\nActive work:");
    for (const order of active as any[]) console.log(`- ${order.orderId ?? order.file} ${dim(String(order.assetType ?? ""))}`);
  }

  if (!protocol.exists) console.log(dim("\nNext: run `repochan init` or open the TUI with `repochan`."));
  else if (!protocol.analysis) console.log(dim("\nNext: open Analysis in the TUI and run the Analyst."));
  else if (!protocol.persona) console.log(dim("\nNext: open Persona in the TUI and run the Creative Writer."));
}

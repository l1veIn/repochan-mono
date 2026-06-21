import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerOrderPanel } from "./order-panel.js";
import { registerRepoChan } from "./unified.js";

export default function (pi: ExtensionAPI) {
  registerRepoChan(pi);
  registerOrderPanel(pi);
}

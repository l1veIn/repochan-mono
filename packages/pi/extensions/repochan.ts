import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerRepoChanPanel } from "./assets-panel.js";
import { registerRepoChan } from "./unified.js";

export default function (pi: ExtensionAPI) {
  registerRepoChan(pi);
  registerRepoChanPanel(pi);
}

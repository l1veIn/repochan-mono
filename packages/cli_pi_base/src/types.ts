import { type Component } from "@earendil-works/pi-tui";

export type OnBack = () => void;

export type TuiRef = {
  setFocus: (c: Component) => void;
  requestRender: () => void;
  getTui: () => any;
};

import type {
  ExtensionUIContext,
  KeybindingsManager,
  Theme,
} from "@earendil-works/pi-coding-agent";
import type { Component, OverlayOptions, TUI } from "@earendil-works/pi-tui";

const cliExtensionTheme = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
  bold: (text: string) => text,
  italic: (text: string) => text,
  underline: (text: string) => text,
  inverse: (text: string) => text,
  strikethrough: (text: string) => text,
  getFgAnsi: () => "",
  getBgAnsi: () => "",
  getColorMode: () => "truecolor",
  getThinkingBorderColor: () => (text: string) => text,
  getBashModeBorderColor: () => (text: string) => text,
} as unknown as Theme;

const noopKeybindings = {} as unknown as KeybindingsManager;

type CustomOptions = Parameters<ExtensionUIContext["custom"]>[1];
type ExtensionCustomFactory = Parameters<ExtensionUIContext["custom"]>[0];
type ExtensionTui = Parameters<ExtensionCustomFactory>[0];

function resolveOverlayOptions(options?: CustomOptions): OverlayOptions | undefined {
  const overlayOptions = options?.overlayOptions;
  return typeof overlayOptions === "function" ? overlayOptions() : overlayOptions;
}

function createCustom(tui: TUI): ExtensionUIContext["custom"] {
  return function custom<T>(factory: ExtensionCustomFactory, options?: CustomOptions) {
    return new Promise<T>((resolve, reject) => {
      let component: (Component & { dispose?(): void }) | undefined;
      let closed = false;
      const close = (result: T) => {
        if (closed) return;
        closed = true;
        try {
          tui.hideOverlay();
        } catch {
          // The overlay may already have been dismissed by the user/runtime.
        }
        tui.requestRender();
        resolve(result);
        try {
          component?.dispose?.();
        } catch {
          // Ignore dispose errors from third-party extension UI components.
        }
      };

      const closeUnknown = (result: unknown) => close(result as T);
      Promise.resolve(factory(tui as unknown as ExtensionTui, cliExtensionTheme, noopKeybindings, closeUnknown))
        .then((created) => {
          if (closed) return;
          component = created as unknown as Component & { dispose?(): void };
          const cliComponent = created as unknown as Component;
          const handle = tui.showOverlay(cliComponent, resolveOverlayOptions(options));
          options?.onHandle?.(handle);
          tui.setFocus(cliComponent);
          tui.requestRender();
        })
        .catch(reject);
    });
  };
}

export function createRepoChanExtensionUIContext(tui: TUI): ExtensionUIContext {
  return {
    select: async () => undefined,
    confirm: async () => false,
    input: async () => undefined,
    notify: () => {},
    onTerminalInput: (handler) => tui.addInputListener(handler),
    setStatus: () => {},
    setWorkingMessage: () => {},
    setWorkingVisible: () => {},
    setWorkingIndicator: () => {},
    setHiddenThinkingLabel: () => {},
    setWidget: () => {},
    setFooter: () => {},
    setHeader: () => {},
    setTitle: (title) => tui.terminal.setTitle(title),
    custom: createCustom(tui),
    pasteToEditor: () => {},
    setEditorText: () => {},
    getEditorText: () => "",
    editor: async () => undefined,
    addAutocompleteProvider: () => {},
    setEditorComponent: () => {},
    getEditorComponent: () => undefined,
    get theme() { return cliExtensionTheme; },
    getAllThemes: () => [],
    getTheme: () => undefined,
    setTheme: () => ({ success: false, error: "RepoChan CLI extension UI does not support theme switching." }),
    getToolsExpanded: () => false,
    setToolsExpanded: () => {},
  };
}

import { describe, expect, it } from "vitest";

import en from "../src/locales/en.js";
import zh from "../src/locales/zh.js";

describe("CLI locales", () => {
  it("keeps English and Chinese locale keys in sync", () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
  });

  it("includes the dashboard copy used by the wizard redesign", () => {
    expect(en["wizard.pipeline"]).toBeTruthy();
    expect(en["wizard.next_action"]).toBeTruthy();
    expect(en["wizard.action.enter"]).toBeTruthy();
    expect(zh["wizard.pipeline"]).toBeTruthy();
    expect(zh["wizard.next_action"]).toBeTruthy();
    expect(zh["wizard.action.enter"]).toBeTruthy();
  });
});

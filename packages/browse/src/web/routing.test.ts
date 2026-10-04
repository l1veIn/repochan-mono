import { describe, expect, it } from "vitest";
import { parseHash, viewHash } from "./routing";

describe("browse routes", () => {
  it("keeps version queries out of order ids", () => {
    expect(parseHash("#/order/ord-foundation-001?v=v1")).toEqual({ name: "order", orderId: "ord-foundation-001" });
  });
  it("round trips encoded canvas identifiers", () => {
    const view = { name: "canvas" as const, nodeId: "order:ord-icon-001" };
    expect(parseHash(viewHash(view))).toEqual(view);
  });
  it("falls back safely on malformed escape sequences", () => {
    expect(parseHash("#/order/%zz?v=v1")).toEqual({ name: "orders" });
  });
});

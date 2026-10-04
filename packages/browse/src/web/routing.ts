export type View =
  | { name: "orders" }
  | { name: "order"; orderId: string }
  | { name: "persona" }
  | { name: "analysis" }
  | { name: "interview" }
  | { name: "starters" }
  | { name: "canvas"; nodeId?: string };

export function parseHash(value: string): View {
  // Version selection belongs to OrderDetail, never to the order id.
  const [route] = value.replace(/^#\/?/, "").split("?");
  const [head, encoded] = route.split("/");
  let arg: string | undefined;
  try { arg = encoded ? decodeURIComponent(encoded) : undefined; }
  catch { return { name: "orders" }; }
  if (head === "order" && arg) return { name: "order", orderId: arg };
  if (head === "canvas") return { name: "canvas", nodeId: arg };
  if (head === "persona" || head === "analysis" || head === "interview" || head === "starters") return { name: head };
  return { name: "orders" };
}

export function viewHash(view: View): string {
  if (view.name === "order") return `#/order/${encodeURIComponent(view.orderId)}`;
  if (view.name === "canvas" && view.nodeId) return `#/canvas/${encodeURIComponent(view.nodeId)}`;
  return `#/${view.name}`;
}

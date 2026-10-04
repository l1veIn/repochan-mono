import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { OrderVersion } from "../api";
import { OrderReview } from "./OrderReview";
import { OrderRevisions } from "./OrderRevisions";

function version(versionId: string, reviewed = true): OrderVersion {
  return {
    versionId, createdAt: "2026-10-04T00:00:00.000Z", files: [], reviewError: null,
    review: reviewed ? {
      schemaVersion: "repochan.review.v1", orderId: "ord-fixture", versionId, verdict: "revise",
      reviewerRole: "user", generatedAt: "2026-10-04T00:00:00.000Z", provenance: { tool: "test" },
      notes: `feedback:${versionId}`, criteriaResults: [{ criterion: "colour", passed: false, note: `criterion:${versionId}` }],
    } : null,
  };
}

const render = (selected: OrderVersion | undefined) => renderToStaticMarkup(React.createElement(OrderReview, { version: selected }));

describe("displayed version review", () => {
  it("renders the selected version's verdict, reviewer, feedback, and criteria", () => {
    const markup = render(version("v1"));
    for (const text of ["Review · v1", "revise", "user", "feedback:v1", "colour", "fail", "criterion:v1"]) {
      expect(markup).toContain(text);
    }
    expect(markup).not.toContain("feedback:v2");
  });

  it("does not carry a historical review into an unreviewed current version", () => {
    expect(render(version("v1"))).toContain("feedback:v1");
    const current = render(version("v2", false));
    expect(current).toContain("Review · v2");
    expect(current).toContain("此版本尚无评审记录");
    expect(current).not.toContain("feedback:v1");
  });

  it("labels candidate feedback with that candidate's version", () => {
    const candidate = render(version("candidate-1"));
    expect(candidate).toContain("Review · candidate-1");
    expect(candidate).toContain("feedback:candidate-1");
  });

  it("renders review failures as an alert and safely escapes their text", () => {
    const damaged = { ...version("v1", false), reviewError: "invalid <review>" };
    const markup = render(damaged);
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("invalid &lt;review&gt;");
    expect(markup).not.toContain("此版本尚无评审记录");
  });

  it("omits the review panel when there is no result version", () => {
    expect(render(undefined)).toBe("");
  });

  it("shows an order-level modification request separately from an unreviewed result", () => {
    const markup = renderToStaticMarkup(React.createElement(React.Fragment, null,
      React.createElement(OrderReview, { version: version("v2", false) }),
      React.createElement(OrderRevisions, { revisions: [{
        requestedAt: "2026-10-04T00:00:00.000Z", request: "Reduce the cover saturation", status: "draft",
      }] }),
    ));
    expect(markup).toContain("此版本尚无评审记录");
    expect(markup).toContain("订单修改请求");
    expect(markup).toContain("不绑定某个结果版本");
    expect(markup).toContain("Reduce the cover saturation");
    expect(markup).toContain("requestedAt");
    expect(markup).toContain("draft");
    expect(markup).not.toContain("feedback:v1");
  });
});

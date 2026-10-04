import React from "react";
import type { AssetOrder } from "@repochan/core";
import { Badge } from "../components";

export function OrderRevisions({ revisions }: { revisions: AssetOrder["revisions"] }) {
  if (!revisions?.length) return null;
  return (
    <div className="panel">
      <h4>订单修改请求</h4>
      <p className="dim">这些请求作用于订单，不绑定某个结果版本。</p>
      {revisions.map((revision, i) => (
        <div key={i}>
          <dl className="kv">
            <dt>requestedAt</dt><dd>{new Date(revision.requestedAt).toLocaleString()}</dd>
            <dt>status</dt><dd><Badge text={revision.status} /></dd>
          </dl>
          <p style={{ whiteSpace: "pre-wrap" }}>{revision.request}</p>
        </div>
      ))}
    </div>
  );
}

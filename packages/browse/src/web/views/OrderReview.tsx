import React from "react";
import type { OrderVersion } from "../api";
import { Badge } from "../components";

/** Reviews belong to the displayed result version, including history and candidates. */
export function OrderReview({ version }: { version: OrderVersion | undefined }) {
  if (!version) return null;
  const { review, reviewError } = version;
  return (
    <div className="panel">
      <h4>Review · {version.versionId}</h4>
      {reviewError ? (
        <p role="alert" className="err">无法读取此版本的评审：{reviewError}</p>
      ) : review ? (
        <>
          <dl className="kv">
            <dt>verdict</dt><dd><Badge text={review.verdict} /></dd>
            <dt>reviewerRole</dt><dd>{review.reviewerRole ?? "—"}</dd>
            <dt>generatedAt</dt><dd>{new Date(review.generatedAt).toLocaleString()}</dd>
          </dl>
          {review.notes ? <p style={{ whiteSpace: "pre-wrap" }}>{review.notes}</p> : null}
          {review.criteriaResults?.length ? (
            <ul style={{ paddingLeft: 18 }}>
              {review.criteriaResults.map((criterion, i) => (
                <li key={i}>
                  <Badge text={criterion.passed ? "pass" : "fail"} /> {criterion.criterion}
                  {criterion.note ? <div className="dim" style={{ whiteSpace: "pre-wrap" }}>{criterion.note}</div> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <p className="dim">此版本尚无评审记录。已交付不代表已验收。</p>
      )}
    </div>
  );
}

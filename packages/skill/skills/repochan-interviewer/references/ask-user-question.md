# Ask Interview Questions on the Current Host

Use the coding agent's available question tool when it supports the interview. Inspect that tool's actual schema and mode restrictions instead of assuming a particular extension. Follow its question, option, and batch limits. If it is unavailable or unsuitable, ask in chat; missing questionnaire tooling does not block an interview.

- Offer concrete choices with their implications and a way to express an unlisted preference.
- Ask one short batch, wait for the user's answers, then adapt the next batch. Do not send all 7–14 questions at once.
- Put a recommendation first when helpful, while following the host's labeling convention.
- Use multiple selection only when the host supports it and the question needs it. Otherwise let the user list choices in chat.

## Save the User's Answers

Map actual responses to the interview report described in [report-schema.md](report-schema.md). Preserve the question text and selected labels or free-form wording; tool-specific response envelopes are not the protocol.

A request to continue in free chat changes the question format; it does not erase answers already supplied. If the user skips or cancels the interview, stop asking and follow their intent about retaining earlier answers. A fully skipped interview creates no file. Persist only explicitly expressed constraints and preferences through `repochan interview create` or `append`.

# Security invariants

These are product invariants, not suggestions.

1. The bot never authenticates a MOSAIC user and never decides what that user
   may read. MOSAIC performs those checks first.
2. The bot never receives a browser JWT, password, refresh token, NIC,
   username, actor ID, or unrestricted database row.
3. Every answerable claim must carry an evidence reference from the grounding
   packet. An answer with no supporting evidence is a refusal or a
   deterministic fallback.
4. The bot may only return links from the allow-list in the grounding packet.
5. Workflow selection and permission filtering happen before any model call.
   The model cannot choose a routing variant by guessing from a label.
6. A model failure, timeout, malformed response, or unsupported question must
   degrade to a safe deterministic answer. It must never broaden the query.
7. Logs contain request IDs, contract versions, outcome, latency, and error
   class by default. They do not contain full questions, evidence text, or
   personal data unless a separately approved diagnostic mode is enabled.
8. Development defaults to TEST. LIVE targets require an explicit production
   deployment configuration and an independent release decision.

## Model boundary

The preferred design is that the model receives an `AnswerPlan`, not raw
workflow records. MOSAIC supplies the facts and their IDs; the model may only
produce phrasing and cite those IDs. MOSAIC validates the returned IDs and
links before the response reaches the user.

For highest assurance, MOSAIC may render the final answer deterministically
and use the model only for optional translation or tone.

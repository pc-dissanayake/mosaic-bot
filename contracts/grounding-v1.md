# GroundingPacket v1

`GroundingPacket` is the only information boundary from MOSAIC to the bot.

## Required properties

- `contract_version` is exactly `grounding.v1`.
- `request_id` is an opaque correlation ID; it is not an actor identifier.
- `question` is the current user question, limited to 500 characters.
- `intent` is selected from the closed MOSAIC intent registry.
- `evidence` contains only facts already authorized for this caller.
- `allowed_links` contains the only links the bot may return.
- `constraints.must_refuse_without_evidence` is true for factual answers.

The packet intentionally contains no actor ID, username, NIC, JWT, credential,
database identifier, unrestricted `data_load`, or unfiltered workflow list.

## Minimum evidence shape

Each evidence item has:

```json
{
  "evidence_id": "e17",
  "kind": "workflow_eligibility",
  "label": "Promotion to Grade II",
  "state": "eligible",
  "facts": {
    "blocking_reasons": [],
    "status_label": null,
    "next_holder_label": null
  },
  "source": "workflows.applicable",
  "source_version": "config:1234"
}
```

The `kind`, `state`, and fact keys are controlled vocabulary. Internal routing
short names may be retained by MOSAIC for its own lookup, but should not be
sent to the model unless they are necessary for a reviewed response.

## Answer rule

The bot returns an `AnswerEnvelope` containing evidence IDs. MOSAIC rejects an
answer when:

- an evidence ID is not in the request;
- a link is not in `allowed_links`;
- the answer claims a factual result while returning no evidence IDs;
- the output exceeds the response limit;
- the provider returns malformed or unsafe JSON.

Evidence references are necessary but not sufficient for semantic safety. For
high-risk answers, MOSAIC should render from structured facts rather than trust
free-form model prose.

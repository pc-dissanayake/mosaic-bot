# Knowledge matrix boundary

The knowledge matrix is generated from current MOSAIC configuration and
runtime projections. It is not a hand-written list of medical-officer
workflows and it is not stored in the frontend.

## Matrix rows

The MOSAIC grounding layer may derive rows for:

| Matrix area | Authoritative source | Bot-facing form |
|---|---|---|
| Applicability | `computeApplicable(actorId)` | label, eligible/blocked state, display blocking reasons |
| Routing variant | caller's applicable entry and routing data | already-selected label; internal variant normally omitted |
| Workflow explanation | current or pinned workflow definition | authored summary or generated desk chain |
| Current application | `listVisibleArtifacts(actorId)` and status projection | label, status label, age, allowed artifact link |
| Missing documents | actor definition checklist plus officer-held documents | missing document labels only |
| Profile facts | profile resolver and registry labels | display-ready fact/value pairs |

## Permission order

The order is mandatory:

1. authenticate the caller in MOSAIC;
2. resolve effective authority and scope;
3. choose the caller's applicable workflow variant;
4. read only the permitted current/pinned data;
5. reduce it to the minimum evidence rows;
6. assign evidence IDs and allowed links;
7. send the packet to the separate bot;
8. validate the returned evidence references;
9. render deterministically when evidence is insufficient.

The bot must never receive the complete workflow catalogue and be asked to
decide which rows the caller can see. That would move authorization into a
prompt and would make hallucination indistinguishable from permission logic.

## Versioning

Every evidence row carries a `source_version`. For an in-flight application,
the version must be the run's pinned configuration version. For a new catalog
question, it is the current configuration version. A later workflow edit must
not silently rewrite the explanation of an already-pinned run.

## Retrieval policy

Core workflow and permission answers use deterministic keyed lookup. Embedding
search is not required and must not be used as an authorization mechanism.
Semantic search can be considered later for non-authoritative help prose, with
the returned prose still treated as untrusted context.

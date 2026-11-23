# MOSAIC grounded bot

This is a separate, provider-agnostic bot service for MOSAIC/e-PF.

The service is not an authority layer. MOSAIC remains responsible for:

- authentication and actor identity;
- permission and scope checks;
- workflow applicability and routing;
- current application status;
- document requirements;
- allowed links and source records.

The bot receives only a minimum, already-authorized grounding packet. It may
phrase that packet, or refuse when the packet does not contain enough evidence.
It must never query MOSAIC's database, select another officer, receive a raw
JWT, or invent a workflow fact.

## First milestone

The first milestone defines the contract and safety boundary. It deliberately
has no database connector, LLM provider, or production deployment.

The contract is documented in:

- `contracts/grounding-v1.md`
- `contracts/grounding-v1.schema.json`
- `contracts/answer-v1.schema.json`
- `docs/knowledge-matrix.md`
- `SECURITY.md`

## Intended data flow

```text
MOSAIC API
  authenticates the caller
  computes authorized facts
  filters the workflow knowledge matrix
  creates GroundingPacket v1
        |
        v  service-to-service request
Separate bot service
  optionally phrases only the supplied facts
  returns AnswerEnvelope v1 with evidence references
        |
        v
MOSAIC API
  validates evidence references and links
  falls back to deterministic rendering when needed
  sends the answer to the browser
```

The browser must not call the model directly.

## Development target

Development and integration use TEST only. A future runtime must fail closed
when `BOT_TARGET` is missing or when a non-production process is pointed at a
LIVE MOSAIC URL. This repository must not contain database credentials.

The remote Git URL is intentionally not configured yet; it must be supplied
before the first push so this project cannot accidentally push into the main
MOSAIC repository.

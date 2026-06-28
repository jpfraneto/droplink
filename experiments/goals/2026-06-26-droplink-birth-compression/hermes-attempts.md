# Hermes Attempts

The user explicitly allowed asking the Hermes agent over the bridge API.

Endpoint:

```text
https://hermes.anky.app/prompt
```

Corrected endpoint from Anky:

```text
https://hermes.anky.app/v1/prompt
```

Request shape used:

```json
{
  "prompt": "study instruction",
  "mode": "agent",
  "system": "optional system prompt",
  "max_tokens": 1200,
  "temperature": 0.7
}
```

The bearer token was provided by the user at runtime. It is intentionally not stored here.

## Attempt 1

Prompt:

```text
We are evolving DropLink's birth pipeline. Current pipeline: user submits public URL -> scrape title/description/text -> brand study JSON -> plan exactly 3 relics -> choose Printful catalog product/variant/SKU -> generate one print-ready image prompt per product -> generate/share an image prompt where the 3 products appear together. Please propose 5 distinct compression mechanisms for this pipeline. For each mechanism include: core idea, step-by-step data contract, how it chooses 3 Printful-specific products/SKUs, how it derives print prompts, how it derives the final 3-product group image prompt, failure modes, and what to measure in experiments. Favor mechanisms that are implementable in TypeScript/Next with Hermes as agent and Printful catalog metadata. Avoid vague creativity advice.
```

Result:

- No response after about 90 seconds.
- Request was interrupted manually.

## Attempt 2

Prompt:

```text
DropLink pipeline study. Need 5 distinct mechanisms to compress: public URL evidence -> brand distillation -> exactly 3 Printful-specific products with catalog product id/variant/SKU selection -> print image prompt per product -> group image prompt for all 3 products. Return terse bullets. For each: name, data contract, SKU selection rule, print prompt rule, group prompt rule, failure mode, metric.
```

Result:

- Request used a 45 second abort controller.
- Returned `AbortError`.

## Follow-Up

Hermes is still worth using for future runs, but it should be called through a retryable helper with:

- request timeout,
- structured trace id,
- retries with smaller `max_tokens`,
- persisted request/response metadata,
- fallback to local structured provider or deterministic mock.

## Corrected Endpoint Retest

After Anky clarified the API contract:

- `GET https://hermes.anky.app/hermes/health` returned `ok: true` and listed `POST /v1/prompt`.
- `POST /v1/prompt` with `mode: chat` returned quickly.
- An invalid bearer token returned `401` quickly.
- `POST /v1/prompt` with `mode: agent` and `tag: FEATURE_IDEA` still timed out after 45 seconds for a trivial health-check prompt.

Conclusion: route, auth, and chat mode are healthy. Anky later confirmed agent mode is synchronous long-polling and can take up to about 4 minutes, so DropLink should use a 300 second client timeout or wait for a future async task/status API.

Additional deployment note: an agent request with a 300 second client timeout returned Cloudflare `524` after about 125 seconds. That means synchronous agent mode may finish internally, but it is not a reliable production dependency through `hermes.anky.app`.

Anky then exposed the async task contract:

- `POST /v1/tasks`
- `GET /v1/tasks/:task_id`
- required `Idempotency-Key`

DropLink now uses async Hermes tasks for true `mode: agent` work and polls for completion instead of holding the Cloudflare request open.

If the agent finishes with prose instead of schema JSON, DropLink now asks Hermes chat to repair that agent output into the exact structured schema, then validates the repaired JSON before continuing.

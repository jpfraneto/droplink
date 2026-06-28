# DropLink Experiments

This directory is the workspace for focused DropLink experiments. Keep app code in `src/`, schema changes in `drizzle/`, and use this area for experiment briefs, prompts, fixtures, scripts, and run output.

## Structure

- `current-state.md`: repository baseline captured before starting experiment work.
- `goals/`: one folder per experiment goal or investigation.
- `prompts/`: reusable prompts for generation, brand study, QA, or evaluation.
- `fixtures/`: small checked-in fixtures used by scripts or tests.
- `scripts/`: experiment-only helpers that are not part of the production app.
- `runs/`: local run traces, generated bundles, logs, and scratch artifacts.
- `results/`: summarized outputs, comparisons, screenshots, and measurements.

`runs/` and `results/` are ignored by git except for their `.gitignore` placeholders. Promote only the durable finding, fixture, or code change back into the repo.

## Baseline Commands

Use Bun only.

```bash
bun run typecheck
bun test
bun run dev
```

For production-like generation, use the app's existing admin/worker flow rather than creating legacy capsule JSON:

```http
POST /api/admin/generate
authorization: Bearer ${DROPLINK_API_KEY}
content-type: application/json
```

```json
{
  "url": "https://example.com",
  "tier": "free",
  "type": "genesis"
}
```

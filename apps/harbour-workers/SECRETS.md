# Harbour Workers Secrets

Harbour Workers need the shared API auth secret used to call Harbour API control endpoints:

- `HARBOUR_API_KEY`

Wrangler loads local secrets from files next to [wrangler.jsonc](apps/harbour-workers/wrangler.jsonc).

- `apps/harbour-workers/.dev.vars`
- `apps/harbour-workers/.dev.vars.preview`
- `apps/harbour-workers/.dev.vars.production`

Preview:

```bash
bunx wrangler secret put HARBOUR_API_KEY --config apps/harbour-workers/wrangler.jsonc --env preview
```

Production:

```bash
bunx wrangler secret put HARBOUR_API_KEY --config apps/harbour-workers/wrangler.jsonc --env production
```

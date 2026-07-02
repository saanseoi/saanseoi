# Harbour Workers Secrets

Harbour Workers need the shared API auth secret used to call Harbour API control endpoints and a Cloudflare API token for D1 REST SQL imports:

- `HARBOUR_API_KEY`
- `CLOUDFLARE_D1_TOKEN`

Wrangler loads local secrets from files next to [wrangler.jsonc](apps/harbour-workers/wrangler.jsonc).

- `apps/harbour-workers/.dev.vars`
- `apps/harbour-workers/.dev.vars.preview`
- `apps/harbour-workers/.dev.vars.production`

Preview:

```bash
bunx wrangler secret put HARBOUR_API_KEY --config apps/harbour-workers/wrangler.jsonc --env preview
bunx wrangler secret put CLOUDFLARE_D1_TOKEN --config apps/harbour-workers/wrangler.jsonc --env preview
```

Production:

```bash
bunx wrangler secret put HARBOUR_API_KEY --config apps/harbour-workers/wrangler.jsonc --env production
bunx wrangler secret put CLOUDFLARE_D1_TOKEN --config apps/harbour-workers/wrangler.jsonc --env production
```

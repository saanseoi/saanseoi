# API endpoint structure

SaanSeoi APIs use a small, explicit request path:

```text
src/index.ts middleware and registration
  -> src/routes/<family>/v0/<family>.ts transport handler
  -> src/schema/<family>.ts validation and OpenAPI contract
  -> src/services/<family>.ts orchestration, when needed
  -> src/db/<family>.ts database access, when needed
```

Keep a simple endpoint in its route module. Add a service only when the handler has
substantial orchestration or reusable domain logic, and add a database adapter only when
the endpoint queries storage. Do not create empty layers merely to match the diagram.

## Layer responsibilities

### Worker entry point

`apps/atlas-api/src/index.ts` owns application-wide behaviour:

- middleware ordering, database context and CORS;
- the explicit public-route and authentication decision;
- public-key validation, origin policy, rate limiting and usage accounting;
- route-array registration;
- common error and not-found responses;
- `/openapi`, `/docs` and `/llms.txt`; and
- scheduled Worker entry points.

Do not repeat these controls in each route. CORS controls browser access; it is not an
authentication mechanism. Requests from `https://saanseoi.hk` have a deliberate keyless
convenience path for the public site. That `Origin` value is not a caller identity and
may be forged by non-browser clients; the bypass is intended to cover ordinary site use,
not determined abuse.

### Route module

`apps/atlas-api/src/routes/<family>/v0/<family>.ts` defines the HTTP boundary. It should
contain:

- each `createRoute` OpenAPI declaration;
- the corresponding `defineOpenAPIRoute` handler;
- path, query and body validation through schemas;
- status-code mapping and response content types; and
- one exported `<family>Routes` tuple for registration.

Handlers translate HTTP input into typed service or database arguments. They should not
contain large SQL statements or duplicate application-wide authentication logic. Any
request URL used in response links must pass through `sanitiseResponseUrl` so an
`access_token` query credential is never reflected.

### Schema module

`apps/atlas-api/src/schema/<family>.ts` owns runtime validation and the public OpenAPI
shape. Export it through `apps/atlas-api/src/schema/index.ts`. Put server-enforced
maximums on caller-selected result counts and expensive search inputs, not only
defaults. Reuse response and validation schemas from `schema/common.ts` where their wire
shape is genuinely the same.

### Service module

`apps/atlas-api/src/services/<family>.ts` is optional. Use it for domain orchestration,
snapshot resolution, response document construction or logic shared by multiple routes.
It must not depend on Hono `Context`; pass typed values and dependencies so the service
can be tested directly.

Version-specific handler exports live under
`apps/atlas-api/src/handlers/<family>/<version>.ts`. The unversioned `v0` path may alias
the current pre-release minor. A stable minor keeps its own handler boundary when its
observable behaviour diverges.

### Database module

`apps/atlas-api/src/db/<family>.ts` is optional and owns storage queries and row
mapping. Keep user values in Drizzle expressions or D1 bindings. D1 accepts at most 100
bound variables, so dynamic `inArray()` values and bulk operations must be chunked after
reserving variables used by the rest of the statement. Enforce important work limits
again here when callers other than the route may invoke the function.

## Files to create or modify

For a new endpoint, inspect every row in this table. “When needed” means the endpoint
does not require a placeholder file.

| File                                                       | Required action                                                                                                                                                                   |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/atlas-api/src/schema/<family>.ts`                    | Add request, response and error schemas.                                                                                                                                          |
| `apps/atlas-api/src/schema/index.ts`                       | Export the new schemas.                                                                                                                                                           |
| `apps/atlas-api/src/routes/<family>/v0/<family>.ts`        | Define the OpenAPI route, handler and exported route tuple.                                                                                                                       |
| `apps/atlas-api/src/index.ts`                              | Import and register the route tuple; explicitly classify authentication and public access.                                                                                        |
| `apps/atlas-api/src/services/<family>.ts`                  | Add orchestration only when the route is no longer simple.                                                                                                                        |
| `apps/atlas-api/src/db/<family>.ts`                        | Add parameterised storage access only when needed.                                                                                                                                |
| `apps/atlas-api/src/handlers/<family>/<version>.ts`        | Add or preserve a version boundary when the family has versioned behaviour.                                                                                                       |
| `apps/atlas-api/src/types.ts`                              | Add Hono context variables or Worker bindings used by application code.                                                                                                           |
| `apps/atlas-api/wrangler.jsonc`                            | Configure every new Worker binding in local, preview and production environments.                                                                                                 |
| `apps/atlas-api/worker-configuration.d.ts`                 | Regenerate with `bun run --cwd apps/atlas-api cf-typegen`; do not hand-maintain it.                                                                                               |
| `apps/atlas-api/src/**/*.test.ts`                          | Add schema, service, database and request tests in proportion to the logic.                                                                                                       |
| `apps/atlas-api/src/routes/<family>/v0/*.contract.test.ts` | Add or update executable request/response snapshots for important public contracts.                                                                                               |
| `libs/client/src/generated/**`                             | Regenerate the public client when the OpenAPI contract changes and the client covers the endpoint.                                                                                |
| User documentation                                         | Update any guide that teaches the changed route or contract. Places and map-contract changes require reviewing `/guides/create-a-map` and `docs/guides/create-a-map-coverage.md`. |

The OpenAPI document is built from registered routes at runtime, so a schema or route
that is not exported and registered is not part of the API.

## Authentication and public routes

Every new route must make one explicit decision:

1. Protected data routes use the central public-key middleware for ordinary callers.
2. The first-party `https://saanseoi.hk` origin may use the deliberate keyless site
   path; this path is not an anti-spoofing control.
3. Deliberately public metadata or immutable-asset routes are added to the narrow
   public-path classification in `src/index.ts`.
4. A public route that invokes privileged integrations or performs costly work has a
   dedicated abuse control.

Do not treat CORS or the first-party `Origin` as authentication. Do not add route-local
authentication that silently differs from the central key contract. If a new route is
added, include a request test proving both its intended public access and the continued
protection of a neighbouring data route.

## Validation, errors and links

- Let the OpenAPI schemas validate path, query and JSON inputs. Return the shared 422
  response rather than parsing the same input again in a service.
- Declare every returned status in `createRoute`, including 404, 409, 429 and 503 cases.
- Return stable machine-readable error codes and safe messages. Log underlying errors
  internally; do not return SQL, credentials or stack traces.
- Bound list sizes, search-text length, cursor length and work performed by one request.
- Build pagination and JSON:API links through `src/lib/api.ts`. Preserve ordinary
  filters while removing query credentials.
- For NDJSON or other streaming responses, validate before starting the stream, honour
  stream backpressure and stop work when the reader cancels.

## Versioning and route registration

The Divisions routes demonstrate the current pre-release pattern:

```text
/divisions/v0    -> current latest Divisions v0 minor
/divisions/v0.1  -> explicit Divisions product version
```

Keep operation IDs unique. Do not add compatibility shims for unreleased behaviour; add
a family-specific version only when its public contract diverges.

Registration order matters. Middleware must run before the route it protects, and a
special streaming middleware must run before the OpenAPI JSON handler for the same path.
Add each exported route tuple once to `app.openapiRoutes(...)`.

## Test checklist

At minimum, cover:

- valid input and the main response;
- missing, malformed and over-limit input returning 422;
- the intended authentication or public-route behaviour;
- each declared error status;
- pagination, permalink and credential-removal behaviour when links are returned;
- D1 variable bounds for dynamic arrays;
- publication or revocation boundaries for stored source data;
- streaming completion and cancellation when a stream is used; and
- OpenAPI or request-contract drift for a public response shape.

Run the package checks after implementation:

```sh
bun run --cwd apps/atlas-api check
bun run --cwd apps/atlas-api lint
bun run --cwd apps/atlas-api test
```

If Markdown changed, also run `bun run format:markdown`.

## Small worked example

For a read-only `widgets` list that queries D1, the smallest complete change normally
looks like this:

```text
apps/atlas-api/src/
  schema/widgets.ts          request and response schemas
  schema/index.ts            schema export
  db/widgets.ts              bounded parameterised query
  routes/widgets/v0/widgets.ts       route config, handler, widgetsRoutes export
  routes/widgets/v0/widgets.test.ts  request and error coverage
  index.ts                   widgetsRoutes import and registration
```

Add `services/widgets.ts` only if snapshot selection, cross-query orchestration or
shared response construction makes the handler hard to follow. Add bindings and Wrangler
changes only if the endpoint actually needs a new platform resource.

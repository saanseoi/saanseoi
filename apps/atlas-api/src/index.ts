import { Hono } from "hono";
import { poweredBy } from "hono/powered-by";
import { prettyJSON } from "hono/pretty-json";

import { createDb } from "./db/client";
import {
  getPlaceCurrent,
  listDatasets,
  listPlaceDivisions,
  listPlaceI18n,
  listPlacesByH3Cell,
  searchPlacesFts,
} from "./db/repositories";

type AppEnv = {
  Bindings: CloudflareBindings;
  Variables: {
    db: ReturnType<typeof createDb>;
  };
};

const app = new Hono<AppEnv>();

app.use("*", poweredBy());
app.use("/v1/*", prettyJSON());
app.use("/v1/*", async (c, next) => {
  c.set("db", createDb(c.env.DB));
  await next();
});

app.onError((error, c) => {
  console.error(error);
  return c.json(
    {
      error: "internal_error",
      message: "The atlas API request failed.",
    },
    500,
  );
});

app.notFound((c) =>
  c.json(
    {
      error: "not_found",
      message: "Route not found.",
    },
    404,
  ),
);

app.get("/", (c) =>
  c.json({
    service: "atlas-api",
    version: 1,
    routes: ["/v1/meta/health", "/v1/meta/datasets", "/v1/:region/places/:id"],
  }),
);

app.get("/v1/meta/health", async (c) => {
  const ping = await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
  const datasetCount = await c.env.DB.prepare('SELECT COUNT(*) AS "count" FROM "datasets"').first<{ count: number }>();

  return c.json({
    ok: ping?.ok === 1,
    datasetCount: Number(datasetCount?.count ?? 0),
  });
});

app.get("/v1/meta/datasets", async (c) => {
  const activeOnly = c.req.query("activeOnly");
  const rows = await listDatasets(c.env.DB, {
    regionCode: c.req.query("regionCode"),
    snapshotMonth: c.req.query("snapshotMonth"),
    theme: c.req.query("theme"),
    status: c.req.query("status"),
    isActive: activeOnly === undefined ? undefined : activeOnly === "true",
    limit: c.req.query("limit") ? Number(c.req.query("limit")) : undefined,
  });

  return c.json({
    datasets: rows,
  });
});

app.get("/v1/:region/places/:id", async (c) => {
  const regionCode = c.req.param("region");
  const placeId = c.req.param("id");
  const locale = c.req.query("locale");
  c.get("db");

  const place = await getPlaceCurrent(c.env.DB, { regionCode, placeId });

  if (!place) {
    return c.json(
      {
        error: "not_found",
        message: `No place found for ${regionCode}/${placeId}.`,
      },
      404,
    );
  }

  const [i18n, divisions] = await Promise.all([
    listPlaceI18n(c.env.DB, { placeId, locale }),
    listPlaceDivisions(c.env.DB, { placeId, locale }),
  ]);

  return c.json({
    place,
    i18n,
    divisions,
  });
});

app.get("/v1/:region/places/by-cell/:h3Level/:h3Cell", async (c) => {
  const h3Level = Number(c.req.param("h3Level"));

  if (!Number.isInteger(h3Level)) {
    return c.json(
      {
        error: "invalid_h3_level",
        message: "h3Level must be an integer.",
      },
      400,
    );
  }

  c.get("db");

  const places = await listPlacesByH3Cell(c.env.DB, {
    regionCode: c.req.param("region"),
    h3Level,
    h3Cell: c.req.param("h3Cell"),
    limit: c.req.query("limit") ? Number(c.req.query("limit")) : undefined,
  });

  return c.json({
    places,
  });
});

app.get("/v1/:region/search", async (c) => {
  const query = c.req.query("q");

  if (!query) {
    return c.json(
      {
        error: "missing_query",
        message: "q is required.",
      },
      400,
    );
  }

  try {
    const results = await searchPlacesFts(c.env.DB, {
      regionCode: c.req.param("region"),
      locale: c.req.query("locale"),
      query,
      limit: c.req.query("limit") ? Number(c.req.query("limit")) : undefined,
    });

    return c.json({
      results,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("FTS index is not initialized")) {
      return c.json(
        {
          error: "fts_not_ready",
          message: error.message,
        },
        503,
      );
    }

    throw error;
  }
});

export default app;

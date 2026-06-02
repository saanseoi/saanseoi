import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "../../libs/db/src/schema/index.ts",
  out: "../../libs/db/migrations",
  strict: true,
  verbose: true,
});

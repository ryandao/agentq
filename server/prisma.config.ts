import "dotenv/config";
import { defineConfig } from "prisma/config";
import { buildDatabaseUrl } from "./src/lib/database-url";

const url = buildDatabaseUrl();
if (!url) {
    throw new Error(
        "Database not configured. Set DATABASE_URL or DB_HOST/DB_USER/DB_PASSWORD/DB_NAME.",
    );
}
process.env.DATABASE_URL = url;

export default defineConfig({
    schema: "prisma/schema.prisma",
    migrations: {
        path: "prisma/migrations",
    },
    engine: "classic",
    datasource: {
        url,
    },
});

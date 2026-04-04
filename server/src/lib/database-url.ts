export function buildDatabaseUrl(): string | undefined {
    if (process.env.DATABASE_URL) {
        return process.env.DATABASE_URL;
    }

    const host = process.env.DB_HOST;
    const port = process.env.DB_PORT || "5432";
    const user = process.env.DB_USER;
    const password = process.env.DB_PASSWORD;
    const name = process.env.DB_NAME;
    const schema = process.env.DB_SCHEMA || "public";

    if (!host || !user || !password || !name) {
        return undefined;
    }

    const encodedPassword = encodeURIComponent(password);
    return `postgresql://${user}:${encodedPassword}@${host}:${port}/${name}?schema=${schema}`;
}

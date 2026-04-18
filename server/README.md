# AgentQ Server

The observability dashboard for AgentQ. Built with Next.js 14, Prisma (PostgreSQL), and Redis.

## Features

- Run and span tracing with timeline visualization
- Token usage tracking across LLM providers
- Live worker and queue inspection (Celery/Redis)
- AI-powered natural language search (Gemini)
- Session grouping with auto-generated titles and summaries
- Infrastructure monitoring and health suggestions

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 6+ (optional, for queue inspection)

### Install and Run

```bash
npm install
cp .env.example .env   # edit with your database credentials
npm run dev
```

The server starts at `http://localhost:3000`.

### Database

Run migrations to set up the schema:

```bash
npx prisma migrate deploy
```

To generate the Prisma client after schema changes:

```bash
npx prisma generate
```

## Environment Variables

See [`.env.example`](.env.example) for all available configuration options.

| Variable | Required | Description |
|----------|----------|-------------|
| `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Yes | PostgreSQL connection |
| `AGENTQ_REDIS_URL` | No | Redis URL for queue inspection |
| `AGENTQ_TASK_QUEUE_SYSTEM` | No | `celery` or `none` |
| `AGENTQ_SERVER_ADMIN_USERNAME/PASSWORD` | No | Basic auth for the dashboard |
| `AGENTQ_INGEST_API_KEY` | No | Bearer token for the `/v1/traces` endpoint |
| `GEMINI_API_KEY` | No | Enables AI search and session summaries |

## Deployment

A multi-stage `Dockerfile` is included for production builds. Releases tagged as `server-v<version>` publish a reusable image to GHCR, and manual workflow runs can publish ad hoc tags.

```bash
docker pull ghcr.io/ryandao/agentq-server:<version>
docker run -p 3000:3000 --env-file .env ghcr.io/ryandao/agentq-server:<version>
```

## Testing

```bash
npm test             # run once
npm run test:watch   # watch mode
```

## License

[MIT](../LICENSE)

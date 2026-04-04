# Contributing to AgentQ

Thanks for your interest in contributing! Here's how to get set up.

## Development Setup

### Server (Next.js)

```bash
cd server
npm install
cp .env.example .env   # configure your database and Redis
npm run dev            # starts at http://localhost:3000
```

Run tests and linting:

```bash
npm test
npm run lint
```

### SDK (Python)

```bash
cd sdk
pip install -e ".[dev]"
```

## Code Style

- **TypeScript**: Prettier (4-space indent) and ESLint are configured in `server/`. Run `npm run lint` to check.
- **Python**: Follow PEP 8. We use 4-space indentation.

## Pull Requests

1. Fork the repo and create a feature branch.
2. Make your changes with clear commit messages.
3. Add tests for new functionality where practical.
4. Ensure `npm test` and `npm run lint` pass for server changes.
5. Open a PR with a description of what changed and why.

## Project Structure

```
server/          Next.js observability dashboard
  src/app/       App Router pages and API routes
  src/client/    React components and client-side logic
  src/server/    Server-side business logic
  prisma/        Database schema and migrations

sdk/             Python SDK
  agentq/        Main package
  agentq/integrations/  Auto-instrumentation patches
```

## Reporting Issues

Please open a GitHub issue with:
- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, Node/Python version)

# LinkSphere Backend

Express.js API server for the LinkSphere URL shortener.

See the [root README](../README.md) for full documentation.

## Quick Start

```bash
npm install
cp .env.example .env
# Edit .env with your MongoDB URI, Redis URL, JWT secrets, and Brevo API key
npm start
```

## Scripts

| Command | Description |
|---|---|
| `npm start` | Start the API server |
| `npm test` | Run 528 tests across 19 suites |
| `npm run worker:analytics` | Start the analytics queue worker |

## Environment

Requires:
- Node.js 22+
- MongoDB 8+
- Redis 6+

See `.env.example` for all configuration options.

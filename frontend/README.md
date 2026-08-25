# LinkSphere Frontend

React 19 single-page application for the LinkSphere URL shortener.

## Tech Stack

| Technology | Purpose |
|---|---|
| **React 19** | UI framework |
| **React Router 7** | Client-side routing |
| **Vite 8** | Build tool and dev server |
| **Tailwind CSS 4** | Utility-first styling |
| **Axios** | HTTP client with interceptors and single-flight refresh |
| **Recharts** | Analytics charts |
| **date-fns** | Date formatting |
| **OxLint** | Fast linting |
| **Zod** | Schema validation |

## Getting Started

```bash
npm install
cp .env.example .env
# Edit .env with your API base URL
npm run dev
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server (http://localhost:5173) |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run lint` | Run OxLint |

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_API_BASE_URL` | No | `http://localhost:5000` | Backend API base URL |
| `VITE_PUBLIC_REDIRECT_BASE_URL` | No | `http://localhost:5000` | Base URL for generated short links |

## Architecture

### Axios Configuration

- Request interceptor attaches `Authorization: Bearer <token>` from localStorage
- **Single-flight refresh:** Only one refresh request at a time; concurrent 401s queue behind the in-flight refresh
- `_retry` flag prevents queued requests from triggering a second refresh cycle
- Auth endpoints excluded from 401 redirect logic
- Failed refresh clears tokens and redirects to `/login`

### Key Directories

```
src/
  components/     # Reusable UI components (auth/, brand/, layout/, url/)
  context/        # React Context (AuthContext)
  hooks/          # Custom hooks (useLinks, useLinkDetails, useOverview)
  layouts/        # Route layouts (RootLayout, AuthLayout, AppLayout)
  pages/          # Page components (12 pages)
  services/       # API client and service functions
  shared/         # Shared validators
  utils/          # Utility functions
```

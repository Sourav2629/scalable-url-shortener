# LinkSphere

**Fast, clean URL shortener with analytics, custom aliases, and secure account management.**

[![Node.js](https://img.shields.io/badge/Node.js-22+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![MongoDB](https://img.shields.io/badge/MongoDB-8+-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4+-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Authentication System](#authentication-system)
- [Link Management](#link-management)
- [Analytics Pipeline](#analytics-pipeline)
- [Email Service](#email-service)
- [Security](#security)
- [Testing](#testing)
- [Frontend Architecture](#frontend-architecture)
- [Design System](#design-system)
- [Deployment](#deployment)

---

## Overview

LinkSphere is a full-stack URL shortening platform built with a production-grade architecture. It provides instant anonymous link shortening on the public homepage, plus a complete authenticated workspace with custom aliases, link management, click analytics, and account settings.

**Key architectural decisions:**

- **Modular monolith** -- Clean separation of concerns using domain-driven module structure (auth, urls, analytics, users) with dedicated application, infrastructure, and presentation layers.
- **Pending Registration pattern** -- User accounts are only created after successful email OTP verification. An unverified registration never becomes a real account.
- **Background analytics** -- Click events are published to a Redis-backed BullMQ queue and processed asynchronously by a dedicated worker, keeping redirect latency minimal.
- **Provider-agnostic email** -- Email delivery is abstracted behind an `EmailService` interface with a Brevo adapter. Switching to Resend, SES, or SMTP requires zero changes to business logic.

---

## Features

### Public (No Account Required)

- Instant URL shortening from the homepage
- 7-character auto-generated short codes
- Automatic 302 redirects with expiration support
- Rate-limited public endpoints

### Authenticated Workspace

- **Custom Aliases** -- Claim human-readable short codes (e.g., `/summer-sale`)
- **Link Management** -- Create, edit, soft-delete, activate/deactivate links
- **Link Expiration** -- Set optional expiration dates; expired links are blocked at redirect time
- **Click Analytics** -- Browser, OS, device, and referrer breakdowns per link
- **Dashboard Overview** -- Total links, active/inactive counts, total clicks, top-performing link
- **Profile Management** -- Edit display name, change password, permanently delete account

### Authentication & Security

- Email + password registration with OTP verification
- JWT access + refresh token pair
- Forgot password / reset password via OTP
- Password change with session invalidation
- Permanent account deletion with full data cascade
- Rate limiting per endpoint group (auth, public, API)
- Helmet security headers
- CORS configuration

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (React 19)                       │
│                                                                     │
│  HomePage ─── UrlShortenerForm ──> POST /api/v1/public/urls        │
│                                                                     │
│  AuthPages ──> AuthContext ──> JWT (localStorage) ──> Axios        │
│                                                                     │
│  AppShell ──> OverviewPage | LinksPage | LinkDetailsPage | Profile │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ Axios + Bearer token
                            v
┌─────────────────────────────────────────────────────────────────────┐
│                     EXPRESS API (Node.js 22)                        │
│                                                                     │
│  ┌─ Auth Module ──────────────────────────────────────────────────┐ │
│  │  Routes → Validators → Controller → AuthService → Repository  │ │
│  │  JWT middleware │ PendingRegistration │ VerificationToken       │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌─ URL Module ───────────────────────────────────────────────────┐ │
│  │  Routes → Validators → Controller → UrlService → Repository   │ │
│  │  Short code generator │ Ownership enforcement │ Soft delete    │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌─ Analytics Module ─────────────────────────────────────────────┐ │
│  │  Routes → Controller → AnalyticsService → Repository          │ │
│  │  Summary │ Timeseries │ Ownership verification                 │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌─ Shared ───────────────────────────────────────────────────────┐ │
│  │  EmailService ──> BrevoEmailProvider                           │ │
│  │  Rate limiters │ CORS │ Logger (Pino) │ AppError              │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  POST /api/v1/public/urls ──> UrlService.createPublicUrl()         │
│  GET  /:shortCode ──> UrlService.getUrlByShortCode()               │
│                        ──> AnalyticsQueue.publishClickEvent()       │
└──────────┬──────────────────────────────────────┬──────────────────┘
           │                                      │
           v                                      v
┌──────────────────┐                   ┌──────────────────────┐
│    MongoDB 8     │                   │   Redis + BullMQ     │
│                  │                   │                      │
│  Users           │                   │  analytics-clicks    │
│  Urls            │                   │  queue               │
│  AnalyticsEvents │                   └──────────┬───────────┘
│  Verification    │                              │
│  Tokens          │                   ┌──────────▼───────────┐
│  Pending         │                   │  Analytics Worker    │
│  Registrations   │                   │  (analytics.worker)  │
└──────────────────┘                   │  Process click event │
                                       │  Parse UA & referrer │
                                       │  Write AnalyticsEvent│
                                       └──────────────────────┘
```

---

## Tech Stack

### Backend

| Technology | Purpose |
|---|---|
| **Node.js 22+** | Runtime |
| **Express 5** | HTTP framework |
| **MongoDB 8** (Mongoose 9) | Primary database |
| **Redis** (ioredis) | Job queue backend |
| **BullMQ** | Background job processing (analytics) |
| **bcrypt** | Password hashing (12 salt rounds) |
| **jsonwebtoken** | Access + refresh token pair |
| **Pino** + pino-http | Structured logging |
| **Helmet** | Security headers |
| **express-rate-limit** | Per-route rate limiting |
| **ua-parser-js** | User-agent parsing for analytics |
| **Jest** + supertest | Testing |

### Frontend

| Technology | Purpose |
|---|---|
| **React 19** | UI framework |
| **React Router 7** | Client-side routing |
| **Vite 8** | Build tool and dev server |
| **Tailwind CSS 4** | Utility-first styling |
| **Axios** | HTTP client with interceptors |
| **Recharts** | Analytics charts |
| **date-fns** | Date formatting |
| **OxLint** | Fast linting |

### Email

| Technology | Purpose |
|---|---|
| **Brevo** | Transactional email provider |
| **Native fetch** | Brevo API calls (no axios dependency) |

---

## Project Structure

```
backend/
  src/
    app.js                          # Express app configuration
    server.js                       # Server startup + graceful shutdown
    config/index.js                 # Centralized env configuration
    infrastructure/
      database/mongodb.js           # Mongoose connection
      email/
        index.js                    # Email provider wiring
        brevo-email.provider.js     # Brevo-specific adapter
      queue/analytics.queue.js      # BullMQ queue setup
    modules/
      auth/
        application/auth.service.js
        infrastructure/
          jwt/token.service.js
          models/
            pending-registration.model.js
            verification-token.model.js
          repositories/
            pending-registration.repository.js
            verification-token.repository.js
        presentation/
          controllers/auth.controller.js
          middleware/auth.middleware.js
          routes/auth.routes.js
          validators/
            auth.validator.js
            profile.validator.js
            verification.validator.js
      urls/
        application/
          short-code.generator.js
          url.service.js
        infrastructure/
          models/url.model.js
          repositories/url.repository.js
        presentation/
          controllers/url.controller.js
          routes/
            public-url.routes.js
            public-create-url.routes.js
            public-alias-check.routes.js
            url.routes.js
          validators/url.validator.js
      analytics/
        application/analytics.service.js
        infrastructure/
          models/analytics-event.model.js
          repositories/analytics.repository.js
        presentation/routes/analytics.routes.js
        utils/referrer-classifier.js, ua-parser.js
      users/
        infrastructure/
          models/user.model.js
          repositories/user.repository.js
    shared/
      errors/app-error.js
      logger/index.js
      middleware/cors.middleware.js, rate-limiter.middleware.js
      services/email.service.js
    workers/analytics.worker.js
  tests/ (9 test suites, 313 tests)
  .env.example

frontend/
  src/
    App.jsx, main.jsx, index.css
    components/auth/, brand/, layout/, url/
    context/AuthContext.jsx
    hooks/useLinks.js, useLinkDetails.js, useOverview.js
    layouts/RootLayout.jsx, AuthLayout.jsx, AppLayout.jsx
    pages/ (12 pages)
    services/api.js, auth.service.js, url.service.js
    shared/validators/link.validator.js
    utils/url-builder.js
  .env.example, index.html, vite.config.js
```

---

## Getting Started

### Prerequisites

- **Node.js** 22+ (recommended via [nvm](https://github.com/nvm-sh/nvm))
- **MongoDB** 8+ (local instance or Atlas)
- **Redis** 6+ (for analytics job queue)
- **Brevo account** (free tier) for transactional email

### 1. Clone the repository

```bash
git clone https://github.com/your-username/linksphere.git
cd linksphere
```

### 2. Install dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 3. Configure environment variables

```bash
# Backend
cd backend
cp .env.example .env
# Edit .env with your MongoDB URI, Redis URL, JWT secrets, and Brevo API key

# Frontend
cd ../frontend
cp .env.example .env
# Edit .env with your API base URL
```

### 4. Start the services

```bash
# Terminal 1: Backend API
cd backend
npm start

# Terminal 2: Analytics worker (optional, required for click analytics)
cd backend
npm run worker:analytics

# Terminal 3: Frontend dev server
cd frontend
npm run dev
```

The app is now running at:
- **Frontend:** `http://localhost:5173`
- **Backend API:** `http://localhost:5000`

### 5. Run tests

```bash
# Backend (313 tests)
cd backend
npm test

# Frontend build check
cd frontend
npm run build
```

---

## Environment Variables

### Backend (`.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `5000` | Server port |
| `NODE_ENV` | No | `development` | Environment mode |
| `MONGODB_URI` | **Yes** | -- | MongoDB connection string |
| `REDIS_URL` | No | `redis://localhost:6379` | Redis connection string |
| `JWT_ACCESS_SECRET` | **Yes** | -- | Access token signing secret |
| `JWT_REFRESH_SECRET` | **Yes** | -- | Refresh token signing secret |
| `JWT_ACCESS_TOKEN_EXPIRES_IN` | No | `15m` | Access token TTL |
| `JWT_REFRESH_TOKEN_EXPIRES_IN` | No | `7d` | Refresh token TTL |
| `CORS_ALLOWED_ORIGINS` | No | `*` | Comma-separated allowed origins |
| `RATE_LIMIT_AUTH_MAX` | No | `10` | Auth rate limit (requests per window) |
| `RATE_LIMIT_AUTH_WINDOW_MS` | No | `900000` | Auth rate limit window (15 min) |
| `RATE_LIMIT_PUBLIC_MAX` | No | `100` | Public redirect rate limit |
| `RATE_LIMIT_PUBLIC_WINDOW_MS` | No | `60000` | Public redirect window (1 min) |
| `RATE_LIMIT_PUBLIC_SHORTEN_MAX` | No | `10` | Public shorten rate limit |
| `RATE_LIMIT_PUBLIC_SHORTEN_WINDOW_MS` | No | `60000` | Public shorten window (1 min) |
| `RATE_LIMIT_API_MAX` | No | `300` | Authenticated API rate limit |
| `RATE_LIMIT_API_WINDOW_MS` | No | `900000` | API rate limit window (15 min) |
| `EMAIL_PROVIDER` | No | `brevo` | Email provider identifier |
| `EMAIL_FROM_EMAIL` | No | `noreply@linksphere.app` | Sender email address |
| `EMAIL_FROM_NAME` | No | `LinkSphere` | Sender display name |
| `BREVO_API_KEY` | **Yes** (if using email) | -- | Brevo transactional API key |
| `BREVO_API_URL` | No | `https://api.brevo.com/v3` | Brevo API base URL |
| `SHUTDOWN_TIMEOUT` | No | `10000` | Graceful shutdown timeout (ms) |

### Frontend (`.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_API_BASE_URL` | No | `http://localhost:5000` | Backend API base URL |
| `VITE_PUBLIC_REDIRECT_BASE_URL` | No | `http://localhost:5000` | Base URL for generated short links |

---

## API Reference

### Public Endpoints (No Authentication)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/health/live` | Liveness probe |
| `GET` | `/health/ready` | Readiness probe (checks MongoDB) |
| `POST` | `/api/v1/public/urls` | Create short URL (anonymous) |
| `GET` | `/api/v1/public/urls/check/:alias` | Check alias availability |
| `GET` | `/:shortCode` | Redirect to original URL |

### Authentication

| Method | Endpoint | Rate Limit | Description |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | 10/15min | Register (creates pending registration) |
| `POST` | `/api/v1/auth/login` | 10/15min | Login (returns JWT pair) |
| `POST` | `/api/v1/auth/logout` | -- | Logout (clears refresh token) |
| `GET` | `/api/v1/auth/me` | -- | Get current user |
| `POST` | `/api/v1/auth/verify-email` | -- | Verify email with OTP |
| `POST` | `/api/v1/auth/resend-verification` | -- | Resend verification OTP |
| `POST` | `/api/v1/auth/forgot-password` | -- | Request password reset OTP |
| `POST` | `/api/v1/auth/reset-password` | -- | Reset password with OTP |
| `POST` | `/api/v1/auth/resend-password-reset` | -- | Resend password reset OTP |
| `PATCH` | `/api/v1/auth/profile` | -- | Update display name |
| `POST` | `/api/v1/auth/change-password` | -- | Change password (requires current) |
| `DELETE` | `/api/v1/auth/account` | -- | Permanently delete account |

### Authenticated URL Management

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/urls` | Create link (with optional custom alias) |
| `GET` | `/api/v1/urls` | List user links (paginated, searchable) |
| `GET` | `/api/v1/urls/:id` | Get link details |
| `PATCH` | `/api/v1/urls/:id` | Update link |
| `DELETE` | `/api/v1/urls/:id` | Soft-delete link |

### Analytics

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/urls/:id/analytics/summary` | Browser, OS, device, referrer breakdown |
| `GET` | `/api/v1/urls/:id/analytics/timeseries` | Click timeseries (hourly/daily) |

---

## Authentication System

### Registration Flow

```
Register form
    |
    v
POST /api/v1/auth/register
    |
    +-- Check if verified User exists --> 409 conflict
    +-- Check if unverified User exists --> resend OTP path
    +-- Create/update PendingRegistration
       |
       v
    Generate 6-digit OTP
    Hash OTP with bcrypt
    Store VerificationToken (purpose: email_verification)
    Send OTP email via Brevo
    |
    v
Return { message, email }
No accessToken. No refreshToken. No User document.
    |
    v
Navigate to /verify-email
```

### Email Verification Flow

```
/verify-email
    |
    v
User enters 6-digit OTP
    |
    v
POST /api/v1/auth/verify-email { email, code }
    |
    +-- Find PendingRegistration
    +-- Find VerificationToken (purpose: email_verification)
    +-- Validate OTP against bcrypt hash
    +-- Check expiration (15 min)
    +-- Check attempt limit (5 max)
    |
    v (if valid)
Create real User document
Set isEmailVerified: true
Delete PendingRegistration
Mark VerificationToken as used
Generate JWT access + refresh tokens
    |
    v
Return { user, tokens: { accessToken, refreshToken } }
Frontend stores tokens -> navigates to /app
```

### Login Flow

```
Login form
    |
    v
POST /api/v1/auth/login { email, password }
    |
    +-- Find User by email (with password)
    +-- Compare bcrypt hash
    |
    +-- If not found or wrong password --> 401
    +-- If isEmailVerified === false --> 403 EMAIL_NOT_VERIFIED
    |
    v (if verified)
Generate JWT access + refresh tokens
Update User.refreshToken
    |
    v
Return { user, tokens: { accessToken, refreshToken } }
```

### Token Architecture

- **Access token:** 15-minute TTL, signed with `JWT_ACCESS_SECRET`
- **Refresh token:** 7-day TTL, signed with `JWT_REFRESH_SECRET`, bcrypt-hashed and stored on User document
- **Session bootstrap:** On page load, frontend validates stored token via `GET /auth/me`
- **401 handling:** Axios interceptor clears session and redirects to `/login` on 401 from protected endpoints
- **Password reset:** Invalidates existing refresh token (forces re-login)
- **Account deletion:** Permanent hard-delete of User and all associated data

---

## Link Management

### URL Model

| Field | Type | Description |
|---|---|---|
| `owner` | ObjectId or null | User who created the link (null for anonymous) |
| `originalUrl` | String | Target URL |
| `shortCode` | String | Unique short code (index) |
| `title` | String or null | Optional title |
| `description` | String or null | Optional description |
| `expiresAt` | Date or null | Optional expiration time |
| `clickCount` | Number | Denormalized click counter |
| `isActive` | Boolean | User-controlled active/inactive toggle |
| `isDeleted` | Boolean | Soft delete flag |
| `deletedAt` | Date or null | Soft delete timestamp |

### Expiration Status

Expiration is computed at request time, never mutated in the database:

```
isExpired = Boolean(expiresAt && expiresAt <= now)
```

The API returns both `isActive` (user manual setting) and `isExpired` (derived from `expiresAt`). The frontend displays the effective status.

### Short Code Generation

- 7-character alphanumeric codes generated using `crypto.randomInt()`
- Collision check against database before use
- Maximum 5 retry attempts per creation request
- Custom aliases validated for format and uniqueness
- Aliases freed permanently on hard-delete (account deletion)

### Soft Delete vs Hard Delete

| Operation | Behavior |
|---|---|
| User deletes a link | **Soft delete** -- `isDeleted: true`, link hidden, redirect returns 404 |
| User deletes account | **Hard delete** -- all URLs permanently removed, short codes freed |

---

## Analytics Pipeline

### Click Event Flow

```
GET /:shortCode
    |
    v
UrlService.getUrlByShortCode()
    +-- Validate: exists, active, not expired, not deleted
    +-- Increment clickCount on Url document
    +-- Publish click event to BullMQ queue
        |
        v
    Analytics Worker (analytics.worker.js)
        +-- Receive job
        +-- Parse user-agent -> browser, OS, device type
        +-- Classify referrer -> traffic source
        +-- Anonymize IP (truncate last octet)
        +-- Write AnalyticsEvent to MongoDB
```

### Analytics Data

| Field | Description |
|---|---|
| `eventId` | UUID for idempotency |
| `urlId` | Reference to Url document |
| `shortCode` | Denormalized short code |
| `timestamp` | Event time |
| `anonymizedIp` | IP with last octet zeroed |
| `userAgent` | Raw user-agent string |
| `referrer` | Request referer header |
| `userId` | Owner of the link (for queries) |
| `metadata` | Parsed: browser, OS, deviceType, trafficSource |

### Data Retention

Analytics events have a **90-day TTL index** on `timestamp`. MongoDB automatically deletes expired events.

### Aggregate Endpoints

- **Summary:** Top browsers, OS, devices, and traffic sources (all-time)
- **Timeseries:** Click data grouped by `day` or `hour` within a date range

---

## Email Service

### Architecture

```
AuthService
    |
    v
EmailService (application layer)
    |
    v
Email Provider Adapter (infrastructure layer)
    |
    v
Brevo (or Resend, SES, SMTP)
```

The `EmailService` class is the only interface business logic uses. It accepts any provider with a `send({ to, subject, html })` method.

### Email Types

| Email | Trigger | Content |
|---|---|---|
| Verification | Registration, resend verification | 6-digit OTP code |
| Password Reset | Forgot password, resend reset | 6-digit OTP code |

### Provider Isolation

- `BrevoEmailProvider` is the only file that references Brevo by name
- All Brevo-specific configuration (API key, endpoint, request format) is contained in the adapter
- Switching providers requires: (1) create new adapter class, (2) update `infrastructure/email/index.js`
- `AuthService` and controllers remain completely unchanged

---

## Security

### Password Storage

- bcrypt with **12 salt rounds**
- Password field has `select: false` in the Mongoose schema -- never returned in API responses
- Password hashes never logged

### JWT Security

- Short-lived access tokens (15 min)
- Refresh tokens bcrypt-hashed before database storage
- Refresh token cleared on password change, password reset, and account deletion
- Access token validated against current `isEmailVerified` status on every authenticated request

### Rate Limiting

| Group | Limit | Window | Applies To |
|---|---|---|---|
| Auth | 10 requests | 15 min | `/api/v1/auth/*` |
| Public Shorten | 10 requests | 1 min | `/api/v1/public/urls` |
| Public Redirect | 100 requests | 1 min | `/:shortCode` |
| API | 300 requests | 15 min | `/api/v1/urls/*` |

All rate limiting uses IP-based keying via `express-rate-limit`.

### OTP Security

- 6-digit codes generated with `crypto.randomInt()` (cryptographically secure)
- Hashed with bcrypt before storage
- 15-minute expiration
- Maximum 5 verification attempts
- Old OTPs invalidated when new ones are generated
- OTPs never returned in API responses
- OTPs never logged

### Account Enumeration Protection

- Forgot password returns the same response for existing and non-existing emails
- Registration conflicts return the same message whether email exists or is pending

### Additional Protections

- **Helmet** security headers on all responses
- **CORS** configurable per environment
- **Input validation** on all endpoints (email format, password length, OTP format)
- **IP anonymization** for analytics (last octet zeroed)
- **Global error handler** suppresses stack traces and internal details in production
- **Soft delete** for links (preserves data), **hard delete** for accounts (complete removal)

---

## Testing

### Backend Tests (313 tests)

```bash
cd backend
npm test
```

| Test Suite | Tests | Coverage |
|---|---|---|
| `auth.test.js` | Register, login, JWT, middleware, validators | Core auth flow |
| `urls.test.js` | CRUD, ownership, expiry, serialization, validators | URL management |
| `analytics.test.js` | Click processing, aggregation, timeseries | Analytics pipeline |
| `verification.test.js` | OTP generation, verification, resend, PendingRegistration | Email verification |
| `password-reset.test.js` | Forgot, reset, resend, deleted-account security | Password reset |
| `profile.test.js` | Name update, password change, account deletion, data cascade | Account management |
| `email.service.test.js` | EmailService abstraction, provider delegation, HTML templates | Email layer |
| `app.test.js` | Routing, CORS, public URL creation, health endpoints | Infrastructure |
| `health.test.js` | Readiness, liveness probes | Health checks |

### Running Tests

```bash
# Full suite
cd backend && npm test

# Specific test file
cd backend && npx jest tests/profile.test.js

# With coverage
cd backend && npx jest --coverage
```

### Frontend

```bash
cd frontend

# Build check
npm run build

# Lint
npm run lint

# Dev server
npm run dev
```

---

## Frontend Architecture

### Routing

| Route | Component | Access |
|---|---|---|
| `/` | HomePage | Public |
| `/login` | LoginPage | Public (unauthenticated) |
| `/register` | RegisterPage | Public (unauthenticated) |
| `/verify-email` | VerifyEmailPage | Public |
| `/forgot-password` | ForgotPasswordPage | Public |
| `/reset-password` | ResetPasswordPage | Public |
| `/app` | OverviewPage | Protected |
| `/app/links` | LinksPage | Protected |
| `/app/links/new` | CreateLinkPage | Protected |
| `/app/links/:id/edit` | CreateLinkPage (edit mode) | Protected |
| `/app/links/:id` | LinkDetailsPage | Protected |
| `/app/profile` | ProfilePage | Protected |

### Layouts

- **RootLayout** -- Public homepage with header and footer
- **AuthLayout** -- Split-screen auth pages (brand message left, form right)
- **AppShell** -- Authenticated workspace with sticky header, navigation tabs, user avatar, and nested route outlet

### State Management

- **AuthContext** -- React Context with `user`, `accessToken`, `isAuthenticated`, `isInitializing`
- Session persisted in `localStorage` (token pair)
- Page refresh handled by `GET /auth/me` bootstrap on mount
- No Redux/Zustand -- context + hooks are sufficient for this scale

### Axios Configuration

- Base URL from `VITE_API_BASE_URL`
- Request interceptor attaches `Authorization: Bearer <token>`
- Response interceptor: 401 from protected endpoints -> clear session -> redirect to `/login`
- Auth endpoints (login, register, verify-email, forgot-password, reset-password) are excluded from 401 redirect

---

## Design System

### Color Palette

| Token | Hex | Usage |
|---|---|---|
| `bg-dark` | `#0E1117` | Page background |
| `surface` | `#151922` | Card backgrounds |
| `surface-raised` | `#1B202B` | Input backgrounds, hover states |
| `border-dark` | `#2A313D` | Borders, dividers |
| `text-primary` | `#F5F7FA` | Headings, primary text |
| `text-secondary` | `#A8B0BD` | Body text, labels |
| `text-muted` | `#707A8A` | Hints, metadata |
| `accent-primary` | `#F2B95F` | Gold accent (buttons, links) |
| `success` | `#50CFA6` | Active badges, success states |
| `error` | `#F06B7A` | Error messages, destructive actions |

### Typography

- **Sans:** Manrope (headings, body)
- **Mono:** JetBrains Mono (code, short codes, metadata, inputs)

### Design Principles

- Dark theme throughout
- Minimal, developer-tool aesthetic
- Uppercase tracking for section headers and labels
- Rounded corners (`6px` buttons, `8px` inputs, `10-14px` cards)
- Subtle borders, no heavy shadows
- Consistent spacing via Tailwind utility classes

---

## Deployment

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use strong, unique `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`
- [ ] Configure `CORS_ALLOWED_ORIGINS` for your domain
- [ ] Set up MongoDB with authentication and TLS
- [ ] Set up Redis with authentication
- [ ] Configure Brevo API key for email delivery
- [ ] Set `VITE_API_BASE_URL` and `VITE_PUBLIC_REDIRECT_BASE_URL` to production URLs
- [ ] Build frontend: `cd frontend && npm run build`
- [ ] Start backend: `cd backend && npm start`
- [ ] Start analytics worker: `cd backend && npm run worker:analytics`

### Graceful Shutdown

The server handles `SIGINT` and `SIGTERM`:
1. Stop accepting new HTTP connections
2. Finish in-flight requests (10s timeout)
3. Disconnect from MongoDB
4. Exit cleanly

### Docker (Planned)

```dockerfile
# Backend
FROM node:22-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --production
COPY backend/src ./src
CMD ["node", "src/server.js"]

# Analytics Worker
FROM node:22-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --production
COPY backend/src ./src
CMD ["node", "src/workers/analytics.worker.js"]

# Frontend
FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
```

---

## Known Limitations

- **No 301/302 redirect choice** -- all redirects use 302
- **No bulk link operations** -- one link at a time
- **No link tagging/categorization** -- flat list only
- **No API keys for programmatic access** -- browser-only authentication
- **No team/workspace sharing** -- single-user links
- **No custom domains** -- single redirect domain
- **Analytics retention** -- 90-day hard limit via TTL index
- **No CSV export** -- analytics view-only

---

## License

MIT

---

Built with precision. Designed for developers.
import { z } from 'zod';

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;

const RESERVED_ALIASES = new Set([
  'api',
  'v1',
  'health',
  'live',
  'ready',
  'auth',
  'urls',
  'analytics',
  'login',
  'register',
  'logout',
  'me',
  'summary',
  'timeseries',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
  'static',
  'assets',
  'public',
  'index.html',
  'admin',
  'dashboard',
]);

export const createLinkSchema = z.object({
  originalUrl: z.string().min(1, 'A valid original URL is required.').url('A valid original URL is required.').refine(
    (url) => {
      try {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol);
      } catch {
        return false;
      }
    },
    { message: 'Original URL must use HTTP or HTTPS.' }
  ),
  customAlias: z.string().optional().refine(
    (val) => {
      if (!val || !val.trim()) return true;
      const alias = val.trim();
      if (alias.length < 3 || alias.length > 30) return false;
      if (!/^[a-zA-Z0-9_-]+$/.test(alias)) return false;
      if (RESERVED_ALIASES.has(alias.toLowerCase())) return false;
      return true;
    },
    { message: 'Custom alias must be 3-30 characters, alphanumeric, hyphen, or underscore. Some aliases are reserved.' }
  ),
  title: z.string().max(MAX_TITLE_LENGTH, `Title must be at most ${MAX_TITLE_LENGTH} characters.`).optional().nullable(),
  description: z.string().max(MAX_DESCRIPTION_LENGTH, `Description must be at most ${MAX_DESCRIPTION_LENGTH} characters.`).optional().nullable(),
  expiresAt: z.string().optional().nullable().refine(
    (val) => {
      if (!val || !val.trim()) return true;
      // Validate datetime format (ISO 8601 with optional timezone offset)
      const datetimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d{3})?(?:Z|[+-]\d{2}:?\d{2})?$/;
      if (!datetimeRegex.test(val)) return false;
      const date = new Date(val);
      return !isNaN(date.getTime()) && date > new Date();
    },
    { message: 'Expiration date must be a valid future date.' }
  ),
  isActive: z.boolean().optional(),
});

export const updateLinkSchema = z.object({
  originalUrl: z.string().min(1, 'A valid original URL is required.').url('A valid original URL is required.').refine(
    (url) => {
      try {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol);
      } catch {
        return false;
      }
    },
    { message: 'Original URL must use HTTP or HTTPS.' }
  ).optional(),
  title: z.string().max(MAX_TITLE_LENGTH, `Title must be at most ${MAX_TITLE_LENGTH} characters.`).optional().nullable(),
  description: z.string().max(MAX_DESCRIPTION_LENGTH, `Description must be at most ${MAX_DESCRIPTION_LENGTH} characters.`).optional().nullable(),
  expiresAt: z.string().optional().nullable().refine(
    (val) => {
      if (!val || !val.trim()) return true;
      // Validate datetime format (ISO 8601 with optional timezone offset)
      const datetimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d{3})?(?:Z|[+-]\d{2}:?\d{2})?$/;
      if (!datetimeRegex.test(val)) return false;
      const date = new Date(val);
      return !isNaN(date.getTime()) && date > new Date();
    },
    { message: 'Expiration date must be a valid future date.' }
  ),
  isActive: z.boolean().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one supported field is required for update.' }
);
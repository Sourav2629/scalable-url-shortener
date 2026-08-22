/**
 * Build the full short URL from a shortCode using the backend redirect origin.
 * Uses VITE_PUBLIC_REDIRECT_BASE_URL which points to the redirect endpoint (e.g., http://localhost:5000)
 * The backend redirect endpoint is at /<shortCode>
 */
export function buildShortUrl(shortCode) {
  const baseUrl = import.meta.env.VITE_PUBLIC_REDIRECT_BASE_URL || 'http://localhost:5000';
  // Remove trailing slash if present
  const cleanBaseUrl = baseUrl.replace(/\/$/, '');
  return `${cleanBaseUrl}/${shortCode}`;
}

/**
 * Extract the shortCode from a full short URL
 */
export function extractShortCode(shortUrl) {
  try {
    const url = new URL(shortUrl);
    // The shortCode is the pathname without leading slash
    return url.pathname.replace(/^\//, '');
  } catch {
    // If it's not a valid URL, assume it's just the shortCode
    return shortUrl;
  }
}
const config = require('../../config');
const { logger } = require('../../shared/logger');

const BREVO_SEND_ENDPOINT = '/smtp/email';

/**
 * Brevo email provider adapter.
 *
 * Isolates ALL Brevo-specific logic:
 * - API endpoint
 * - API key authentication
 * - Request body format (Brevo's sendSmtpEmail schema)
 * - Response parsing
 *
 * This is the ONLY file that should ever reference Brevo by name.
 */
class BrevoEmailProvider {
  constructor(options = {}) {
    this.apiKey = options.apiKey || config.email.getBrevoApiKey();
    this.apiUrl = (options.apiUrl || config.email.getBrevoApiUrl()).replace(/\/+$/, '');
    this.fromEmail = options.fromEmail || config.email.getFromEmail();
    this.fromName = options.fromName || config.email.getFromName();
  }

  /**
   * Send an email via Brevo's transactional email API.
   *
   * @param {Object} params
   * @param {string} params.to - Recipient email address
   * @param {string} params.subject - Email subject
   * @param {string} params.html - Email body (HTML)
   * @returns {Promise<Object>} Brevo API response body
   */
  async send({ to, subject, html }) {
    const url = `${this.apiUrl}${BREVO_SEND_ENDPOINT}`;

    const body = {
      sender: {
        email: this.fromEmail,
        name: this.fromName,
      },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': this.apiKey,
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    const responseBody = await response.json();

    if (!response.ok) {
      const brevoMessage = responseBody?.message || 'Unknown Brevo error';
      throw new Error(`Brevo API error (${response.status}): ${brevoMessage}`);
    }

    if (logger && logger.info) {
      logger.info({ to, subject }, 'Email sent via Brevo');
    }

    return responseBody;
  }
}

module.exports = BrevoEmailProvider;

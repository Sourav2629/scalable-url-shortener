const { logger } = require('../logger');

/**
 * Application-facing EmailService abstraction.
 *
 * AuthService and business logic import THIS class, never the provider directly.
 * The provider is injected via constructor, keeping the service provider-agnostic.
 *
 * To switch from Brevo to Resend, SES, or SMTP:
 * - Create a new provider class with a `send({ to, subject, html })` method
 * - Update the wiring in infrastructure/email/index.js
 * - AuthService and controllers remain UNCHANGED
 */
class EmailService {
  /**
   * @param {Object} provider - Email provider with a send({ to, subject, html }) method
   */
  constructor(provider) {
    this.provider = provider;
  }

  /**
   * Send a verification email with a one-time code.
   *
   * @param {string} to - Recipient email address
   * @param {Object} options
   * @param {string} options.name - Recipient's display name
   * @param {string} options.verificationCode - The verification code to include
   */
  async sendVerificationEmail(to, { name, verificationCode }) {
    const subject = 'Verify your email — LinkSphere';
    const html = this._buildVerificationEmailHtml(name, verificationCode);

    try {
      await this.provider.send({ to, subject, html });
    } catch (error) {
      if (logger && logger.error) {
        logger.error({ err: error, to }, 'Failed to send verification email');
      }
      // Do not re-throw — email failure should not block the registration flow.
      // The user can resend later.
    }
  }

  /**
   * Send a password reset email with a one-time code.
   *
   * @param {string} to - Recipient email address
   * @param {Object} options
   * @param {string} options.name - Recipient's display name
   * @param {string} options.resetCode - The password reset code to include
   */
  async sendPasswordResetEmail(to, { name, resetCode }) {
    const subject = 'Reset your password — LinkSphere';
    const html = this._buildPasswordResetEmailHtml(name, resetCode);

    try {
      await this.provider.send({ to, subject, html });
    } catch (error) {
      if (logger && logger.error) {
        logger.error({ err: error, to }, 'Failed to send password reset email');
      }
      // Do not re-throw — email failure should not block the request.
      // The user can request again.
    }
  }

  _buildVerificationEmailHtml(name, verificationCode) {
    return `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0E1117; color: #E5E7EB; padding: 40px 20px;">
        <div style="max-width: 480px; margin: 0 auto;">
          <h1 style="color: #F2B95F; font-size: 24px; margin-bottom: 24px;">Verify your email</h1>
          <p style="font-size: 16px; line-height: 1.6; margin-bottom: 24px;">Hi ${this._escapeHtml(name)},</p>
          <p style="font-size: 16px; line-height: 1.6; margin-bottom: 24px;">Use the following code to verify your email address:</p>
          <div style="background: #1B202B; border: 1px solid #2A313D; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
            <span style="font-family: 'JetBrains Mono', monospace; font-size: 32px; font-weight: 600; color: #F2B95F; letter-spacing: 6px;">${this._escapeHtml(verificationCode)}</span>
          </div>
          <p style="font-size: 14px; color: #9CA3AF; line-height: 1.6;">This code expires in 15 minutes. If you did not request this, you can safely ignore this email.</p>
        </div>
      </body>
      </html>
    `;
  }

  _buildPasswordResetEmailHtml(name, resetCode) {
    return `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0E1117; color: #E5E7EB; padding: 40px 20px;">
        <div style="max-width: 480px; margin: 0 auto;">
          <h1 style="color: #F2B95F; font-size: 24px; margin-bottom: 24px;">Reset your password</h1>
          <p style="font-size: 16px; line-height: 1.6; margin-bottom: 24px;">Hi ${this._escapeHtml(name)},</p>
          <p style="font-size: 16px; line-height: 1.6; margin-bottom: 24px;">Use the following code to reset your password:</p>
          <div style="background: #1B202B; border: 1px solid #2A313D; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
            <span style="font-family: 'JetBrains Mono', monospace; font-size: 32px; font-weight: 600; color: #F2B95F; letter-spacing: 6px;">${this._escapeHtml(resetCode)}</span>
          </div>
          <p style="font-size: 14px; color: #9CA3AF; line-height: 1.6;">This code expires in 15 minutes. If you did not request a password reset, you can safely ignore this email.</p>
        </div>
      </body>
      </html>
    `;
  }

  _escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

module.exports = EmailService;

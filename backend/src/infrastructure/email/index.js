const EmailService = require('../../shared/services/email.service');
const BrevoEmailProvider = require('./brevo-email.provider');

/**
 * Email infrastructure wiring.
 *
 * This is the ONLY file that imports the Brevo provider.
 * All other modules import EmailService from shared/services/email.service.js
 * or from this index via: require('infrastructure/email').
 *
 * To switch providers:
 * 1. Create a new provider class (e.g., ResendEmailProvider)
 * 2. Update this file to instantiate the new provider
 * 3. No changes needed in AuthService, controllers, or business logic
 */

let emailService;

if (process.env.NODE_ENV === 'test') {
  // In tests, provide a mock provider that does nothing
  const mockProvider = {
    send: async () => ({ messageId: 'mock-message-id' }),
  };
  emailService = new EmailService(mockProvider);
} else {
  const provider = new BrevoEmailProvider();
  emailService = new EmailService(provider);
}

module.exports = { emailService };

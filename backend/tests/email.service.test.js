const EmailService = require('../src/shared/services/email.service');
const BrevoEmailProvider = require('../src/infrastructure/email/brevo-email.provider');

describe('EmailService', () => {
  let mockProvider;
  let emailService;

  beforeEach(() => {
    mockProvider = {
      send: jest.fn().mockResolvedValue({ messageId: 'mock-id' }),
    };
    emailService = new EmailService(mockProvider);
  });

  describe('sendVerificationEmail', () => {
    test('calls provider.send with correct arguments', async () => {
      await emailService.sendVerificationEmail('user@test.com', {
        name: 'John',
        verificationCode: '123456',
      });

      expect(mockProvider.send).toHaveBeenCalledTimes(1);
      expect(mockProvider.send).toHaveBeenCalledWith({
        to: 'user@test.com',
        subject: 'Verify your email — LinkSphere',
        html: expect.stringContaining('123456'),
      });
    });

    test('includes the verification code in the HTML body', async () => {
      await emailService.sendVerificationEmail('user@test.com', {
        name: 'John',
        verificationCode: 'ABC789',
      });

      const html = mockProvider.send.mock.calls[0][0].html;
      expect(html).toContain('ABC789');
    });

    test('includes the recipient name in the HTML body', async () => {
      await emailService.sendVerificationEmail('user@test.com', {
        name: 'Jane Doe',
        verificationCode: '123456',
      });

      const html = mockProvider.send.mock.calls[0][0].html;
      expect(html).toContain('Jane Doe');
    });

    test('does NOT throw when provider.send fails', async () => {
      mockProvider.send.mockRejectedValue(new Error('Brevo API down'));

      await expect(
        emailService.sendVerificationEmail('user@test.com', {
          name: 'John',
          verificationCode: '123456',
        }),
      ).resolves.toBeUndefined();
    });

    test('does NOT re-throw provider errors (fire-and-forget)', async () => {
      mockProvider.send.mockRejectedValue(new Error('Network error'));

      // Should not throw
      await emailService.sendVerificationEmail('user@test.com', {
        name: 'John',
        verificationCode: '123456',
      });

      expect(mockProvider.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('sendPasswordResetEmail', () => {
    test('calls provider.send with correct arguments', async () => {
      await emailService.sendPasswordResetEmail('user@test.com', {
        name: 'John',
        resetCode: '654321',
      });

      expect(mockProvider.send).toHaveBeenCalledTimes(1);
      expect(mockProvider.send).toHaveBeenCalledWith({
        to: 'user@test.com',
        subject: 'Reset your password — LinkSphere',
        html: expect.stringContaining('654321'),
      });
    });

    test('includes the reset code in the HTML body', async () => {
      await emailService.sendPasswordResetEmail('user@test.com', {
        name: 'John',
        resetCode: 'XYZ999',
      });

      const html = mockProvider.send.mock.calls[0][0].html;
      expect(html).toContain('XYZ999');
    });

    test('does NOT throw when provider.send fails', async () => {
      mockProvider.send.mockRejectedValue(new Error('Brevo API down'));

      await expect(
        emailService.sendPasswordResetEmail('user@test.com', {
          name: 'John',
          resetCode: '123456',
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('HTML escaping', () => {
    test('escapes HTML entities in name to prevent XSS', async () => {
      await emailService.sendVerificationEmail('user@test.com', {
        name: '<script>alert("xss")</script>',
        verificationCode: '123456',
      });

      const html = mockProvider.send.mock.calls[0][0].html;
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    test('escapes HTML entities in verification code', async () => {
      await emailService.sendVerificationEmail('user@test.com', {
        name: 'John',
        verificationCode: '123456<img src=x>',
      });

      const html = mockProvider.send.mock.calls[0][0].html;
      expect(html).not.toContain('<img');
      expect(html).toContain('&lt;img');
    });

    test('handles null/undefined name safely', async () => {
      await emailService.sendVerificationEmail('user@test.com', {
        name: null,
        verificationCode: '123456',
      });

      const html = mockProvider.send.mock.calls[0][0].html;
      expect(html).toContain('123456');
    });
  });
});

describe('BrevoEmailProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('send', () => {
    test('makes correct HTTP request to Brevo API', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ messageId: 'brevo-msg-123' }),
      });
      global.fetch = mockFetch;

      const provider = new BrevoEmailProvider({
        apiKey: 'test-api-key',
        apiUrl: 'https://api.brevo.com/v3',
        fromEmail: 'noreply@test.com',
        fromName: 'TestApp',
      });

      const result = await provider.send({
        to: 'recipient@test.com',
        subject: 'Test Subject',
        html: '<p>Hello</p>',
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.brevo.com/v3/smtp/email');
      expect(options.method).toBe('POST');
      expect(options.headers['api-key']).toBe('test-api-key');
      expect(options.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(options.body);
      expect(body.sender.email).toBe('noreply@test.com');
      expect(body.sender.name).toBe('TestApp');
      expect(body.to).toEqual([{ email: 'recipient@test.com' }]);
      expect(body.subject).toBe('Test Subject');
      expect(body.htmlContent).toBe('<p>Hello</p>');

      expect(result).toEqual({ messageId: 'brevo-msg-123' });
    });

    test('throws on non-OK Brevo API response', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Unauthorized' }),
      });
      global.fetch = mockFetch;

      const provider = new BrevoEmailProvider({
        apiKey: 'bad-key',
        apiUrl: 'https://api.brevo.com/v3',
        fromEmail: 'noreply@test.com',
        fromName: 'TestApp',
      });

      await expect(
        provider.send({ to: 'user@test.com', subject: 'Test', html: '<p>Hi</p>' }),
      ).rejects.toThrow('Brevo API error (401): Unauthorized');
    });

    test('handles Brevo response with no message field', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      });
      global.fetch = mockFetch;

      const provider = new BrevoEmailProvider({
        apiKey: 'test-key',
        apiUrl: 'https://api.brevo.com/v3',
        fromEmail: 'noreply@test.com',
        fromName: 'TestApp',
      });

      await expect(
        provider.send({ to: 'user@test.com', subject: 'Test', html: '<p>Hi</p>' }),
      ).rejects.toThrow('Brevo API error (500): Unknown Brevo error');
    });

    test('strips trailing slashes from apiUrl', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ messageId: 'ok' }),
      });
      global.fetch = mockFetch;

      const provider = new BrevoEmailProvider({
        apiKey: 'test-key',
        apiUrl: 'https://api.brevo.com/v3///',
        fromEmail: 'noreply@test.com',
        fromName: 'TestApp',
      });

      await provider.send({ to: 'user@test.com', subject: 'Test', html: '<p>Hi</p>' });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    });
  });
});

describe('Email Provider Isolation', () => {
  test('EmailService does not import or reference Brevo directly', () => {
    // Read the EmailService source and verify no Brevo import/require/code references
    const fs = require('fs');
    const path = require('path');
    const servicePath = path.join(__dirname, '..', 'src', 'shared', 'services', 'email.service.js');
    const source = fs.readFileSync(servicePath, 'utf8');

    // Should not contain require/import of brevo
    expect(source).not.toMatch(/require\(['"].*brevo/);
    expect(source).not.toMatch(/import.*from.*['"].*brevo/);
    // Should not reference Brevo in variable names or code (but JSDoc examples are fine)
    const lines = source.split('\n').filter((line) => !line.trim().startsWith('*'));
    const codeLines = lines.join('\n');
    expect(codeLines).not.toMatch(/\bBrevo\b/);
    expect(codeLines).not.toMatch(/\bbrevo\b/);
  });

  test('infrastructure/email/index.js is the ONLY file that imports BrevoEmailProvider', () => {
    const fs = require('fs');
    const path = require('path');
    const srcDir = path.join(__dirname, '..', 'src');

    function findFiles(dir) {
      const results = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...findFiles(fullPath));
        } else if (entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) {
          results.push(fullPath);
        }
      }
      return results;
    }

    const allFiles = findFiles(srcDir);
    const filesImportingBrevo = allFiles.filter((file) => {
      const content = fs.readFileSync(file, 'utf8');
      return content.includes('brevo-email.provider');
    });

    expect(filesImportingBrevo).toHaveLength(1);
    expect(filesImportingBrevo[0]).toContain(path.join('infrastructure', 'email', 'index.js'));
  });
});

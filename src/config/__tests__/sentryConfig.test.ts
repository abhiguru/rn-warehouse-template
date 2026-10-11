import * as Sentry from '@sentry/react-native';
import {
  redactSensitiveString,
  sanitizeUrl,
  sanitizeHeaders,
  sanitizeData,
  beforeSend,
  beforeBreadcrumb,
  redactErrorText,
  setSentryUser,
  clearSentryUser,
  captureException,
  captureMessage,
  addBreadcrumb,
} from '../sentryConfig';

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  setUser: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

// Deliberately unsigned fixture for redaction tests; never a usable session.
const encodeFixture = (value: object) =>
  btoa(JSON.stringify(value)).replace(/=+$/, '');
const syntheticJwt = [
  encodeFixture({ alg: 'HS256', typ: 'JWT' }),
  encodeFixture({ sub: 'synthetic-redaction-fixture' }),
  'invalid-signature',
].join('.');

describe('sentryConfig - Telemetry and Redaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('redactSensitiveString', () => {
    it('redacts JWT tokens', () => {
      const sampleJwt = syntheticJwt;
      const input = `User failed to authenticate with token ${sampleJwt}`;
      const redacted = redactSensitiveString(input);
      expect(redacted).not.toContain(sampleJwt);
      expect(redacted).toContain('[REDACTED_JWT]');
    });

    it('redacts Bearer tokens', () => {
      const input = 'Authorization header: Bearer abc123def456ghi789xyz';
      const redacted = redactSensitiveString(input);
      expect(redacted).not.toContain('abc123def456ghi789xyz');
      expect(redacted).toContain('Bearer [REDACTED_TOKEN]');
    });

    it('redacts phone numbers (Indian and international)', () => {
      expect(redactSensitiveString('Contact: +91 9876543210')).toContain(
        '[REDACTED_PHONE]'
      );
      expect(redactSensitiveString('Phone: 9876543210')).toContain(
        '[REDACTED_PHONE]'
      );
      expect(redactSensitiveString('Office: 555-123-4567')).toContain(
        '[REDACTED_PHONE]'
      );
    });

    it('redacts OTP patterns in strings', () => {
      const input = 'Verification otp: 123456';
      expect(redactSensitiveString(input)).toContain('[REDACTED_OTP]');
      expect(redactSensitiveString(input)).not.toContain('123456');
    });

    it('redacts email addresses', () => {
      const input = 'User email is sensitive.user@example.com in system';
      expect(redactSensitiveString(input)).toContain('[REDACTED_EMAIL]');
      expect(redactSensitiveString(input)).not.toContain(
        'sensitive.user@example.com'
      );
    });

    it('redacts common API keys', () => {
      const input = 'Connecting with sbp_abcdef1234567890abcdef12';
      expect(redactSensitiveString(input)).toContain('[REDACTED_API_KEY]');
    });
  });

  describe('sanitizeUrl', () => {
    it('redacts sensitive query parameters from full URLs', () => {
      const url =
        'https://example.com/api/v1/resource?token=secret-token-123&apikey=sbp_secret&safe_param=hello';
      const sanitized = sanitizeUrl(url);
      expect(sanitized).toContain('token=%5BREDACTED%5D');
      expect(sanitized).toContain('apikey=%5BREDACTED%5D');
      expect(sanitized).toContain('safe_param=hello');
      expect(sanitized).not.toContain('secret-token-123');
    });

    it('redacts sensitive query parameters from relative URLs', () => {
      const url = '/auth/v1/verify?code=987654&type=sms';
      const sanitized = sanitizeUrl(url);
      expect(sanitized).toContain('code=%5BREDACTED%5D');
      expect(sanitized).toContain('type=sms');
    });

    it('redacts JWT query parameter values even if parameter name is unusual', () => {
      const jwt = syntheticJwt;
      const url = `https://example.com/callback?custom_auth=${jwt}`;
      const sanitized = sanitizeUrl(url);
      expect(sanitized).toContain('custom_auth=%5BREDACTED_JWT%5D');
    });
  });

  describe('sanitizeHeaders', () => {
    it('redacts sensitive header values completely', () => {
      const headers = {
        Authorization: 'Bearer secret-jwt-value',
        apikey: 'sbp_anonymous_key_secret',
        'x-supabase-auth': 'custom-token',
        Cookie: 'session=abc',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };

      const sanitized = sanitizeHeaders(headers);
      expect(sanitized['Authorization']).toBe('[REDACTED]');
      expect(sanitized['apikey']).toBe('[REDACTED]');
      expect(sanitized['x-supabase-auth']).toBe('[REDACTED]');
      expect(sanitized['Cookie']).toBe('[REDACTED]');
      expect(sanitized['Content-Type']).toBe('application/json');
    });
  });

  describe('sanitizeData', () => {
    it('redacts sensitive keys in objects', () => {
      const data = {
        userId: '123-uuid',
        otp: '654321',
        refreshToken: 'refresh-secret',
        password: 'my-password',
        metadata: {
          phoneNumber: '9876543210',
          nestedSecret: 'secret',
          safeField: 'normal value',
        },
      };

      const sanitized = sanitizeData(data) as typeof data;
      expect(sanitized.userId).toBe('123-uuid');
      expect(sanitized.otp).toBe('[REDACTED]');
      expect(sanitized.refreshToken).toBe('[REDACTED]');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.metadata.phoneNumber).toBe('[REDACTED]');
      expect(sanitized.metadata.safeField).toBe('normal value');
    });

    it('safely handles circular references', () => {
      const circularObj: Record<string, unknown> = {
        name: 'test',
      };
      circularObj.self = circularObj;

      expect(() => sanitizeData(circularObj)).not.toThrow();
      const sanitized = sanitizeData(circularObj) as Record<string, unknown>;
      expect(sanitized.self).toBe('[CIRCULAR]');
    });
  });

  describe('sanitizeBreadcrumb & beforeBreadcrumb', () => {
    it('sanitizes messages and HTTP request breadcrumb URLs and headers', () => {
      const breadcrumb: Sentry.Breadcrumb = {
        category: 'http',
        message: 'Sent OTP to +91 9876543210',
        data: {
          url: 'https://example.com/api?token=abc',
          headers: {
            Authorization: 'Bearer abc',
          },
          status_code: 200,
        },
      };

      const sanitized = beforeBreadcrumb(breadcrumb);
      expect(sanitized).not.toBeNull();
      expect(sanitized?.message).toContain('[REDACTED_PHONE]');
      expect(sanitized?.data?.url).toContain('token=%5BREDACTED%5D');
      expect(sanitized?.data?.headers?.['Authorization']).toBe('[REDACTED]');
      expect(sanitized?.data?.status_code).toBe(200);
    });
  });

  describe('sanitizeEvent & beforeSend', () => {
    it('redacts user PII and sensitive request headers/query/extra', () => {
      const event: Sentry.ErrorEvent = {
        user: {
          id: 'user-uuid-123',
          phone: '+919876543210',
          email: 'user@warehouse.com',
          ip_address: '192.168.1.1',
        },
        request: {
          url: 'https://api.example.com/dispatch?token=secret123',
          headers: {
            Authorization: 'Bearer token',
            apikey: 'sbp_key',
          },
          query_string: 'token=secret123&action=dispatch',
          data: {
            otp: '123456',
            orderId: 'ORD-999',
          },
        },
        extra: {
          phoneNumber: '9876543210',
          jwt: syntheticJwt,
          status: 'error',
        },
        tags: {
          component: 'auth',
          token: 'sensitive-token',
        },
      };

      const sanitized = beforeSend(event);
      expect(sanitized).not.toBeNull();

      // User
      expect(sanitized?.user?.id).toBe('user-uuid-123');
      expect(sanitized?.user?.phone).toBe('[REDACTED]');
      expect(sanitized?.user?.email).toBe('[REDACTED]');
      expect(sanitized?.user?.ip_address).toBe('[REDACTED]');

      // Request
      expect(sanitized?.request?.headers?.['Authorization']).toBe('[REDACTED]');
      expect(sanitized?.request?.headers?.['apikey']).toBe('[REDACTED]');
      expect(sanitized?.request?.query_string).toContain(
        'token=%5BREDACTED%5D'
      );
      expect(
        (sanitized?.request?.data as Record<string, unknown>)?.['otp']
      ).toBe('[REDACTED]');

      // Extra
      expect(
        (sanitized?.extra as Record<string, unknown>)?.['phoneNumber']
      ).toBe('[REDACTED]');
      expect((sanitized?.extra as Record<string, unknown>)?.['jwt']).toBe(
        '[REDACTED]'
      );
      expect((sanitized?.extra as Record<string, unknown>)?.['status']).toBe(
        'error'
      );

      // Tags
      expect(sanitized?.tags?.['token']).toBe('[REDACTED]');
      expect(sanitized?.tags?.['component']).toBe('auth');
    });
  });

  // Review 2026-10-10, X4-1 / M1-5: the text of the event itself.
  describe('event message, exception text and contexts', () => {
    const refresh = 'ab12'.repeat(16);

    it('redacts a phone number, a token and row values in an exception message', () => {
      const event = {
        exception: {
          values: [
            { type: 'Error', value: 'duplicate key value violates unique constraint "customers_mobile_key" Key (mobile)=(9876543210) already exists.' },
            { type: 'Error', value: `Refresh failed for ${refresh} with Authorization: Bearer ${syntheticJwt}` },
            { type: 'Error', value: 'null value in column "name" violates not-null constraint. Failing row contains (7, Asha Example, Rajkot, null).' },
          ],
        },
      } as unknown as Sentry.ErrorEvent;
      const values = beforeSend(event)!.exception!.values!.map(exception => exception.value);
      expect(values[0]).toBe('duplicate key value violates unique constraint "customers_mobile_key" Key (mobile)=([REDACTED]) already exists.');
      expect(values[1]).not.toContain(refresh);
      expect(values[1]).not.toContain(syntheticJwt);
      expect(values[2]).toBe('null value in column "name" violates not-null constraint. Failing row contains ([REDACTED]).');
      expect(JSON.stringify(values)).not.toMatch(/9876543210|Asha Example|Rajkot/);
    });

    it('an Error whose message contains a phone number arrives as [REDACTED_PHONE]', () => {
      const event = { exception: { values: [{ type: 'Error', value: 'OTP could not be sent to 9876543210' }] } } as unknown as Sentry.ErrorEvent;
      expect(beforeSend(event)!.exception!.values![0].value).toBe('OTP could not be sent to [REDACTED_PHONE]');
    });

    it('redacts a captured message and its log entry', () => {
      const event = {
        message: 'Unhandled rejection: customer 919876543210 not reachable',
        logentry: { message: 'Sign-in for %s failed', params: ['+91 9876543210', { token: 'secret' }] },
      } as unknown as Sentry.ErrorEvent;
      const sanitized = beforeSend(event)!;
      expect(sanitized.message).toBe('Unhandled rejection: customer [REDACTED_PHONE] not reachable');
      expect(sanitized.logentry!.params).toEqual(['[REDACTED_PHONE]', { token: '[REDACTED]' }]);
    });

    it('redacts contexts, keeps device details and leaves the trace ids alone', () => {
      const trace = { trace_id: 'abcdef0123456789abcdef9876543210', span_id: 'b0e6f15b45c36b12' };
      const event = {
        contexts: {
          device: { model: 'Fictional Phone 1', memory_size: 8012345678 },
          state: { profile: { name: 'Asha Example', phone: '9876543210' }, note: 'call 9876543210' },
          response: { headers: { 'x-request': 'r1' }, body: `{"refresh_token":"${refresh}"}`, access_token: syntheticJwt },
          trace,
        },
      } as unknown as Sentry.ErrorEvent;
      const contexts = beforeSend(event)!.contexts as Record<string, any>;
      expect(contexts.device).toEqual({ model: 'Fictional Phone 1', memory_size: 8012345678 });
      expect(contexts.state.profile.phone).toBe('[REDACTED]');
      expect(contexts.state.note).toBe('call [REDACTED_PHONE]');
      expect(contexts.response.access_token).toBe('[REDACTED]');
      expect(contexts.trace).toEqual(trace);
    });

    it('captureMessage scrubs the raw text of an unhandled rejection before it reaches the SDK', () => {
      captureMessage(`Unhandled rejection: Key (mobile)=(9876543210) already exists, token ${refresh}`, 'error');
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        'Unhandled rejection: Key (mobile)=([REDACTED]) already exists, token [REDACTED_TOKEN]',
        'error'
      );
    });

    it('leaves ordinary error text as it is', () => {
      const text = "Cannot read properties of undefined (reading 'items') at GRN A0010, 12 rows";
      expect(redactErrorText(text)).toBe(text);
    });
  });

  describe('helper functions', () => {
    it('sets and clears user context correctly', () => {
      setSentryUser('user-1', 'operator');
      expect(Sentry.setUser).toHaveBeenCalledWith({
        id: 'user-1',
        role: 'operator',
      });

      clearSentryUser();
      expect(Sentry.setUser).toHaveBeenCalledWith(null);
    });

    it('captures exceptions and messages', () => {
      const err = new Error('Test error');
      captureException(err, { key: 'val' });
      expect(Sentry.captureException).toHaveBeenCalledWith(err, {
        extra: { key: 'val' },
      });

      captureMessage('Notice message', 'warning');
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        'Notice message',
        'warning'
      );

      addBreadcrumb('Navigated to home', 'navigation');
      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Navigated to home',
          category: 'navigation',
        })
      );
    });
  });
});

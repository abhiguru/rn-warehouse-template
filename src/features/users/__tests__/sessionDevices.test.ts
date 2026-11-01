import { describeUserAgent, mayListSessions, revokeOutcome, stillListed, type UserSession } from '../sessionDevices';

const session = (id: string, over: Partial<UserSession> = {}): UserSession => ({
  id, user_agent: null, created_ip: null, created_at: null, last_refreshed_at: null, expires_at: null, is_current: false, ...over,
});

describe('who may see a person\'s signed-in devices', () => {
  it('an administrator for everyone, a supervisor for everyone but administrators, nobody else', () => {
    expect(mayListSessions('admin', 'admin')).toBe(true);
    expect(mayListSessions('admin', 'customer')).toBe(true);
    expect(mayListSessions('supervisor', 'staff')).toBe(true);
    expect(mayListSessions('supervisor', 'customer')).toBe(true);
    expect(mayListSessions('supervisor', 'admin')).toBe(false);
    expect(mayListSessions('staff', 'customer')).toBe(false);
    expect(mayListSessions('customer', 'customer')).toBe(false);
    expect(mayListSessions(undefined, 'customer')).toBe(false);
  });
});

describe('describeUserAgent', () => {
  it('reads the app\'s own agent: product, version and system', () => {
    expect(describeUserAgent('WarehouseApp/1.2 (Android 15)')).toEqual({ app: 'WarehouseApp 1.2', system: 'Android 15' });
  });

  it('reduces a browser agent to its browser and system', () => {
    const chrome = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
    expect(describeUserAgent(chrome)).toEqual({ app: 'Chrome 120', system: 'Android 14' });
    const safari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1';
    expect(describeUserAgent(safari)).toEqual({ app: 'Safari 17', system: 'iOS 17.2' });
  });

  it('is empty for no agent, and cuts a long unknown one', () => {
    expect(describeUserAgent(null)).toEqual({ app: '', system: '' });
    expect(describeUserAgent('   ')).toEqual({ app: '', system: '' });
    const long = describeUserAgent('x'.repeat(300));
    expect(long.app.length).toBeLessThanOrEqual(41);
  });

  it('turns control characters into spaces', () => {
    expect(describeUserAgent('Tool\n\t1').app).not.toMatch(/[\n\t]/);
  });
});

describe('what a sign out meant', () => {
  const listed = [session('a'), session('b', { is_current: true })];

  it('knows whether the list still holds the session', () => {
    expect(stillListed(listed, 'a')).toBe(true);
    expect(stillListed(listed, 'z')).toBe(false);
  });

  it('is "signed out here" when the server ended this phone\'s own session', () => {
    expect(revokeOutcome(true, [], 'b')).toBe('signedOutHere');
  });

  it('is "revoked" when the session is gone from the list afterwards', () => {
    expect(revokeOutcome(false, [session('b')], 'a')).toBe('revoked');
  });

  it('is "not signed out" when the server said done but the session is still listed', () => {
    expect(revokeOutcome(false, listed, 'a')).toBe('notSignedOut');
  });
});

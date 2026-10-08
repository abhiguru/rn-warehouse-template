jest.mock('@expo/config-plugins', () => ({
  withDangerousMod: jest.fn(),
}));

const {
  bridgeIosLinkingManager,
} = require('./with-ios-linking-manager');

describe('with-ios-linking-manager', () => {
  const generatedHandler = `  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }`;

  it('invokes both iOS URL handlers before combining their results', () => {
    const updated = bridgeIosLinkingManager(generatedHandler);

    expect(updated).toContain(
      'let expoHandled = super.application(app, open: url, options: options)'
    );
    expect(updated).toContain(
      'let reactNativeHandled = RCTLinkingManager.application(app, open: url, options: options)'
    );
    expect(updated).toContain('return expoHandled || reactNativeHandled');
    expect(updated).not.toContain(
      'return super.application(app, open: url, options: options) || RCTLinkingManager.application'
    );
  });

  it('is idempotent', () => {
    const updated = bridgeIosLinkingManager(generatedHandler);

    expect(bridgeIosLinkingManager(updated)).toBe(updated);
  });

  it('fails loudly when the generated AppDelegate shape changes', () => {
    expect(() => bridgeIosLinkingManager('class AppDelegate {}')).toThrow(
      'expected AppDelegate pattern was not found'
    );
  });
});

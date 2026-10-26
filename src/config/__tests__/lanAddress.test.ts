import { isPrivateIPv4, parseLanOrigin } from '../lanAddress';

describe('parseLanOrigin', () => {
  it.each([
    ['http://192.168.1.20:8080', 'http://192.168.1.20:8080'],
    ['http://10.0.0.5:1024', 'http://10.0.0.5:1024'],
    ['http://10.255.255.254:65535', 'http://10.255.255.254:65535'],
    ['http://172.16.0.1:8080', 'http://172.16.0.1:8080'],
    ['http://172.31.255.1:8080', 'http://172.31.255.1:8080'],
    ['http://192.168.0.1:1', 'http://192.168.0.1:1'],
    ['  http://192.168.1.20:8080  ', 'http://192.168.1.20:8080'],
    ['http://192.168.1.20:8080/', 'http://192.168.1.20:8080'],
    ['HTTP://192.168.1.20:8080', 'http://192.168.1.20:8080'],
  ])('accepts %s', (input, expected) => {
    expect(parseLanOrigin(input)).toBe(expected);
  });

  it.each([
    ['https scheme', 'https://192.168.1.20:8080'],
    ['no scheme', '192.168.1.20:8080'],
    ['no port', 'http://192.168.1.20'],
    ['port 0', 'http://192.168.1.20:0'],
    ['port above 65535', 'http://192.168.1.20:65536'],
    ['port with a leading zero', 'http://192.168.1.20:08080'],
    ['a public address', 'http://8.8.8.8:8080'],
    ['just below 172.16', 'http://172.15.0.1:8080'],
    ['just above 172.31', 'http://172.32.0.1:8080'],
    ['carrier-grade NAT', 'http://100.64.0.1:8080'],
    ['link-local', 'http://169.254.1.1:8080'],
    ['loopback', 'http://127.0.0.1:8080'],
    ['an unspecified address', 'http://0.0.0.0:8080'],
    ['192.169', 'http://192.169.1.1:8080'],
    ['an octet above 255', 'http://192.168.1.256:8080'],
    ['a leading zero in an octet', 'http://192.168.01.20:8080'],
    ['a host name', 'http://warehouse.local:8080'],
    ['localhost', 'http://localhost:8080'],
    ['an IPv6 address', 'http://[fd00::1]:8080'],
    ['a path', 'http://192.168.1.20:8080/functions'],
    ['a query', 'http://192.168.1.20:8080?x=1'],
    ['a fragment', 'http://192.168.1.20:8080#x'],
    ['user info', 'http://user:pass@192.168.1.20:8080'],
    ['an at sign trick', 'http://192.168.1.20:8080@8.8.8.8:80'],
    ['two slashes at the end', 'http://192.168.1.20:8080//'],
    ['an empty string', ''],
    ['white space only', '   '],
  ])('refuses %s', (_name, input) => {
    expect(parseLanOrigin(input)).toBeNull();
  });

  it('refuses anything that is not text', () => {
    for (const value of [undefined, null, 8080, {}, ['http://192.168.1.20:8080']]) expect(parseLanOrigin(value)).toBeNull();
  });
});

describe('isPrivateIPv4', () => {
  it('is RFC 1918 and nothing else', () => {
    expect(isPrivateIPv4([10, 1, 2, 3])).toBe(true);
    expect(isPrivateIPv4([172, 16, 0, 0])).toBe(true);
    expect(isPrivateIPv4([172, 31, 255, 255])).toBe(true);
    expect(isPrivateIPv4([192, 168, 5, 5])).toBe(true);
    for (const octets of [[11, 0, 0, 1], [172, 15, 0, 1], [172, 32, 0, 1], [192, 167, 0, 1], [192, 169, 0, 1], [127, 0, 0, 1], [100, 64, 0, 1]])
      expect(isPrivateIPv4(octets)).toBe(false);
  });
});

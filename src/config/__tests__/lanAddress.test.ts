import {
  isHostPartChange,
  isPrivateIPv4,
  lanAddressInSubnet,
  lanHostOctets,
  parseIPv4,
  parseLanOrigin,
  subnetPrefixLength,
} from '../lanAddress';

describe('parseLanOrigin', () => {
  it.each([
    ['http://192.168.1.20:8080', 'http://192.168.1.20:8080'],
    ['http://10.0.0.5:1024', 'http://10.0.0.5:1024'],
    ['http://10.255.255.254:65535', 'http://10.255.255.254:65535'],
    ['http://172.16.0.1:8080', 'http://172.16.0.1:8080'],
    ['http://172.31.255.1:8080', 'http://172.31.255.1:8080'],
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
    ['port 1', 'http://192.168.0.1:1'],
    ['port 80', 'http://192.168.1.20:80'],
    ['port 1023, below the range the server offers', 'http://192.168.1.20:1023'],
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

describe('parseIPv4', () => {
  it('reads four numbers written the usual way', () => {
    expect(parseIPv4('192.168.1.50')).toEqual([192, 168, 1, 50]);
    expect(parseIPv4('0.0.0.0')).toEqual([0, 0, 0, 0]);
    for (const bad of ['192.168.1', '192.168.1.256', '192.168.01.5', '1.2.3.4.5', ' 1.2.3.4', 'a.b.c.d', '', null, 5, undefined])
      expect(parseIPv4(bad)).toBeNull();
  });
});

describe('subnetPrefixLength', () => {
  it.each([
    ['255.255.255.0', 24],
    ['255.255.254.0', 23],
    ['255.255.252.0', 22],
    ['255.255.0.0', 16],
    ['255.0.0.0', 8],
    ['255.255.255.252', 30],
    ['255.255.255.128', 25],
  ])('%s is /%i', (mask, prefix) => {
    expect(subnetPrefixLength(mask)).toBe(prefix);
  });

  it.each([
    ['everything (what Android reports when it cannot read the prefix)', '255.255.255.255'],
    ['nothing (what iOS reports when it cannot read it)', '0.0.0.0'],
    ['a point-to-point /31', '255.255.255.254'],
    ['shorter than /8', '254.0.0.0'],
    ['holes in the ones', '255.0.255.0'],
    ['ones after zeros', '0.255.255.255'],
    ['not a mask', '255.255.255'],
    ['text', 'wide'],
    ['null', null],
  ])('refuses %s', (_name, mask) => {
    expect(subnetPrefixLength(mask)).toBeNull();
  });
});

describe('lanAddressInSubnet', () => {
  const lan = 'http://192.168.1.20:8080';
  it('is true when the phone and the server are in one subnet', () => {
    expect(lanAddressInSubnet(lan, '192.168.1.50', '255.255.255.0')).toBe(true);
    expect(lanAddressInSubnet(lan, '192.168.1.255', '255.255.255.0')).toBe(true);
    expect(lanAddressInSubnet(lan, '192.168.0.9', '255.255.254.0')).toBe(true);
    expect(lanAddressInSubnet('http://10.4.5.6:8080', '10.200.1.1', '255.0.0.0')).toBe(true);
  });

  it('is false when the server is in another subnet, the same range or not', () => {
    expect(lanAddressInSubnet(lan, '192.168.0.50', '255.255.255.0')).toBe(false);
    expect(lanAddressInSubnet(lan, '192.168.2.50', '255.255.255.0')).toBe(false);
    expect(lanAddressInSubnet(lan, '10.0.0.5', '255.255.255.0')).toBe(false);
    expect(lanAddressInSubnet(lan, '192.168.1.50', '255.255.255.252')).toBe(false);
  });

  it('is false whenever something is not known or not usable', () => {
    expect(lanAddressInSubnet(lan, null, '255.255.255.0')).toBe(false);
    expect(lanAddressInSubnet(lan, '192.168.1.50', null)).toBe(false);
    expect(lanAddressInSubnet(lan, '192.168.1.50', '255.255.255.255')).toBe(false);
    expect(lanAddressInSubnet(lan, '192.168.1.50', '0.0.0.0')).toBe(false);
    expect(lanAddressInSubnet('https://192.168.1.20:8080', '192.168.1.50', '255.255.255.0')).toBe(false);
    expect(lanAddressInSubnet('http://8.8.8.8:8080', '8.8.8.9', '255.255.255.0')).toBe(false);
    expect(lanAddressInSubnet(null, '192.168.1.50', '255.255.255.0')).toBe(false);
  });
});

describe('isHostPartChange', () => {
  const offered = 'http://192.168.1.20:8080';
  it('allows another host in the same /24, and another port', () => {
    expect(isHostPartChange(offered, 'http://192.168.1.31:8080')).toBe(true);
    expect(isHostPartChange(offered, 'http://192.168.1.31:9090')).toBe(true);
    expect(isHostPartChange(offered, offered)).toBe(true);
  });

  it('refuses another subnet, a network or broadcast address, and anything that is not an address', () => {
    for (const typed of [
      'http://192.168.2.20:8080',
      'http://192.169.1.20:8080',
      'http://10.0.0.20:8080',
      'http://192.168.1.0:8080',
      'http://192.168.1.255:8080',
      'http://192.168.1.66',
      'http://8.8.8.8:8080',
      'https://192.168.1.31:8080',
      'warehouse.local',
      '',
    ])
      expect(isHostPartChange(offered, typed)).toBe(false);
    expect(isHostPartChange(null, 'http://192.168.1.31:8080')).toBe(false);
  });
});

describe('lanHostOctets', () => {
  it('reads the host of an address parseLanOrigin accepts', () => {
    expect(lanHostOctets('http://192.168.1.20:8080')).toEqual([192, 168, 1, 20]);
    expect(lanHostOctets('http://8.8.8.8:8080')).toBeNull();
    expect(lanHostOctets(5)).toBeNull();
  });
});

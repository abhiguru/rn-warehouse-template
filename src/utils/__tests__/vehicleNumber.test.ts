import { normalizeVehicle } from '../vehicleNumber';

describe('normalizeVehicle', () => {
  it('trims both ends and makes inner runs of spaces one', () => {
    expect(normalizeVehicle(' T31  X18 ')).toBe('T31 X18');
    expect(normalizeVehicle('GJ01AB1234')).toBe('GJ01AB1234');
    expect(normalizeVehicle('T31 X18')).toBe('T31 X18');
  });

  it('turns a field of spaces into empty', () => {
    expect(normalizeVehicle('   ')).toBe('');
    expect(normalizeVehicle('')).toBe('');
  });
});

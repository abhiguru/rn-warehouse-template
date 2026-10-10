/**
 * Which pincode, GST and PAN values the customer form accepts. The fields are
 * optional; a value that is given must have the official shape.
 */
import { detailsSchema } from '../customerValidation';

const accepted = (field: 'pincode' | 'gst' | 'pan', value: string) =>
  detailsSchema.validateAt(field, { [field]: value }).then(() => true, () => false);

describe('pincode', () => {
  it.each(['', '380001', '૩૮૦૦૦૧'])('accepts %p', async (value) => {
    expect(await accepted('pincode', value)).toBe(true);
  });
  it.each(['38000', '3800011', '080001', '38 0001', '38000A'])('refuses %p', async (value) => {
    expect(await accepted('pincode', value)).toBe(false);
  });
});

describe('GST number', () => {
  it.each(['', '22AAAAA0000A1Z5', '24abcde1234f1z5', '24ABCDE1234FZZA'])('accepts %p', async (value) => {
    expect(await accepted('gst', value)).toBe(true);
  });
  it.each([
    '22AAAAA0000A1Z', // 14 characters
    '22AAAAA0000A1Z55', // 16 characters
    'AAAAAAA0000A1Z5', // no state code
    '22AAAAA0000A0Z5', // entity number 0
    '22AAAAA0000A1X5', // the fourteenth character is always Z
    '22AAAA00000A1Z5', // PAN part has four letters
  ])('refuses %p', async (value) => {
    expect(await accepted('gst', value)).toBe(false);
  });
});

describe('PAN', () => {
  it.each(['', 'AAAAA0000A', 'abcde1234f'])('accepts %p', async (value) => {
    expect(await accepted('pan', value)).toBe(true);
  });
  it.each(['AAAAA0000', 'AAAAA0000AA', 'AAAA00000A', '1AAAA0000A', 'AAAAA00001'])('refuses %p', async (value) => {
    expect(await accepted('pan', value)).toBe(false);
  });
});

/**
 * The rack rule is a shape, not one facility's list of floors and chambers:
 * this app is installed at many facilities, each with its own codes.
 */
import { isValidRackFormat, itemSchema } from '../grnValidation';

describe('isValidRackFormat', () => {
  it.each(['', '   ', 'F1/C4', 'BASE/Anti-Ch', '20B/F1/C4', '20B-20C/BASE/C7'])(
    'accepts %p, as before',
    (rack) => expect(isValidRackFormat(rack)).toBe(true)
  );

  it.each(['G/C1', 'F5/C9', '12A/G/C1', 'Row 3/Upper/North', 'ભોંયતળિયું/ચેમ્બર ૧'])(
    "accepts another facility's floor and chamber codes: %p",
    (rack) => expect(isValidRackFormat(rack)).toBe(true)
  );

  it.each(['20B', 'F1', '/C4', 'F1/', '20B//C4', ' / ', '/'])(
    'refuses %p, which is not Floor/Chamber or Rack/Floor/Chamber',
    (rack) => expect(isValidRackFormat(rack)).toBe(false)
  );
});

describe('item schema rack', () => {
  const item = { item_table_id: 'item-1', item_name: 'Example Potatoes', qty: '10', rack: '' };

  it("saves a line whose rack uses another facility's codes", async () => {
    await expect(itemSchema.validateAt('rack', { ...item, rack: '12A/G/C1' })).resolves.toBe('12A/G/C1');
  });

  it('names the format, and no facility codes, when the rack is refused', async () => {
    const error = await itemSchema.validateAt('rack', { ...item, rack: '20B' }).catch((caught) => caught);
    expect(error.message).toBe('Rack must be in format: Floor/Chamber or Rack/Floor/Chamber');
    expect(error.message).not.toMatch(/BASE|C4|Anti-Ch/);
  });
});

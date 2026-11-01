import { buildRackValue, DEFAULT_RACK_PRESETS, parseRackValue } from '../rackPresets';

describe('rack presets', () => {
  it('start with today\'s buttons', () => {
    expect(DEFAULT_RACK_PRESETS).toEqual({ floor: ['BASE', 'F1', 'F2', 'F3', 'F4'], chamber: ['C4', 'C7', 'C2', 'Anti-Ch'] });
  });

  it('read a rack ending in a floor and a chamber of the given lists', () => {
    const own = { floor: ['G'], chamber: ['X1'] };
    expect(parseRackValue('ROW 3/G/X1', own)).toEqual({ userInput: 'ROW 3', floor: 'G', chamber: 'X1' });
    // Not in the facility's lists: shown whole, so the saved rack never changes.
    expect(parseRackValue('ROW 3/F1/C4', own)).toEqual({ userInput: 'ROW 3/F1/C4', floor: '', chamber: '' });
    expect(parseRackValue('ROW 3/F1/C4')).toEqual({ userInput: 'ROW 3', floor: 'F1', chamber: 'C4' });
  });

  it('build the rack as before', () => {
    expect(buildRackValue('ROW 3 ', 'F1', 'C4')).toBe('ROW 3/F1/C4');
    expect(buildRackValue('', 'F1', '')).toBe('F1');
    expect(buildRackValue(' x ', '', '')).toBe(' x ');
  });
});

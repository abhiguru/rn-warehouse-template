import { areAllAvailableLotsAlreadyAdded } from '../lotAvailability';

describe('areAllAvailableLotsAlreadyAdded', () => {
  it('returns true when every in-stock lot is already in the draft', () => {
    expect(
      areAllAvailableLotsAlreadyAdded(
        [
          { id: 'available-1', stock: 80 },
          { id: 'available-2', stock: 20 },
          { id: 'empty', stock: 0 },
        ],
        ['available-1', 'available-2'],
      ),
    ).toBe(true);
  });

  it('returns false when an in-stock lot can still be selected', () => {
    expect(
      areAllAvailableLotsAlreadyAdded(
        [
          { id: 'already-added', stock: 80 },
          { id: 'still-available', stock: 20 },
        ],
        ['already-added'],
      ),
    ).toBe(false);
  });

  it.each([[[]], [[{ id: 'empty', stock: 0 }]]])(
    'returns false when the GRN has no in-stock lots (%j)',
    (lots) => {
      expect(areAllAvailableLotsAlreadyAdded(lots, ['empty'])).toBe(false);
    },
  );
});

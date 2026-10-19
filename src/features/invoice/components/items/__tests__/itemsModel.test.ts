import { groupInvoiceItems } from '@/features/invoice/utils/groupInvoiceItems';
import { invoiceLine } from '@/tests/helpers/invoiceFixtures';
import { groupView, weightedCharge } from '../itemsModel';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));

describe('weightedCharge: the one charge that gives the same storage total', () => {
  it('is the plain mean for lines of equal bags and months', () => {
    expect(weightedCharge([invoiceLine({ charge: 0 }, 0), invoiceLine({ charge: 5 }, 1)])).toBe(2.5);
  });

  it('weights by bag-months: 100 bags x 1 month at 4 and 100 bags x 3 months at 8 is 7', () => {
    const lines = [invoiceLine({ qty: 100, duration: 1, charge: 4 }, 0), invoiceLine({ qty: 100, duration: 3, charge: 8 }, 1)];
    expect(weightedCharge(lines)).toBe(7);
  });

  it('weights by bags alone for a one-time GRN, whatever the duration', () => {
    const lines = [
      invoiceLine({ qty: 100, duration: 1, charge: 4, one_time: true }, 0),
      invoiceLine({ qty: 300, duration: 9, charge: 8, one_time: true }, 1),
    ];
    expect(weightedCharge(lines)).toBe(7);
  });

  it('reads a bad quantity, charge or duration as the amounts do: 0 bags, 0 charge, duration 1', () => {
    const lines = [
      invoiceLine({ qty: Number.NaN, charge: 9 }, 0),
      invoiceLine({ qty: 10, charge: -3, duration: 0 }, 1),
      invoiceLine({ qty: 10, charge: 6, duration: 0 }, 2),
    ];
    // weights 0, 10, 10; charges 9 (no weight), 0, 6: (0 + 60) / 20 = 3
    expect(weightedCharge(lines)).toBe(3);
  });

  it('falls back to the plain mean when the weights add up to 0, and is 0 for no lines', () => {
    expect(weightedCharge([invoiceLine({ qty: 0, charge: 4 }, 0), invoiceLine({ qty: 0, charge: 8 }, 1)])).toBe(6);
    expect(weightedCharge([])).toBe(0);
  });

  it('rounds to two places', () => {
    const lines = [invoiceLine({ qty: 1, duration: 1, charge: 1 }, 0), invoiceLine({ qty: 2, duration: 1, charge: 2 }, 1)];
    expect(weightedCharge(lines)).toBe(1.67);
  });
});

describe('groupView: the average and what the steppers step from', () => {
  const group = (charges: number[]) => groupInvoiceItems(charges.map((charge, n) => invoiceLine({ charge }, n)))[0];

  it('shows the average of lines that differ, flagged, and steps from the shared rate of the lines without their own', () => {
    const view = groupView(group([5, 5, 9]), undefined, { edit_2_0: ['charge'] }).charge;
    expect(view).toMatchObject({ average: true, mixed: false, text: '6.33', stepFrom: 5, keepOwn: 1, applies: true });
  });

  it('has no stepFrom while the lines without their own charge differ among themselves', () => {
    expect(groupView(group([5, 6, 9]), undefined, {}).charge).toMatchObject({ average: true, stepFrom: null });
  });

  it('has no stepFrom when every line keeps its own charge, and nothing a press reaches', () => {
    const view = groupView(group([5, 9]), undefined, { edit_0_0: ['charge'], edit_1_0: ['charge'] }).charge;
    expect(view).toMatchObject({ stepFrom: null, applies: false });
  });

  it('is not an average when the lines agree: the shared rate is the text and the step point', () => {
    expect(groupView(group([5, 5]), undefined, {}).charge).toMatchObject({ average: false, mixed: false, text: '5.00', stepFrom: 5 });
  });

  it('says Mixed for Labour of lines that differ without their own figure, but shows the shared figure of the rest', () => {
    const lines = [invoiceLine({ labour_rate: 1 }, 0), invoiceLine({ labour_rate: 2 }, 1), invoiceLine({ labour_rate: 2 }, 2)];
    const g = groupInvoiceItems(lines)[0];
    expect(groupView(g, undefined, {}).labour_rate).toMatchObject({ mixed: true, text: '', stepFrom: null });
    expect(groupView(g, undefined, { edit_0_0: ['labour_rate'] }).labour_rate).toMatchObject({ mixed: false, text: '2.00', stepFrom: 2, keepOwn: 1 });
  });
});

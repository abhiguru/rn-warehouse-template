/**
 * The Items table of the dispatch review step: Item | GRN/Received | Qty at 411 dp, the GRN text under the item from
 * font scale 1.5 or when the columns would crowd it, a quantity that goes under the item too when it would still
 * crowd it, the total row, and "—" for a value a line does not have.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { DispatchReviewStep } from '@/features/dispatch/screens/DispatchReviewStep';
import { setLanguage } from '@/i18n';
import { space } from '@/theme/tokens';
import { reviewHeader, reviewLine } from '@/tests/helpers/dispatchReviewFixtures';

let mockWidth = 411;
let mockFontScale = 1;
const mockForm = {
  header: { ...reviewHeader },
  items: [] as ReturnType<typeof reviewLine>[],
  images: [],
  isSaving: false,
  isLoading: false,
  isCreateMode: true,
  dispatchId: null,
  submitForm: jest.fn(),
  navigateToStep: jest.fn(),
  resetFormState: jest.fn(),
  addImageToForm: jest.fn(),
  updateImageUploadProgress: jest.fn(),
  updateImageUploadStatus: jest.fn(),
  removeImageFromForm: jest.fn(),
  validationErrors: {},
};

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 800, scale: 3, fontScale: mockFontScale }),
}));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@/hooks/useDispatchForm', () => ({ useDispatchForm: () => mockForm }));
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
jest.mock('@/components/DocumentSuccessDialog', () => ({ DocumentSuccessDialog: 'DocumentSuccessDialog' }));
jest.mock('@/components/DispatchStepIndicator', () => ({ DispatchStepIndicator: () => null, dispatchSteps: () => [] }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
jest.mock('@/features/grn/components/ImageUploadButton', () => ({ ImageUploadButton: 'ImageUploadButton' }));
jest.mock('@/features/grn/components/ImagePreviewGrid', () => ({ ImagePreviewGrid: 'ImagePreviewGrid' }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() }, useLocalSearchParams: () => ({}) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0, top: 0 }) }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/hooks/useHaptics', () => ({ triggerSuccess: jest.fn(), triggerError: jest.fn(), triggerWarning: jest.fn() }));
jest.mock('@/features/dispatch/services/dispatchImageService', () => ({
  uploadDeferredDispatchImages: jest.fn(),
  generateTempDispatchId: () => 'temp_dispatch_fixture',
  deleteDispatchImage: jest.fn(),
  prepareDispatchImageForDeferredUpload: jest.fn(),
  uploadDispatchImage: jest.fn(),
}));
jest.mock('@/features/dispatch/services/grnDetailService', () => ({ getGRNDetailByNumber: jest.fn() }));
jest.mock('@/services/print-service', () => ({ printDispatchRange: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ generateDispatchPDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));

let tree: ReactTestRenderer;
const render = async (items: ReturnType<typeof reviewLine>[], width = 411, fontScale = 1) => {
  mockWidth = width;
  mockFontScale = fontScale;
  mockForm.items = items;
  await act(async () => { tree = create(<DispatchReviewStep mode="create" />); });
};
afterEach(async () => {
  await act(async () => { tree.unmount(); });
  setLanguage('en');
});

const textOf = (node: ReactTestInstance): string[] =>
  node.findAll((n) => (n.type as unknown) === 'Text').map((n) => [n.props.children].flat().join('').replace(/\u00A0/g, ' '));
const byId = (id: string) => tree.root.find((n) => n.props.testID === id && typeof n.type === 'string');
const table = () => byId('dispatch-review-items-table');
const row = (n: number) => byId(`dispatch-review-row-u${n}`);
/** The column headings: the texts of the table before the first line's item name. */
const headings = () => {
  const all = textOf(table());
  return all.slice(0, all.indexOf('Fictional item 1'));
};

/** The width of the column a text is in (the nearest ancestor with a numeric width), or undefined: it is in the item cell. */
const columnWidth = (node: ReactTestInstance): number | undefined => {
  for (let n: ReactTestInstance | null = node; n; n = n.parent) {
    const width = (StyleSheet.flatten(n.props.style) as { width?: unknown } | undefined)?.width;
    if (typeof width === 'number') return width;
  }
  return undefined;
};
/** The first text node of a line with this text. */
const textNode = (line: ReactTestInstance, text: string) =>
  line.findAll((n) => (n.type as unknown) === 'Text' && [n.props.children].flat().join('').replace(/\u00A0/g, ' ') === text)[0];

const ordinary = () => [reviewLine(1, { grn: 'A101', received: 100, quantity: 5 }), reviewLine(2, { grn: 'A102', received: 80, quantity: 7 })];

describe('columns', () => {
  it.each([[1.0], [1.3]])('411 dp at font scale %s: Item | GRN/Received | Qty, the GRN text in its own column', async (fontScale) => {
    await render(ordinary(), 411, fontScale);

    expect(headings()).toEqual(['Item', 'GRN/Received', 'Qty']);
    expect(textOf(row(1))).toEqual(expect.arrayContaining(['Fictional item 1', 'A101/100', '5']));
    expect(textOf(row(2))).toEqual(expect.arrayContaining(['Fictional item 2', 'A102/80', '7']));
    // The GRN text and the quantity are each in a column of their own; the name is in the item cell.
    expect(columnWidth(textNode(row(1), 'A101/100'))).toBeGreaterThan(0);
    expect(columnWidth(textNode(row(1), '5'))).toBeGreaterThan(0);
    expect(columnWidth(textNode(row(1), 'Fictional item 1'))).toBeUndefined();
  });

  it('font scale 1.5: the GRN text moves under the item and the table is Item | Qty', async () => {
    await render(ordinary(), 411, 1.5);

    expect(headings()).toEqual(['Item', 'Qty']);
    expect(columnWidth(textNode(row(1), 'A101/100'))).toBeUndefined();
    expect(columnWidth(textNode(row(1), '5'))).toBeGreaterThan(0);
  });

  it('WMWM8884/1,677 with 9,999 bags at 1.3: the GRN text moves under the item, the quantity keeps its column', async () => {
    await render([reviewLine(1, { grn: 'WMWM8884', received: 1677, quantity: 9999 }), reviewLine(2, { grn: 'A102', received: 80, quantity: 7 })], 411, 1.3);

    expect(headings()).toEqual(['Item', 'Qty']);
    // The GRN text is in the item cell (no column of its own); the quantity has a column wide enough for 9,999.
    expect(columnWidth(textNode(row(1), 'WMWM8884/1,677'))).toBeUndefined();
    expect(textOf(row(1)).slice(-2)).toEqual(['WMWM8884/1,677', '9,999']);
    expect(columnWidth(textNode(row(1), '9,999'))).toBeGreaterThanOrEqual(60);
    // One layout for the whole table: the other line's GRN text is under its item as well.
    expect(columnWidth(textNode(row(2), 'A102/80'))).toBeUndefined();
  });

  it.each([
    [320, 2.0, 9999, '9,999'],
    [411, 2.0, 9999999, '99,99,999'],
  ])('%s dp at font scale %s with %s bags: the quantity would take too much of the row and goes under the item, its heading stays', async (width, fontScale, bags, figure) => {
    await render([reviewLine(1, { grn: 'WMWM8884', received: 1677, quantity: bags, stock: 99999999 }), reviewLine(2, { grn: 'A102', received: 80, quantity: 7 })], width, fontScale);

    expect(headings()).toEqual(['Item', 'Qty']);
    expect(columnWidth(textNode(row(1), figure))).toBeUndefined();
    // One layout for the whole table: the small quantity is under its item too.
    expect(columnWidth(textNode(row(2), '7'))).toBeUndefined();
    expect(textOf(row(1)).slice(-2)).toEqual(['WMWM8884/1,677', figure]);
  });
});

describe('the total row', () => {
  it('sums every line and counts the lines and the GRNs', async () => {
    await render([...ordinary(), reviewLine(3, { grn: 'A101', received: 100, quantity: 9999 })]);

    const total = byId('dispatch-review-items-total');
    expect(textOf(total)).toEqual(expect.arrayContaining(['Total', '3 item lines', '2 GRNs', '10,011']));
    expect(total.props.accessibilityLabel).toBe('Total: 3 item lines from 2 GRNs, 10,011 bags dispatched');
  });

  it('stays under the item at font scale 1.5, with no GRN column', async () => {
    await render(ordinary(), 411, 1.5);

    expect(textOf(byId('dispatch-review-items-total'))).toEqual(['Total', '2 item lines · 2 GRNs', '12']);
  });
});

describe('empty values', () => {
  it('a line without a rack shows "Rack —"; one with a rack shows it', async () => {
    await render([reviewLine(1, { rack: '' }), reviewLine(2, { rack: 'R2' })]);

    expect(textOf(row(1))).toContain('Rack —');
    expect(textOf(row(2))).toContain('Rack R2');
    expect(textOf(row(2))).not.toContain('Rack —');
  });

  it('the details show "—" for a missing vehicle, address, mobile number and note', async () => {
    mockForm.header = { ...reviewHeader, registration: '', customer_address: '', customer_city: '', customer_mobile: '', note: '' };
    await render(ordinary());
    const details = textOf(byId('dispatch-review-body-details'));
    mockForm.header = { ...reviewHeader };

    // Label then value, for each of the four.
    ['Vehicle', 'Address', 'Mobile number', 'Notes'].forEach((label) => {
      expect(details[details.indexOf(label) + 1]).toBe('—');
    });
    expect(details[details.indexOf('Customer') + 1]).toBe('Fictional Traders');
  });
});

it('each line is one element for a screen reader: item, mark, GRN, quantity, weight, rack, received and stock', async () => {
  await render([reviewLine(1, { grn: 'A101', quantity: 5, stock: 40, mark: 'PM', weight: 50, received: 100, rack: 'R3' })]);

  const labels = tree.root.findAll((n) => typeof n.type === 'string' && typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Item 1'));
  expect(labels.map((n) => n.props.accessibilityLabel)).toEqual(['Item 1, Fictional item 1, mark PM, GRN A101, quantity 5 bags, 50 kg each, Rack R3, Received 100 bags, 35 left']);
});

it('a line without a rack says "Rack —" to a screen reader, as it is drawn', async () => {
  await render([reviewLine(1, { rack: '', received: 1677 })]);

  expect(row(1).props.accessibilityLabel).toContain('Rack —, Received 1,677 bags');
});

describe('the total row (R1-03)', () => {
  it('is padded like the lines, so its figure lines up with theirs', async () => {
    await render(ordinary());

    const padding = (node: ReactTestInstance) => (StyleSheet.flatten(node.props.style) as { paddingHorizontal?: number } | undefined)?.paddingHorizontal;
    const lineRow = row(1).find((n) => typeof n.type === 'string' && padding(n) !== undefined);
    expect(padding(byId('dispatch-review-items-total'))).toBe(space.sm);
    expect(padding(lineRow)).toBe(space.sm);
  });
});

describe('a long mark (R1-04)', () => {
  const MARK = 'BL/STRETCH-LOT-0004/A';

  it('wraps to two lines before it is cut, and the whole mark is in the line label', async () => {
    await render([reviewLine(1, { mark: MARK }), reviewLine(2, { mark: 'BL/STRETCH-LOT-0004/B' })]);

    const mark = textNode(row(1), MARK);
    expect(mark.props.numberOfLines).toBe(2);
    expect(mark.props.ellipsizeMode).toBe('tail');
    expect(row(1).props.accessibilityLabel).toContain(`mark ${MARK}`);
    expect(row(2).props.accessibilityLabel).toContain('mark BL/STRETCH-LOT-0004/B');
  });
});

describe('Notes and Address as a block (R1-05)', () => {
  const LONG = 'Deliver after 6 pm to the side gate. Call the supervisor before unloading. Keep the bags dry.';

  it('puts the label above the value, left-aligned, not as a right-aligned key-value row', async () => {
    mockForm.header = { ...reviewHeader, note: LONG };
    await render(ordinary());
    mockForm.header = { ...reviewHeader };

    const details = byId('dispatch-review-body-details');
    for (const [label, value] of [['Notes', LONG], ['Address', '12 Sample Road, Samplepur']]) {
      // The block is the one element that says "Notes, <the note>" to a screen reader
      const block = details.find((n) => typeof n.type === 'string' && n.props.accessibilityLabel === `${label}, ${value}`);
      const valueText = block.findAll((n) => (n.type as unknown) === 'Text' && n.props.children === value)[0];
      const blockStyle = StyleSheet.flatten(block.props.style) as { flexDirection?: string };
      const valueStyle = StyleSheet.flatten(valueText.props.style) as { textAlign?: string };
      // Label first, value after it, in a column; the value is left-aligned.
      expect(block.findAll((n) => (n.type as unknown) === 'Text').map((n) => n.props.children)).toEqual([label, value]);
      expect(blockStyle.flexDirection).not.toBe('row');
      expect(valueStyle.textAlign).toBe('left');
      expect(block.props.accessibilityLabel).toBe(`${label}, ${value}`);
    }
    // A short key-value row beside them is still right-aligned (the contrast).
    const customer = details.findAll((n) => (n.type as unknown) === 'Text' && n.props.children === 'Fictional Traders')[0];
    expect((StyleSheet.flatten(customer.props.style) as { textAlign?: string }).textAlign).toBe('right');
  });
});

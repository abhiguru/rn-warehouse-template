/**
 * DocumentSuccessDialog, a failed share (R1-09): the error is the shared message strip (InlineValidation, style guide
 * §13.9), one accessible element that says "Error: <message>", so VoiceOver on iOS announces it (a plain View with
 * only `accessibilityRole="alert"` was not accessible there). No error, no strip.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { getTokens } from '@/theme/tokens';
import { DocumentSuccessDialog } from '../DocumentSuccessDialog';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');

const DATA = { documentNo: 'D0042', customerName: 'Example Traders', date: '9 Oct 2026', itemCount: 3 };
let tree: ReactTestRenderer;
const renderWith = (shareError?: string | null) => {
  act(() => {
    tree = create(
      <DocumentSuccessDialog isVisible entity="dispatch" documentData={DATA} onCreateAnother={jest.fn()} onViewList={jest.fn()} onSharePDF={jest.fn()} shareError={shareError} />,
    );
  });
};
afterEach(() => act(() => tree.unmount()));

const flat = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...([] as unknown[]).concat(style as never).flat(Infinity as 1).filter(Boolean));

it('draws the share error as an accessible alert strip that reads "Error: ..."', () => {
  renderWith("Couldn't share the PDF. Try again.");

  const holder = tree.root.find((n) => typeof n.type === 'string' && n.props.testID === 'document-success-share-error');
  const strip = holder.find((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'alert');
  expect(strip.props.accessible).toBe(true);
  expect(strip.props.accessibilityLabel).toBe("Error: Couldn't share the PDF. Try again.");
  expect(strip.props.accessibilityLiveRegion).toBe('polite');
  // The status.negative strip of the guide
  const negative = getTokens('orange', 'light').status.negative;
  expect(flat(strip.props.style)).toMatchObject({ backgroundColor: negative.background, borderColor: negative.border });
});

it('draws nothing without an error', () => {
  renderWith(null);
  expect(tree.root.findAll((n) => n.props.testID === 'document-success-share-error')).toHaveLength(0);
});

/**
 * DocumentSuccessDialog, a failed share (R1-09): the error is the shared message strip (InlineValidation, style guide
 * §13.9), one accessible element that says "Error: <message>", so VoiceOver on iOS announces it (a plain View with
 * only `accessibilityRole="alert"` was not accessible there). No error, no strip.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react-native';
import { getTokens } from '@/theme/tokens';
import { DocumentSuccessDialog } from '../DocumentSuccessDialog';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');

const DATA = { documentNo: 'D0042', customerName: 'Example Traders', date: '9 Oct 2026', itemCount: 3 };
const renderWith = (shareError?: string | null) =>
  render(
    <DocumentSuccessDialog isVisible entity="dispatch" documentData={DATA} onCreateAnother={jest.fn()} onViewList={jest.fn()} onSharePDF={jest.fn()} shareError={shareError} />,
  );

const flat = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...([] as unknown[]).concat(style as never).flat(Infinity as 1).filter(Boolean));

it('draws the share error as an accessible alert strip that reads "Error: ..."', async () => {
  await renderWith("Couldn't share the PDF. Try again.");

  // The holder has no role or text of its own: it is found by its test id.
  const holder = screen.getByTestId('document-success-share-error');
  const strip = within(holder).getByRole('alert', { name: "Error: Couldn't share the PDF. Try again." });
  expect(strip).toBeOnTheScreen();
  expect(strip.props.accessible).toBe(true);
  expect(strip).toHaveAccessibleName("Error: Couldn't share the PDF. Try again.");
  expect(strip.props.accessibilityLiveRegion).toBe('polite');
  // The status.negative strip of the guide
  const negative = getTokens('orange', 'light').status.negative;
  expect(flat(strip.props.style)).toMatchObject({ backgroundColor: negative.background, borderColor: negative.border });
});

it('draws nothing without an error', async () => {
  await renderWith(null);
  expect(screen.queryByTestId('document-success-share-error')).not.toBeOnTheScreen();
  expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
});

it('shows the total quantity after Items, and nothing when it is not given', async () => {
  const texts = () => screen.getAllByText(/.+/).map(node => [node.props.children].flat(Infinity).join(''));
  const first = await render(
    <DocumentSuccessDialog isVisible entity="grn" documentData={{ ...DATA, totalQuantity: 1250 }} onCreateAnother={jest.fn()} onViewList={jest.fn()} onSharePDF={jest.fn()} />,
  );
  const all = texts();
  expect(screen.getByText('Total quantity')).toBeOnTheScreen();
  expect(screen.getByText('1,250')).toBeOnTheScreen();
  // Both labels are on screen, so the order check cannot pass on a missing text (indexOf -1).
  expect(screen.getByText('Items')).toBeOnTheScreen();
  expect(all.indexOf('Total quantity')).toBeGreaterThan(all.indexOf('Items'));
  await first.unmount();
  await renderWith(null);
  expect(screen.queryByText('Total quantity')).not.toBeOnTheScreen();
});

/**
 * Second device pass of the Gujarati version (2026-10-10), as tests.
 *
 *  - A text input that holds a number shows it in the language's digits and stores
 *    what is typed in 0-9; an identifier input shows exactly what is stored.
 *  - Labels inside bordered controls (buttons, the back button) are held to one line
 *    in Gujarati, so a last word cannot drop to a clipped second line.
 *  - The order title does not inflect the customer's name, and the order status line
 *    puts the name on its own line in Gujarati instead of ending in a cut separator.
 */
import React from 'react';
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { identifierInput, numericInput, setLanguage, t } from '@/i18n';
import { Input, NumberInput } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { StepperInput } from '@/components/fiori/StepperInput';
import { NumberRangeEditor } from '@/features/filters/components/editors/RangeEditors';
import CustomerOrderSummary from '@/components/CustomerOrderSummary';
import type { Order } from '@/types/order.types';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// A negative check must also see a Text that is mounted but hidden.
const texts = (hidden = false): string[] =>
  screen.queryAllByText(/^/, { includeHiddenElements: hidden }).map(node => [node.props.children].flat(Infinity).filter(child => typeof child === 'string' || typeof child === 'number').join(''));
/** The text boxes drawn, in order (an empty pattern matches every display value). */
const fields = () => screen.getAllByDisplayValue(/^/);

afterEach(() => setLanguage('en'));

describe('number inputs', () => {
  it('the helper shows a stored number in Gujarati digits and stores typed digits in 0-9', () => {
    setLanguage('gu');
    const stored = jest.fn();
    const props = numericInput('18', stored);
    expect(props.value).toBe('૧૮');
    props.onChangeText('૨૦');
    expect(stored).toHaveBeenCalledWith('20');
    expect(numericInput(0, stored).value).toBe('૦');
    expect(numericInput(undefined, stored).value).toBe('');
  });

  it('the helper leaves English as it is', () => {
    const stored = jest.fn();
    const props = numericInput('18', stored);
    expect(props.value).toBe('18');
    props.onChangeText('20.5');
    expect(stored).toHaveBeenCalledWith('20.5');
  });

  it('an identifier is shown as stored, and typed Gujarati digits are stored in 0-9', () => {
    setLanguage('gu');
    const stored = jest.fn();
    const props = identifierInput('DV0198', stored);
    expect(props.value).toBe('DV0198');
    props.onChangeText('DV૦૧૯૯');
    expect(stored).toHaveBeenCalledWith('DV0199');
    expect(identifierInput(53, stored).value).toBe('53');
  });

  it('Input with `numeric` displays ૧૮ for a stored 18 and stores 20 when ૨૦ is typed', async () => {
    setLanguage('gu');
    const stored = jest.fn();
    await render(<Input numeric value="18" onChangeText={stored} keyboardType="decimal-pad" />);
    const field = screen.getByDisplayValue('૧૮');
    expect(field).toHaveDisplayValue('૧૮');
    expect(field).toHaveProp('keyboardType', 'decimal-pad');
    await fireEvent.changeText(field, '૨૦');
    expect(stored).toHaveBeenCalledWith('20');
  });

  it('NumberInput is numeric; an uncontrolled numeric Input shows what was typed in Gujarati digits', async () => {
    setLanguage('gu');
    await render(<NumberInput />);
    await fireEvent.changeText(fields()[0], '45');
    expect(fields()[0]).toHaveDisplayValue('૪૫');
    expect(fields()[0]).toHaveProp('keyboardType', 'numeric');
  });

  it('Input with `identifier` displays DV0198 unchanged and stores typed ૦-૯ as 0-9', async () => {
    setLanguage('gu');
    const stored = jest.fn();
    await render(<Input identifier value="DV0198" onChangeText={stored} />);
    const field = screen.getByDisplayValue('DV0198');
    expect(field).toHaveDisplayValue('DV0198');
    await fireEvent.changeText(field, 'DV૦૧૯૮');
    expect(stored).toHaveBeenCalledWith('DV0198');
  });

  it('a plain Input changes nothing in either direction', async () => {
    setLanguage('gu');
    const stored = jest.fn();
    await render(<Input value="Gate 18" onChangeText={stored} />);
    const field = screen.getByDisplayValue('Gate 18');
    expect(field).toHaveDisplayValue('Gate 18');
    await fireEvent.changeText(field, 'ગેટ ૧૮');
    expect(stored).toHaveBeenCalledWith('ગેટ ૧૮');
  });

  it('English shows 18 in a numeric Input', async () => {
    await render(<Input numeric value="18" onChangeText={jest.fn()} />);
    expect(fields()[0]).toHaveDisplayValue('18');
  });

  it('the filter number range shows its values in Gujarati digits and reports numbers', async () => {
    setLanguage('gu');
    const changed = jest.fn();
    await render(<NumberRangeEditor label="વજન" value={{ min: 10, max: 25 }} onChange={changed} />);
    const [min, max] = fields();
    expect(min).toHaveDisplayValue('૧૦');
    expect(max).toHaveDisplayValue('૨૫');
    await fireEvent.changeText(max, '૩૦');
    expect(changed).toHaveBeenLastCalledWith({ min: 10, max: 30 });
    expect(fields()[1]).toHaveDisplayValue('૩૦');
  });

  it('the stepper shows the value being edited in Gujarati digits', async () => {
    setLanguage('gu');
    const changed = jest.fn();
    await render(<StepperInput value={12} onValueChange={changed} />);
    await userEvent.setup({ delay: 0 }).press(screen.getByHintText(t('components.stepper.valueHint')));
    const field = screen.getByDisplayValue(/^૧૨/);
    expect(field.props.value).toMatch(/^૧૨/);
    expect(field.props.value).not.toMatch(/[0-9]/);
    await fireEvent.changeText(field, '૧૫');
    expect(fields()[0]).toHaveDisplayValue('૧૫');
  });
});

describe('labels inside bordered controls', () => {
  it('a Gujarati button label is one line that may shrink; the English label is as before', async () => {
    await render(<Button>Go back</Button>);
    const english = screen.getByText('Go back').props;
    expect(english.numberOfLines).toBe(2);
    expect(english.adjustsFontSizeToFit).toBeUndefined();
    await screen.unmount();

    setLanguage('gu');
    await render(<Button>{t('common.goBack')}</Button>);
    const gujarati = screen.getByText(t('common.goBack')).props;
    expect(gujarati.numberOfLines).toBe(1);
    expect(gujarati.adjustsFontSizeToFit).toBe(true);
    expect(gujarati.minimumFontScale).toBe(0.8);
  });

  it('the header back button holds its Gujarati label to one line', async () => {
    await render(<HeaderBackButton />);
    expect(screen.getByText(/^/).props.numberOfLines).toBeUndefined();
    await screen.unmount();
    setLanguage('gu');
    await render(<HeaderBackButton />);
    expect(screen.getByText(/^/).props.numberOfLines).toBe(1);
  });
});

describe('order screen', () => {
  const order = {
    id: 'o1',
    items: [{ item_status: 'pending', requested_quantity: 90 }],
    updated_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    created_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    updated_by_display_name: 'Ramesh Patel',
  } as unknown as Order;

  it('the Gujarati title does not inflect the name; the English title is unchanged', () => {
    expect(t('orders.screen.title', { name: '24 Seven Foods' })).toBe('Order for 24 Seven Foods');
    expect(t('orders.screen.title', { name: '24 Seven Foods' }, 'gu')).toBe('ઑર્ડર: 24 Seven Foods');
  });

  it('English keeps "Saved … · name" on one line', async () => {
    await render(<CustomerOrderSummary order={order} />);
    const lines = texts(true);
    expect(lines.filter(line => line.includes('·'))).toHaveLength(1);
    expect(lines.find(line => line.includes('·'))).toMatch(/^Saved .* · Ramesh Patel$/);
  });

  it('Gujarati puts the time and the name on separate lines, with no separator to cut', async () => {
    setLanguage('gu');
    await render(<CustomerOrderSummary order={order} />);
    expect(texts(true).some(line => line.includes('·'))).toBe(false);
    expect(texts()).toContain('Ramesh Patel');
    expect(texts().some(line => line.endsWith('સચવાયું'))).toBe(true);
  });

  it('the catalog search placeholder is short enough for one line', () => {
    // A hint longer than the field wraps on Android and the field shows a clipped first line.
    expect(t('orders.catalog.searchPlaceholderHint', undefined, 'gu')).toBe('નામ, માર્કો કે વજનથી શોધો');
  });
});

/**
 * Second device pass of the Gujarati version (2026-10-10), as tests.
 *
 *  - A text input that holds a number shows it in the language's digits and stores
 *    what is typed in 0-9; an identifier input shows exactly what is stored.
 *  - Labels inside bordered controls (buttons, the back button) are held to one line
 *    in Gujarati, so a last word cannot drop to a clipped second line.
 *  - The order title does not inflect the customer's name, and the order status line
 *    puts the name on its own line in Gujarati instead of ending in a cut separator.
 *  - The stock tag of the GRN table sits under its right-aligned header.
 */
import React from 'react';
import { Text, TextInput } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { identifierInput, numericInput, setLanguage, t } from '@/i18n';
import { Input, NumberInput } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { StepperInput } from '@/components/fiori/StepperInput';
import { NumberRangeEditor } from '@/features/filters/components/editors/RangeEditors';
import CustomerOrderSummary from '@/components/CustomerOrderSummary';
import { getThemedStyles } from '@/hooks/useTheme';
import { getTokens } from '@/theme/tokens';
import { makeGRNListStyles } from '@/components/GRNListFiori.styles';
import type { Order } from '@/types/order.types';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

function render(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  return tree;
}

const texts = (tree: ReactTestRenderer): string[] =>
  tree.root.findAllByType(Text).map(node => [node.props.children].flat(Infinity).filter(child => typeof child === 'string' || typeof child === 'number').join(''));

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

  it('Input with `numeric` displays ૧૮ for a stored 18 and stores 20 when ૨૦ is typed', () => {
    setLanguage('gu');
    const stored = jest.fn();
    const tree = render(<Input numeric value="18" onChangeText={stored} keyboardType="decimal-pad" />);
    const field = tree.root.findByType(TextInput);
    expect(field.props.value).toBe('૧૮');
    expect(field.props.keyboardType).toBe('decimal-pad');
    act(() => field.props.onChangeText('૨૦'));
    expect(stored).toHaveBeenCalledWith('20');
  });

  it('NumberInput is numeric; an uncontrolled numeric Input shows what was typed in Gujarati digits', () => {
    setLanguage('gu');
    const tree = render(<NumberInput />);
    const field = () => tree.root.findByType(TextInput);
    act(() => field().props.onChangeText('45'));
    expect(field().props.value).toBe('૪૫');
    expect(field().props.keyboardType).toBe('numeric');
  });

  it('Input with `identifier` displays DV0198 unchanged and stores typed ૦-૯ as 0-9', () => {
    setLanguage('gu');
    const stored = jest.fn();
    const tree = render(<Input identifier value="DV0198" onChangeText={stored} />);
    const field = tree.root.findByType(TextInput);
    expect(field.props.value).toBe('DV0198');
    act(() => field.props.onChangeText('DV૦૧૯૮'));
    expect(stored).toHaveBeenCalledWith('DV0198');
  });

  it('a plain Input changes nothing in either direction', () => {
    setLanguage('gu');
    const stored = jest.fn();
    const tree = render(<Input value="Gate 18" onChangeText={stored} />);
    const field = tree.root.findByType(TextInput);
    expect(field.props.value).toBe('Gate 18');
    act(() => field.props.onChangeText('ગેટ ૧૮'));
    expect(stored).toHaveBeenCalledWith('ગેટ ૧૮');
  });

  it('English shows 18 in a numeric Input', () => {
    const tree = render(<Input numeric value="18" onChangeText={jest.fn()} />);
    expect(tree.root.findByType(TextInput).props.value).toBe('18');
  });

  it('the filter number range shows its values in Gujarati digits and reports numbers', () => {
    setLanguage('gu');
    const changed = jest.fn();
    const tree = render(<NumberRangeEditor label="વજન" value={{ min: 10, max: 25 }} onChange={changed} />);
    const [min, max] = tree.root.findAllByType(TextInput);
    expect(min.props.value).toBe('૧૦');
    expect(max.props.value).toBe('૨૫');
    act(() => max.props.onChangeText('૩૦'));
    expect(changed).toHaveBeenLastCalledWith({ min: 10, max: 30 });
    expect(tree.root.findAllByType(TextInput)[1].props.value).toBe('૩૦');
  });

  it('the stepper shows the value being edited in Gujarati digits', () => {
    setLanguage('gu');
    const changed = jest.fn();
    const tree = render(<StepperInput value={12} onValueChange={changed} />);
    const value = tree.root.findAll(node => node.props.accessibilityHint === t('components.stepper.valueHint') && typeof node.props.onPress === 'function')[0];
    act(() => value.props.onPress());
    const field = tree.root.findByType(TextInput);
    expect(field.props.value).toMatch(/^૧૨/);
    expect(field.props.value).not.toMatch(/[0-9]/);
    act(() => field.props.onChangeText('૧૫'));
    expect(tree.root.findByType(TextInput).props.value).toBe('૧૫');
  });
});

describe('labels inside bordered controls', () => {
  it('a Gujarati button label is one line that may shrink; the English label is as before', () => {
    const english = render(<Button>Go back</Button>).root.findByType(Text).props;
    expect(english.numberOfLines).toBe(2);
    expect(english.adjustsFontSizeToFit).toBeUndefined();

    setLanguage('gu');
    const gujarati = render(<Button>{t('common.goBack')}</Button>).root.findByType(Text).props;
    expect(gujarati.numberOfLines).toBe(1);
    expect(gujarati.adjustsFontSizeToFit).toBe(true);
    expect(gujarati.minimumFontScale).toBe(0.8);
  });

  it('the header back button holds its Gujarati label to one line', () => {
    expect(render(<HeaderBackButton />).root.findByType(Text).props.numberOfLines).toBeUndefined();
    setLanguage('gu');
    expect(render(<HeaderBackButton />).root.findByType(Text).props.numberOfLines).toBe(1);
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

  it('English keeps "Saved … · name" on one line', () => {
    const lines = texts(render(<CustomerOrderSummary order={order} />));
    expect(lines.filter(line => line.includes('·'))).toHaveLength(1);
    expect(lines.find(line => line.includes('·'))).toMatch(/^Saved .* · Ramesh Patel$/);
  });

  it('Gujarati puts the time and the name on separate lines, with no separator to cut', () => {
    setLanguage('gu');
    const lines = texts(render(<CustomerOrderSummary order={order} />));
    expect(lines.some(line => line.includes('·'))).toBe(false);
    expect(lines).toContain('Ramesh Patel');
    expect(lines.some(line => line.endsWith('સચવાયું'))).toBe(true);
  });

  it('the catalog search placeholder is short enough for one line', () => {
    // A hint longer than the field wraps on Android and the field shows a clipped first line.
    expect(t('orders.catalog.searchPlaceholderHint', undefined, 'gu')).toBe('નામ, માર્કો કે વજનથી શોધો');
  });
});

describe('GRN table', () => {
  it('the stock tag is aligned to the end of its column, like its header', () => {
    const styles = getThemedStyles(makeGRNListStyles, getTokens('orange', 'light'));
    expect(styles.colStock.textAlign).toBe('right');
    expect(styles.stockTag.alignSelf).toBe('flex-end');
  });
});

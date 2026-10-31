/**
 * Settings > Document numbers (WS-8): the screen is for administrators; one row per document type with its rule in
 * words; the edit sheet offers the schemes the backend allows for the type, the fields of the chosen scheme and an
 * example; a change is confirmed (existing documents keep their numbers) and then sent with set_document_numbering.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import DocumentNumberingScreen from '../../../app/document-numbering';
import { getDocumentNumbering, setDocumentNumbering, type NumberingRule } from '@/services/documentNumberingService';
import { setLanguage } from '@/i18n';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import { showToast } from '@/utils/toast';
import { showAlert } from '@/utils/alert';
import { NumberingUnconfirmedError } from '@/services/documentNumberingUnconfirmed';

let mockRole: string | undefined = 'admin';
let mockTheme: { preference: string; brand: string } = { preference: 'light', brand: 'orange' };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: mockTheme, auth: { userProfile: { role: mockRole } } }),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  Stack: { Screen: jest.fn(() => null) },
  useIsFocused: () => true,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/services/documentNumberingService', () => ({
  getDocumentNumbering: jest.fn(),
  setDocumentNumbering: jest.fn(),
}));

const rule = (over: Partial<NumberingRule>): NumberingRule => ({
  document_type: 'grn', scheme: 'letters', prefix: '', width: 4, start: 1, first_letter: 'A', per_letter: 1000, check: true,
  fy_reset: false, hint: 'A####', existing_documents: 12, not_following: 0, updated_at: '2026-10-01T00:00:00Z', updated_by: null, ...over,
});
const RULES = [
  rule({}),
  rule({ document_type: 'dispatch', scheme: 'sequence', prefix: 'I', hint: 'I####', check: false, not_following: 3, existing_documents: 40 }),
  rule({ document_type: 'invoice', scheme: 'year', prefix: '', width: 1, fy_reset: true, hint: '#', check: true, existing_documents: 7 }),
];

let tree: ReactTestRenderer | undefined;
const mount = async () => {
  await act(async () => { tree = create(<DocumentNumberingScreen />); });
  return tree as ReactTestRenderer;
};
const texts = (screen: ReactTestRenderer) => screen.root.findAllByType(Text).map(node => [node.props.children].flat(3).join('')).join(' | ');
const byId = (screen: ReactTestRenderer, testID: string): ReactTestInstance =>
  screen.root.findAll(node => node.props.testID === testID && (typeof node.props.onPress === 'function' || typeof node.props.onChangeText === 'function'))[0];
const press = async (screen: ReactTestRenderer, testID: string) => { await act(async () => { byId(screen, testID).props.onPress(); }); };
const type = async (screen: ReactTestRenderer, testID: string, text: string) => { await act(async () => { byId(screen, testID).props.onChangeText(text); }); };
const hasId = (screen: ReactTestRenderer, testID: string) => screen.root.findAll(node => node.props.testID === testID).length > 0;
const rowLabel = (screen: ReactTestRenderer, type: string): string =>
  screen.root.findAll(node => node.props.testID === `numbering-row-${type}` && typeof node.props.accessibilityLabel === 'string')[0].props.accessibilityLabel;
const choose = async (screen: ReactTestRenderer, label: string) => {
  const radio = screen.root.findAll(node => node.props.accessibilityRole === 'radio' && typeof node.props.onPress === 'function' && String(node.props.accessibilityLabel ?? '').startsWith(label))[0];
  await act(async () => { radio.props.onPress(); });
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  jest.setSystemTime(new Date('2026-10-28T06:00:00Z'));
  setLanguage('en');
  mockRole = 'admin';
  mockTheme = { preference: 'light', brand: 'orange' };
  jest.mocked(getDocumentNumbering).mockResolvedValue(RULES);
  jest.mocked(setDocumentNumbering).mockResolvedValue({
    changed: true, document_type: 'grn', existing_documents: 12, not_following: 0, next_number: 'GRN/26-27/0001', hint: 'GRN/26-27/####', reason: null,
  });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => { tree?.unmount(); });
  tree = undefined;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('who may open it', () => {
  it('gives the administrators-only state the screen title in the header, as the screen has', async () => {
    mockRole = 'staff';
    const { Stack } = jest.requireMock('expo-router') as { Stack: { Screen: jest.Mock } };
    Stack.Screen.mockClear();
    await mount();
    expect(Stack.Screen.mock.calls.some(([props]) => props.options?.title === 'Document numbers' && props.options?.headerShown === true)).toBe(true);
  });

  it.each(['supervisor', 'staff', 'customer', undefined])('%s is told it is for administrators and nothing is read', async role => {
    mockRole = role;
    const screen = await mount();
    expect(texts(screen)).toContain('Administrators only');
    expect(getDocumentNumbering).not.toHaveBeenCalled();
    expect(hasId(screen, 'numbering-row-grn')).toBe(false);
  });

  it('an administrator reads the rules and sees a row for each document type', async () => {
    const screen = await mount();
    expect(getDocumentNumbering).toHaveBeenCalledTimes(1);
    for (const id of ['grn', 'dispatch', 'invoice']) expect(hasId(screen, `numbering-row-${id}`)).toBe(true);
  });
});

describe('the rows', () => {
  it('say the rule in words, whether it is checked, and how many numbers do not follow it', async () => {
    const screen = await mount();
    const label = (type: string) => rowLabel(screen, type);
    expect(label('grn')).toContain('GRN');
    expect(label('grn')).toContain('Letter series from A, for example A0001');
    expect(label('grn')).toContain('A number outside the rule is refused');
    expect(label('dispatch')).toContain('Sequence, for example I0001');
    expect(label('dispatch')).toContain('A number outside the rule is saved (not checked)');
    expect(label('dispatch')).toContain('3 existing numbers do not follow the rule');
    expect(label('invoice')).toContain('Whole numbers, starting again at 1 every financial year');
    expect(label('invoice')).not.toContain('outside the rule');
  });

  it('shows the way to try again when the rules cannot be read', async () => {
    jest.mocked(getDocumentNumbering).mockRejectedValueOnce(new Error('x'));
    const screen = await mount();
    expect(hasId(screen, 'numbering-error')).toBe(true);
    expect(hasId(screen, 'numbering-row-grn')).toBe(false);
    const retry = screen.root.findAll(node => typeof node.props.onPress === 'function' && node.findAllByType(Text).some(t => t.props.children === 'Try again'))[0];
    await act(async () => { retry.props.onPress(); });
    expect(hasId(screen, 'numbering-row-grn')).toBe(true);
  });
});

describe('the edit sheet', () => {
  it('offers the four schemes for a GRN and the fields of the one in use', async () => {
    const screen = await mount();
    await press(screen, 'numbering-row-grn');
    const radios = screen.root.findAll(node => node.props.accessibilityRole === 'radio' && typeof node.props.onPress === 'function');
    expect(radios.map(node => node.props.accessibilityLabel)).toEqual([
      'Letters and digits (A0001)', 'Financial year (GRN/26-27/0001)', 'Plain sequence (I0001)', 'Typed by hand',
    ]);
    expect(['firstLetter', 'width', 'perLetter'].every(f => hasId(screen, `numbering-field-${f}`))).toBe(true);
    expect(hasId(screen, 'numbering-field-prefix')).toBe(false);
    expect(hasId(screen, 'numbering-field-start')).toBe(false);
  });

  it('changes the fields and the example with the scheme', async () => {
    const screen = await mount();
    await press(screen, 'numbering-row-grn');
    expect(texts(screen)).toContain('The first number looks like A0001');

    await choose(screen, 'Financial year');
    expect(['prefix', 'width', 'start'].every(f => hasId(screen, `numbering-field-${f}`))).toBe(true);
    expect(hasId(screen, 'numbering-field-firstLetter')).toBe(false);
    expect(hasId(screen, 'numbering-field-perLetter')).toBe(false);
    // Today (28 Oct 2026) is in financial year 2026-27.
    expect(texts(screen)).toContain('The first number looks like 26-27/0001');
    await type(screen, 'numbering-field-prefix', 'GRN/');
    await type(screen, 'numbering-field-width', '5');
    await type(screen, 'numbering-field-start', '42');
    expect(texts(screen)).toContain('The first number looks like GRN/26-27/00042');

    await choose(screen, 'Plain sequence');
    expect(texts(screen)).toContain('The first number looks like 0001');

    await choose(screen, 'Typed by hand');
    for (const f of ['firstLetter', 'width', 'perLetter', 'prefix', 'start']) expect(hasId(screen, `numbering-field-${f}`)).toBe(false);
    expect(texts(screen)).toContain('You type each number.');
  });

  it('offers an invoice the two whole-number options only, with the first number and no check', async () => {
    const screen = await mount();
    await press(screen, 'numbering-row-invoice');
    const radios = screen.root.findAll(node => node.props.accessibilityRole === 'radio' && typeof node.props.onPress === 'function');
    expect(radios.map(node => node.props.accessibilityLabel)).toEqual(['Start again every financial year', 'Keep counting across years']);
    expect(hasId(screen, 'numbering-field-start')).toBe(true);
    for (const f of ['firstLetter', 'width', 'perLetter', 'prefix']) expect(hasId(screen, `numbering-field-${f}`)).toBe(false);
    expect(screen.root.findAll(node => node.props.accessibilityRole === 'switch').length).toBe(0);
    await type(screen, 'numbering-field-start', '1001');
    expect(texts(screen)).toContain('The first number looks like 1001');
  });

  it('keeps Save off until something changed', async () => {
    const screen = await mount();
    await press(screen, 'numbering-row-grn');
    expect(byId(screen, 'numbering-save').props.disabled).toBe(true);
    await type(screen, 'numbering-field-perLetter', '500');
    expect(byId(screen, 'numbering-save').props.disabled).toBe(false);
  });

  it('does not go on while a field is wrong, and says which', async () => {
    const screen = await mount();
    await press(screen, 'numbering-row-grn');
    await type(screen, 'numbering-field-width', '9');
    expect(texts(screen)).toContain('Fix the fields above to see an example.');
    await press(screen, 'numbering-save');
    expect(texts(screen)).toContain('Enter a whole number from 1 to 7.');
    expect(hasId(screen, 'numbering-confirm')).toBe(false);
    expect(setDocumentNumbering).not.toHaveBeenCalled();
  });

  it('refuses a financial-year number that would not fit 20 characters', async () => {
    const screen = await mount();
    await press(screen, 'numbering-row-grn');
    await choose(screen, 'Financial year');
    await type(screen, 'numbering-field-prefix', 'ABCDEFGHIJ');
    await type(screen, 'numbering-field-width', '7');
    await press(screen, 'numbering-save');
    expect(texts(screen)).toContain('The number would be longer than 20 characters. Use fewer digits or a shorter prefix.');
  });
});

describe('saving', () => {
  it('asks first, says existing documents keep their numbers, and then sends only the fields of the scheme', async () => {
    const screen = await mount();
    await press(screen, 'numbering-row-grn');
    await choose(screen, 'Financial year');
    await type(screen, 'numbering-field-prefix', 'GRN/');
    await press(screen, 'numbering-save');

    // The confirm step is in the same sheet; nothing is sent yet.
    expect(setDocumentNumbering).not.toHaveBeenCalled();
    expect(texts(screen)).toContain('Change the numbering?');
    expect(texts(screen)).toContain('New numbers look like GRN/26-27/0001.');
    expect(texts(screen)).toContain('12 existing documents keep their numbers.');

    await press(screen, 'numbering-confirm');
    expect(setDocumentNumbering).toHaveBeenCalledTimes(1);
    expect(setDocumentNumbering).toHaveBeenCalledWith('grn', { scheme: 'year', prefix: 'GRN/', width: 4, start: 1, check: true });
    expect(showToast).toHaveBeenCalledWith('Numbering saved. The next number is GRN/26-27/0001.');
    // The sheet is closed and the rules are read again.
    expect(hasId(screen, 'numbering-confirm')).toBe(false);
    expect(getDocumentNumbering).toHaveBeenCalledTimes(2);
  });

  it('sends a letters rule with its three fields, and an invoice rule with the first number only', async () => {
    const screen = await mount();
    await press(screen, 'numbering-row-grn');
    await type(screen, 'numbering-field-firstLetter', 'x');
    await press(screen, 'numbering-save');
    await press(screen, 'numbering-confirm');
    expect(setDocumentNumbering).toHaveBeenLastCalledWith('grn', { scheme: 'letters', first_letter: 'X', width: 4, per_letter: 1000, check: true });

    await press(screen, 'numbering-row-invoice');
    await choose(screen, 'Keep counting');
    await type(screen, 'numbering-field-start', '1001');
    await press(screen, 'numbering-save');
    await press(screen, 'numbering-confirm');
    expect(setDocumentNumbering).toHaveBeenLastCalledWith('invoice', { scheme: 'sequence', start: 1001 });
  });

  it('sends a free rule as the scheme alone', async () => {
    const screen = await mount();
    await press(screen, 'numbering-row-grn');
    await choose(screen, 'Typed by hand');
    await press(screen, 'numbering-save');
    expect(texts(screen)).toContain('You will type each number.');
    await press(screen, 'numbering-confirm');
    expect(setDocumentNumbering).toHaveBeenLastCalledWith('grn', { scheme: 'free' });
  });

  it('switching the check on says how many existing numbers do not follow the rule (they are kept)', async () => {
    const screen = await mount();
    await press(screen, 'numbering-row-dispatch');
    const toggle = screen.root.findAll(node => node.props.accessibilityRole === 'switch' && typeof node.props.onPress === 'function')[0];
    await act(async () => { toggle.props.onPress(); });
    await press(screen, 'numbering-save');
    expect(texts(screen)).toContain('40 existing documents keep their numbers.');
    expect(texts(screen)).toContain('3 existing numbers do not follow this rule. They are kept.');
    await press(screen, 'numbering-confirm');
    expect(setDocumentNumbering).toHaveBeenLastCalledWith('dispatch', { scheme: 'sequence', prefix: 'I', width: 4, start: 1, check: true });
  });

  it('shows a refusal in words, keeps the sheet open and sends nothing else', async () => {
    jest.mocked(setDocumentNumbering).mockRejectedValueOnce(new Error('The prefix can have up to 10 characters: capital letters, digits, / and -.'));
    const screen = await mount();
    await press(screen, 'numbering-row-grn');
    await choose(screen, 'Financial year');
    await press(screen, 'numbering-save');
    await press(screen, 'numbering-confirm');
    expect(texts(screen)).toContain('The prefix can have up to 10 characters: capital letters, digits, / and -.');
    expect(hasId(screen, 'numbering-confirm')).toBe(true);
    expect(showToast).not.toHaveBeenCalled();
    expect(getDocumentNumbering).toHaveBeenCalledTimes(1);
  });

  it('says so when the rule was already as chosen', async () => {
    jest.mocked(setDocumentNumbering).mockResolvedValueOnce({ changed: false, document_type: 'grn', existing_documents: 12, not_following: 0, next_number: 'A0013', hint: 'A####', reason: null });
    const screen = await mount();
    await press(screen, 'numbering-row-grn');
    await type(screen, 'numbering-field-perLetter', '500');
    await press(screen, 'numbering-save');
    await press(screen, 'numbering-confirm');
    expect(showToast).toHaveBeenCalledWith('The numbering is as it was.');
  });
});

describe('what the save tells the administrator', () => {
  it('counts the existing numbers that do not follow the new rule, which are kept', async () => {
    jest.mocked(setDocumentNumbering).mockResolvedValueOnce({
      changed: true, document_type: 'grn', existing_documents: 12, not_following: 5, next_number: 'GRN/26-27/0001', hint: 'GRN/26-27/####', reason: null,
    });
    const screen = await mount();
    await press(screen, 'numbering-row-grn');
    await choose(screen, 'Financial year');
    await press(screen, 'numbering-save');
    await press(screen, 'numbering-confirm');
    expect(showToast).toHaveBeenCalledWith('Numbering saved. The next number is GRN/26-27/0001. 5 existing numbers do not follow the rule. They are kept.');
  });

  it('says nothing about numbers outside the rule when there are none', async () => {
    const screen = await mount();
    await press(screen, 'numbering-row-grn');
    await choose(screen, 'Financial year');
    await press(screen, 'numbering-save');
    await press(screen, 'numbering-confirm');
    expect(showToast).toHaveBeenCalledWith('Numbering saved. The next number is GRN/26-27/0001.');
  });

  it('says on the confirm step that the next number continues after the numbers already issued', async () => {
    const screen = await mount();
    await press(screen, 'numbering-row-grn');
    await choose(screen, 'Financial year');
    await press(screen, 'numbering-save');
    expect(texts(screen)).toContain('New numbers look like 26-27/0001.');
    expect(texts(screen)).toContain('The next number continues after the numbers already issued in this format.');
  });

  it('does not say it when no document of the type exists yet', async () => {
    jest.mocked(getDocumentNumbering).mockResolvedValue([rule({ existing_documents: 0 }), RULES[1], RULES[2]]);
    const screen = await mount();
    await press(screen, 'numbering-row-grn');
    await choose(screen, 'Financial year');
    await press(screen, 'numbering-save');
    expect(texts(screen)).toContain('New numbers look like 26-27/0001.');
    expect(texts(screen)).not.toContain('continues after');
  });
});

describe('leaving the edit sheet', () => {
  const closeButton = (screen: ReactTestRenderer) =>
    screen.root.findAll(node => typeof node.props.onPress === 'function' && node.props.accessibilityLabel === 'Cancel')[0];
  const lastAlertButtons = () => jest.mocked(showAlert).mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>;

  it('closes at once when nothing was changed', async () => {
    const screen = await mount();
    await press(screen, 'numbering-row-grn');
    await act(async () => { closeButton(screen).props.onPress(); });
    expect(showAlert).not.toHaveBeenCalled();
    expect(hasId(screen, 'numbering-save')).toBe(false);
  });

  it('asks "Discard changes?" when something was changed, and keeps the sheet on Keep editing', async () => {
    const screen = await mount();
    await press(screen, 'numbering-row-grn');
    await type(screen, 'numbering-field-perLetter', '500');
    await act(async () => { closeButton(screen).props.onPress(); });
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(jest.mocked(showAlert).mock.calls[0][0]).toBe('Discard changes?');
    expect(lastAlertButtons().map(button => button.text)).toEqual(['Keep editing', 'Discard']);
    expect(hasId(screen, 'numbering-save')).toBe(true);
    expect(byId(screen, 'numbering-field-perLetter').props.value).toBe('500');
  });

  it('closes the sheet and sends nothing when the changes are discarded', async () => {
    const screen = await mount();
    await press(screen, 'numbering-row-grn');
    await type(screen, 'numbering-field-perLetter', '500');
    await act(async () => { closeButton(screen).props.onPress(); });
    await act(async () => { lastAlertButtons()[1].onPress?.(); });
    expect(hasId(screen, 'numbering-save')).toBe(false);
    expect(setDocumentNumbering).not.toHaveBeenCalled();
  });
});

describe('in Gujarati', () => {
  it('writes counts in Gujarati digits and keeps the numbers and patterns in 0-9', async () => {
    setLanguage('gu');
    const screen = await mount();
    const label = rowLabel(screen, 'dispatch');
    expect(label).toContain('૩ હાલના નંબર નિયમ પ્રમાણે નથી');
    expect(label).toContain('I0001');
  });
});

describe.each(BRANDS.flatMap(brand => (['light', 'dark'] as Mode[]).map(mode => [brand, mode] as const)))('themes: %s %s', (brand, mode) => {
  it('paints the screen and the open sheet with the theme\'s colours', async () => {
    mockTheme = { preference: mode, brand };
    const screen = await mount();
    const tokens = getTokens(brand, mode);
    const colours = (root: ReactTestRenderer) =>
      root.root
        .findAll(node => typeof node.type === 'string' && !!node.props.style)
        .flatMap(node => [node.props.style].flat(Infinity).filter(Boolean).flatMap((style: Record<string, string>) => [style.backgroundColor, style.color]))
        .filter(Boolean)
        .map(colour => String(colour).toLowerCase());
    expect(colours(screen)).toContain(tokens.background.grouped.toLowerCase());
    await press(screen, 'numbering-row-grn');
    expect(colours(screen)).toContain(tokens.surface.sheet.toLowerCase());
    expect(texts(screen)).toContain('GRN numbers');
  });
});

describe('a save whose answer did not come through', () => {
  const UNCONFIRMED = "We couldn't confirm the change. Refresh to see the setting the server holds before you try again.";
  const toConfirm = async () => {
    const screen = await mount();
    await press(screen, 'numbering-row-grn');
    await type(screen, 'numbering-field-perLetter', '500');
    await press(screen, 'numbering-save');
    jest.mocked(setDocumentNumbering).mockRejectedValueOnce(new NumberingUnconfirmedError(UNCONFIRMED));
    await press(screen, 'numbering-confirm');
    return screen;
  };

  it('keeps the edit open with the values, the row on the previous setting, and offers Refresh and Try again', async () => {
    const screen = await toConfirm();
    expect(texts(screen)).toContain(UNCONFIRMED);
    expect(hasId(screen, 'numbering-refresh')).toBe(true);
    expect(hasId(screen, 'numbering-try-again')).toBe(true);
    // The sheet did not close and nothing was said to be saved.
    expect(hasId(screen, 'numbering-confirm')).toBe(true);
    expect(showToast).not.toHaveBeenCalled();
    expect(rowLabel(screen, 'grn')).toContain('A0001');
  });

  it('Refresh: the server holds the rule that was sent, so it says "Saved." and closes', async () => {
    const screen = await toConfirm();
    jest.mocked(getDocumentNumbering).mockResolvedValue([rule({ per_letter: 500, updated_at: '2026-10-28T06:00:00Z' }), RULES[1], RULES[2]]);
    await press(screen, 'numbering-refresh');
    expect(showToast).toHaveBeenCalledWith('Saved.');
    expect(hasId(screen, 'numbering-confirm')).toBe(false);
  });

  it('Refresh: the server holds another rule, so it says "Not saved." and the edit stays', async () => {
    const screen = await toConfirm();
    await press(screen, 'numbering-refresh');
    expect(texts(screen)).toContain('Not saved.');
    expect(showToast).not.toHaveBeenCalled();
    expect(hasId(screen, 'numbering-confirm')).toBe(true);
    expect(hasId(screen, 'numbering-try-again')).toBe(true);
  });

  it('Try again sends the same rule again', async () => {
    const screen = await toConfirm();
    const first = jest.mocked(setDocumentNumbering).mock.calls[0];
    await press(screen, 'numbering-try-again');
    expect(setDocumentNumbering).toHaveBeenCalledTimes(2);
    expect(jest.mocked(setDocumentNumbering).mock.calls[1]).toEqual(first);
    expect(showToast).toHaveBeenCalled();
  });
});

describe('pull to refresh', () => {
  it('reads the rules again', async () => {
    const screen = await mount();
    const control = screen.root.findAll(node => typeof node.props.onRefresh === 'function')[0];
    await act(async () => { control.props.onRefresh(); });
    expect(getDocumentNumbering).toHaveBeenCalledTimes(2);
  });
});

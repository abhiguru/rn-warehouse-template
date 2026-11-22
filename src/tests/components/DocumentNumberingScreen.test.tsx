/**
 * Settings > Document numbers (WS-8): the screen is for administrators; one row per document type with its rule in
 * words; the edit sheet offers the schemes the backend allows for the type, the fields of the chosen scheme and an
 * example; a change is confirmed (existing documents keep their numbers) and then sent with set_document_numbering.
 */
import React from 'react';
import { act, render, screen, userEvent } from '@testing-library/react-native';
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

const user = userEvent.setup({ delay: 0, advanceTimers: jest.advanceTimersByTime });
const mount = async () => {
  await render(<DocumentNumberingScreen />);
};
const shown = (text: string) => expect(screen.getByText(text)).toBeOnTheScreen();
const notShown = (text: string) => expect(screen.queryByText(text)).not.toBeOnTheScreen();
const byId = (testID: string) => screen.getByTestId(testID);
const hasId = (testID: string) => screen.queryByTestId(testID) !== null;
const press = async (testID: string) => { await user.press(byId(testID)); };
const type = async (testID: string, text: string) => {
  await user.clear(byId(testID));
  await user.type(byId(testID), text);
};
// Every drawn element, the root included (the root's own queryAll leaves it out).
const everyNode = (predicate: (node: ReturnType<typeof screen.getByTestId>) => boolean) =>
  [screen.root!, ...screen.root!.queryAll(() => true)].filter(predicate);
const rowLabel = (type: string): string => byId(`numbering-row-${type}`).props.accessibilityLabel;
const choose = async (label: string) => {
  await user.press(screen.getByRole('radio', { name: new RegExp(`^${label}`) }));
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
afterEach(() => {
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
    await mount();
    shown('Administrators only');
    expect(getDocumentNumbering).not.toHaveBeenCalled();
    expect(screen.queryByTestId('numbering-row-grn')).not.toBeOnTheScreen();
  });

  it('an administrator reads the rules and sees a row for each document type', async () => {
    await mount();
    expect(getDocumentNumbering).toHaveBeenCalledTimes(1);
    for (const id of ['grn', 'dispatch', 'invoice']) expect(screen.getByTestId(`numbering-row-${id}`)).toBeOnTheScreen();
  });
});

describe('the rows', () => {
  it('say the rule in words, whether it is checked, and how many numbers do not follow it', async () => {
    await mount();
    const label = (type: string) => rowLabel(type);
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
    await mount();
    expect(screen.getByTestId('numbering-error')).toBeOnTheScreen();
    expect(screen.queryByTestId('numbering-row-grn')).not.toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByTestId('numbering-row-grn')).toBeOnTheScreen();
  });
});

describe('the edit sheet', () => {
  it('offers the four schemes for a GRN and the fields of the one in use', async () => {
    await mount();
    await press('numbering-row-grn');
    const radios = screen.getAllByRole('radio');
    expect(radios.map(node => node.props.accessibilityLabel)).toEqual([
      'Letters and digits (A0001)', 'Financial year (GRN/26-27/0001)', 'Plain sequence (I0001)', 'Typed by hand',
    ]);
    expect(['firstLetter', 'width', 'perLetter'].every(f => hasId(`numbering-field-${f}`))).toBe(true);
    expect(screen.queryByTestId('numbering-field-prefix')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('numbering-field-start')).not.toBeOnTheScreen();
  });

  it('changes the fields and the example with the scheme', async () => {
    await mount();
    await press('numbering-row-grn');
    shown('The first number looks like A0001');

    await choose('Financial year');
    expect(['prefix', 'width', 'start'].every(f => hasId(`numbering-field-${f}`))).toBe(true);
    expect(screen.queryByTestId('numbering-field-firstLetter')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('numbering-field-perLetter')).not.toBeOnTheScreen();
    // Today (28 Oct 2026) is in financial year 2026-27.
    shown('The first number looks like 26-27/0001');
    await type('numbering-field-prefix', 'GRN/');
    await type('numbering-field-width', '5');
    await type('numbering-field-start', '42');
    shown('The first number looks like GRN/26-27/00042');

    await choose('Plain sequence');
    shown('The first number looks like 0001');

    await choose('Typed by hand');
    for (const f of ['firstLetter', 'width', 'perLetter', 'prefix', 'start']) expect(screen.queryByTestId(`numbering-field-${f}`)).not.toBeOnTheScreen();
    shown('You type each number.');
  });

  it('offers an invoice the two whole-number options only, with the first number and no check', async () => {
    await mount();
    await press('numbering-row-invoice');
    const radios = screen.getAllByRole('radio');
    expect(radios.map(node => node.props.accessibilityLabel)).toEqual(['Start again every financial year', 'Keep counting across years']);
    expect(screen.getByTestId('numbering-field-start')).toBeOnTheScreen();
    for (const f of ['firstLetter', 'width', 'perLetter', 'prefix']) expect(screen.queryByTestId(`numbering-field-${f}`)).not.toBeOnTheScreen();
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    await type('numbering-field-start', '1001');
    shown('The first number looks like 1001');
  });

  it('keeps Save off until something changed', async () => {
    await mount();
    await press('numbering-row-grn');
    expect(byId('numbering-save')).toBeDisabled();
    await type('numbering-field-perLetter', '500');
    expect(byId('numbering-save')).toBeEnabled();
  });

  it('does not go on while a field is wrong, and says which', async () => {
    await mount();
    await press('numbering-row-grn');
    await type('numbering-field-width', '9');
    shown('Fix the fields above to see an example.');
    await press('numbering-save');
    shown('Enter a whole number from 1 to 7.');
    expect(screen.queryByTestId('numbering-confirm')).not.toBeOnTheScreen();
    expect(setDocumentNumbering).not.toHaveBeenCalled();
  });

  it('refuses a financial-year number that would not fit 20 characters', async () => {
    await mount();
    await press('numbering-row-grn');
    await choose('Financial year');
    await type('numbering-field-prefix', 'ABCDEFGHIJ');
    await type('numbering-field-width', '7');
    await press('numbering-save');
    shown('The number would be longer than 20 characters. Use fewer digits or a shorter prefix.');
  });
});

describe('saving', () => {
  it('asks first, says existing documents keep their numbers, and then sends only the fields of the scheme', async () => {
    await mount();
    await press('numbering-row-grn');
    await choose('Financial year');
    await type('numbering-field-prefix', 'GRN/');
    await press('numbering-save');

    // The confirm step is in the same sheet; nothing is sent yet.
    expect(setDocumentNumbering).not.toHaveBeenCalled();
    shown('Change the numbering?');
    shown('New numbers look like GRN/26-27/0001.');
    shown('12 existing documents keep their numbers.');

    await press('numbering-confirm');
    expect(setDocumentNumbering).toHaveBeenCalledTimes(1);
    expect(setDocumentNumbering).toHaveBeenCalledWith('grn', { scheme: 'year', prefix: 'GRN/', width: 4, start: 1, check: true });
    expect(showToast).toHaveBeenCalledWith('Numbering saved. The next number is GRN/26-27/0001.');
    // The sheet is closed and the rules are read again.
    expect(screen.queryByTestId('numbering-confirm')).not.toBeOnTheScreen();
    expect(getDocumentNumbering).toHaveBeenCalledTimes(2);
  });

  it('sends a letters rule with its three fields, and an invoice rule with the first number only', async () => {
    await mount();
    await press('numbering-row-grn');
    await type('numbering-field-firstLetter', 'x');
    await press('numbering-save');
    await press('numbering-confirm');
    expect(setDocumentNumbering).toHaveBeenLastCalledWith('grn', { scheme: 'letters', first_letter: 'X', width: 4, per_letter: 1000, check: true });

    await press('numbering-row-invoice');
    await choose('Keep counting');
    await type('numbering-field-start', '1001');
    await press('numbering-save');
    await press('numbering-confirm');
    expect(setDocumentNumbering).toHaveBeenLastCalledWith('invoice', { scheme: 'sequence', start: 1001 });
  });

  it('sends a free rule as the scheme alone', async () => {
    await mount();
    await press('numbering-row-grn');
    await choose('Typed by hand');
    await press('numbering-save');
    shown('You will type each number.');
    await press('numbering-confirm');
    expect(setDocumentNumbering).toHaveBeenLastCalledWith('grn', { scheme: 'free' });
  });

  it('switching the check on says how many existing numbers do not follow the rule (they are kept)', async () => {
    await mount();
    await press('numbering-row-dispatch');
    await user.press(screen.getByRole('switch'));
    await press('numbering-save');
    shown('40 existing documents keep their numbers.');
    shown('3 existing numbers do not follow this rule. They are kept.');
    await press('numbering-confirm');
    expect(setDocumentNumbering).toHaveBeenLastCalledWith('dispatch', { scheme: 'sequence', prefix: 'I', width: 4, start: 1, check: true });
  });

  it('shows a refusal in words, keeps the sheet open and sends nothing else', async () => {
    jest.mocked(setDocumentNumbering).mockRejectedValueOnce(new Error('The prefix can have up to 10 characters: capital letters, digits, / and -.'));
    await mount();
    await press('numbering-row-grn');
    await choose('Financial year');
    await press('numbering-save');
    await press('numbering-confirm');
    shown('The prefix can have up to 10 characters: capital letters, digits, / and -.');
    expect(screen.getByTestId('numbering-confirm')).toBeOnTheScreen();
    expect(showToast).not.toHaveBeenCalled();
    expect(getDocumentNumbering).toHaveBeenCalledTimes(1);
  });

  it('says so when the rule was already as chosen', async () => {
    jest.mocked(setDocumentNumbering).mockResolvedValueOnce({ changed: false, document_type: 'grn', existing_documents: 12, not_following: 0, next_number: 'A0013', hint: 'A####', reason: null });
    await mount();
    await press('numbering-row-grn');
    await type('numbering-field-perLetter', '500');
    await press('numbering-save');
    await press('numbering-confirm');
    expect(showToast).toHaveBeenCalledWith('The numbering is as it was.');
  });
});

describe('what the save tells the administrator', () => {
  it('counts the existing numbers that do not follow the new rule, which are kept', async () => {
    jest.mocked(setDocumentNumbering).mockResolvedValueOnce({
      changed: true, document_type: 'grn', existing_documents: 12, not_following: 5, next_number: 'GRN/26-27/0001', hint: 'GRN/26-27/####', reason: null,
    });
    await mount();
    await press('numbering-row-grn');
    await choose('Financial year');
    await press('numbering-save');
    await press('numbering-confirm');
    expect(showToast).toHaveBeenCalledWith('Numbering saved. The next number is GRN/26-27/0001. 5 existing numbers do not follow the rule. They are kept.');
  });

  it('says nothing about numbers outside the rule when there are none', async () => {
    await mount();
    await press('numbering-row-grn');
    await choose('Financial year');
    await press('numbering-save');
    await press('numbering-confirm');
    expect(showToast).toHaveBeenCalledWith('Numbering saved. The next number is GRN/26-27/0001.');
  });

  it('says on the confirm step that the next number continues after the numbers already issued', async () => {
    await mount();
    await press('numbering-row-grn');
    await choose('Financial year');
    await press('numbering-save');
    shown('New numbers look like 26-27/0001.');
    shown('The next number continues after the numbers already issued in this format.');
  });

  it('does not say it when no document of the type exists yet', async () => {
    jest.mocked(getDocumentNumbering).mockResolvedValue([rule({ existing_documents: 0 }), RULES[1], RULES[2]]);
    await mount();
    await press('numbering-row-grn');
    await choose('Financial year');
    await press('numbering-save');
    shown('New numbers look like 26-27/0001.');
    notShown('continues after');
  });
});

describe('leaving the edit sheet', () => {
  const closeButton = () => screen.getByRole('button', { name: 'Close' });
  const lastAlertButtons = () => jest.mocked(showAlert).mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>;

  it('closes at once when nothing was changed', async () => {
    await mount();
    await press('numbering-row-grn');
    await user.press(closeButton());
    expect(showAlert).not.toHaveBeenCalled();
    expect(screen.queryByTestId('numbering-save')).not.toBeOnTheScreen();
  });

  it('asks "Discard changes?" when something was changed, and keeps the sheet on Keep editing', async () => {
    await mount();
    await press('numbering-row-grn');
    await type('numbering-field-perLetter', '500');
    await user.press(closeButton());
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(jest.mocked(showAlert).mock.calls[0][0]).toBe('Discard changes?');
    expect(lastAlertButtons().map(button => button.text)).toEqual(['Keep editing', 'Discard']);
    expect(screen.getByTestId('numbering-save')).toBeOnTheScreen();
    expect(byId('numbering-field-perLetter')).toHaveDisplayValue('500');
  });

  it('closes the sheet and sends nothing when the changes are discarded', async () => {
    await mount();
    await press('numbering-row-grn');
    await type('numbering-field-perLetter', '500');
    await user.press(closeButton());
    await act(async () => { lastAlertButtons()[1].onPress?.(); }); // the dialog's own Discard button (the native alert is a stand-in)
    expect(screen.queryByTestId('numbering-save')).not.toBeOnTheScreen();
    expect(setDocumentNumbering).not.toHaveBeenCalled();
  });
});

describe('in Gujarati', () => {
  it('writes counts in Gujarati digits and keeps the numbers and patterns in 0-9', async () => {
    setLanguage('gu');
    await mount();
    const label = rowLabel('dispatch');
    expect(label).toContain('૩ હાલના નંબર નિયમ પ્રમાણે નથી');
    expect(label).toContain('I0001');
  });
});

describe.each(BRANDS.flatMap(brand => (['light', 'dark'] as Mode[]).map(mode => [brand, mode] as const)))('themes: %s %s', (brand, mode) => {
  it('paints the screen and the open sheet with the theme\'s colours', async () => {
    mockTheme = { preference: mode, brand };
    await mount();
    const tokens = getTokens(brand, mode);
    // Background and text colours of every drawn view: styles have no query, so the rendered tree is walked.
    const colours = () =>
      everyNode(node => typeof node.type === 'string' && !!node.props.style)
        .flatMap(node => [node.props.style].flat(Infinity).filter(Boolean).flatMap((style: Record<string, string>) => [style.backgroundColor, style.color]))
        .filter(Boolean)
        .map(colour => String(colour).toLowerCase());
    expect(colours()).toContain(tokens.background.grouped.toLowerCase());
    await press('numbering-row-grn');
    expect(colours()).toContain(tokens.surface.sheet.toLowerCase());
    shown('GRN numbers');
  });
});

describe('a save whose answer did not come through', () => {
  const UNCONFIRMED = "We couldn't confirm the change. Refresh to see the setting the server holds before you try again.";
  const toConfirm = async () => {
    await mount();
    await press('numbering-row-grn');
    await type('numbering-field-perLetter', '500');
    await press('numbering-save');
    jest.mocked(setDocumentNumbering).mockRejectedValueOnce(new NumberingUnconfirmedError(UNCONFIRMED));
    await press('numbering-confirm');

  };

  it('keeps the edit open with the values, the row on the previous setting, and offers Refresh and Try again', async () => {
    await toConfirm();
    shown(UNCONFIRMED);
    expect(screen.getByTestId('numbering-refresh')).toBeOnTheScreen();
    expect(screen.getByTestId('numbering-try-again')).toBeOnTheScreen();
    // The sheet did not close and nothing was said to be saved.
    expect(screen.getByTestId('numbering-confirm')).toBeOnTheScreen();
    expect(showToast).not.toHaveBeenCalled();
    expect(rowLabel('grn')).toContain('A0001');
  });

  it('Refresh: the server holds the rule that was sent, so it says "Saved." and closes', async () => {
    await toConfirm();
    jest.mocked(getDocumentNumbering).mockResolvedValue([rule({ per_letter: 500, updated_at: '2026-10-28T06:00:00Z' }), RULES[1], RULES[2]]);
    await press('numbering-refresh');
    expect(showToast).toHaveBeenCalledWith('Saved.');
    expect(screen.queryByTestId('numbering-confirm')).not.toBeOnTheScreen();
  });

  it('Refresh: the server holds another rule, so it says "Not saved." and the edit stays', async () => {
    await toConfirm();
    await press('numbering-refresh');
    shown('Not saved.');
    expect(showToast).not.toHaveBeenCalled();
    expect(screen.getByTestId('numbering-confirm')).toBeOnTheScreen();
    expect(screen.getByTestId('numbering-try-again')).toBeOnTheScreen();
  });

  it('reads the rows again from the server after the unconfirmed save, and after Refresh', async () => {
    await toConfirm();
    // The server holds the new rule although the answer was lost: the row must show it without leaving the screen.
    expect(getDocumentNumbering).toHaveBeenCalledTimes(2);
    jest.mocked(getDocumentNumbering).mockResolvedValue([rule({ prefix: 'Z', hint: 'ZA####', updated_at: '2026-10-28T06:00:00Z' }), RULES[1], RULES[2]]);
    await press('numbering-refresh');
    expect(getDocumentNumbering).toHaveBeenCalledTimes(4);
  });

  it('Try again sends the same rule again', async () => {
    await toConfirm();
    const first = jest.mocked(setDocumentNumbering).mock.calls[0];
    await press('numbering-try-again');
    expect(setDocumentNumbering).toHaveBeenCalledTimes(2);
    expect(jest.mocked(setDocumentNumbering).mock.calls[1]).toEqual(first);
    expect(showToast).toHaveBeenCalled();
  });
});

describe('pull to refresh', () => {
  it('reads the rules again', async () => {
    await mount();
    // The scroll view's pull-to-refresh has no name or role: it is the one carrying a refresh control.
    const control = everyNode(node => Boolean(node.props.refreshControl))[0];
    await act(async () => { control.props.refreshControl.props.onRefresh(); });
    expect(getDocumentNumbering).toHaveBeenCalledTimes(2);
  });
});

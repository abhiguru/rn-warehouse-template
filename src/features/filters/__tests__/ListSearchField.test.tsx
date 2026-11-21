import React from 'react';
import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { Keyboard, StyleSheet } from 'react-native';
import { radius, touchTarget } from '@/theme/tokens';
import { ListSearchField, SEARCH_DEBOUNCE_MS, rememberSearch } from '../components/ListSearchField';
import { TextEditor, TextRangeEditor } from '../components/editors/RangeEditors';
import { t } from '@/i18n';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');

type Json = NonNullable<ReturnType<typeof screen.toJSON>>;
type JsonNode = Extract<Json, { type: string }>;

/** The first node under `node` (itself included) that satisfies `test`. No query reaches a View by its style. */
function findJson(node: Json | string | null | undefined, test: (found: JsonNode) => boolean): JsonNode | undefined {
  if (!node || typeof node === 'string') return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findJson(child, test);
      if (hit) return hit;
    }
    return undefined;
  }
  if (test(node)) return node;
  for (const child of node.children ?? []) {
    const hit = findJson(child, test);
    if (hit) return hit;
  }
  return undefined;
}

describe('ListSearchField', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const setup = () => userEvent.setup({ delay: 0, advanceTimers: jest.advanceTimersByTime });
  const searchBox = () => screen.getByPlaceholderText('Search');

  /** Replaces the text of the box with `text`, then waits out the debounce. */
  const type = async (user: ReturnType<typeof setup>, text: string) => {
    await user.clear(searchBox());
    await user.paste(searchBox(), text);
    await act(() => {
      jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS + 10);
    });
  };

  // M4-18: one letter stays in the field but is not searched for.
  it('says that one letter is not searched for', async () => {
    const user = setup();
    const onSearch = jest.fn();
    await render(<ListSearchField listKey="grn-list" value="" onSearch={onSearch} placeholder="Search" />);
    expect(screen.queryByText(t('filters.search.minLength'))).toBeNull();

    await type(user, 'B');
    expect(onSearch).not.toHaveBeenCalled();
    expect(screen.getByText(t('filters.search.minLength'))).toBeOnTheScreen();

    await type(user, 'B9');
    expect(onSearch).toHaveBeenCalledWith('B9');
    expect(screen.queryByText(t('filters.search.minLength'))).toBeNull();
  });

  // X1-8: the server reads the first eight words of a search and drops the rest.
  it('says that words after the eighth are not searched for', async () => {
    const user = setup();
    const onSearch = jest.fn();
    await render(<ListSearchField listKey="grn-list" value="" onSearch={onSearch} placeholder="Search" />);

    await type(user, 'one two three four five six seven eight');
    expect(screen.queryByText(t('filters.search.tooManyWords'))).toBeNull();

    await type(user, 'one two three four five six seven eight nine');
    expect(screen.getByText(t('filters.search.tooManyWords'))).toBeOnTheScreen();
    expect(t('filters.search.tooManyWords')).toBe('Only the first eight words are searched.');
  });

  // M4-10: the server reads at most 120 characters of a search.
  it('takes no more text than the server reads', async () => {
    await render(<ListSearchField listKey="grn-list" value="" onSearch={jest.fn()} placeholder="Search" />);
    expect(searchBox()).toHaveProp('maxLength', 120);
  });

  // The clear button empties the field and the search, and puts the keyboard away.
  it('clears the text and the search and dismisses the keyboard once when the clear button is pressed', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
    try {
      const user = setup();
      const onSearch = jest.fn();
      await render(<ListSearchField listKey="clear-test" value="" onSearch={onSearch} placeholder="Search" />);
      await type(user, 'garlic');
      expect(searchBox()).toHaveDisplayValue('garlic');
      expect(onSearch).toHaveBeenLastCalledWith('garlic');
      expect(dismiss).not.toHaveBeenCalled();

      await user.press(screen.getByRole('button', { name: t('common.clearSearch') }));
      expect(dismiss).toHaveBeenCalledTimes(1);
      expect(searchBox()).toHaveDisplayValue('');
      expect(onSearch).toHaveBeenLastCalledWith('');
      // Nothing to clear any more: the button is gone.
      expect(screen.queryByRole('button', { name: t('common.clearSearch') })).toBeNull();
    } finally {
      dismiss.mockRestore();
    }
  });

  // §11.2: a recent search is a whole touch target, its 32 high pill drawn inside; no hitSlop.
  it('offers each recent search as a whole touch target, and searches it again', async () => {
    const user = setup();
    rememberSearch('recent-target-test', 'garlic');
    const onSearch = jest.fn();
    await render(<ListSearchField listKey="recent-target-test" value="" onSearch={onSearch} placeholder="Search" />);
    // A press does not focus a TextInput in the test renderer.
    await fireEvent(searchBox(), 'focus', {});
    const name = t('filters.search.searchAgain', { text: 'garlic' });
    const chip = screen.getByRole('button', { name });
    expect(StyleSheet.flatten(chip.props.style).minHeight).toBe(touchTarget);
    expect(chip.props.hitSlop).toBeUndefined();
    const chipJson = findJson(screen.toJSON(), node => node.props.accessibilityLabel === name);
    const pill = findJson(chipJson, node => node.type === 'View' && StyleSheet.flatten(node.props.style)?.borderRadius === radius.pill);
    expect(StyleSheet.flatten(pill!.props.style).minHeight).toBe(32);
    await user.press(chip);
    expect(onSearch).toHaveBeenCalledWith('garlic');
  });
});

describe('filter text boxes', () => {
  // M4-6: document numbers are stored in capitals.
  it('a document-number range box holds capitals and 0-9', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup({ delay: 0 });
    await render(<TextRangeEditor label="GRN no." value={undefined} onChange={onChange} />);
    await user.paste(screen.getAllByPlaceholderText(t('common.any'))[0], 'a૦૦૧૦');
    expect(onChange).toHaveBeenCalledWith({ from: 'A0010', to: undefined });
  });

  // M4-8: ૦-૯ typed into Package or GRN number matched nothing.
  it('a text box holds 0-9 whatever digits were typed', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup({ delay: 0 });
    await render(<TextEditor label="Package" value={undefined} onChange={onChange} />);
    await user.paste(screen.getByLabelText('Package'), 'red ૧૨');
    expect(onChange).toHaveBeenCalledWith('red 12');
  });
});

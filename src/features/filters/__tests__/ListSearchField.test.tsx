import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { StyleSheet, TextInput } from 'react-native';
import { radius, touchTarget } from '@/theme/tokens';
import { ListSearchField, SEARCH_DEBOUNCE_MS, rememberSearch } from '../components/ListSearchField';
import { TextEditor, TextRangeEditor } from '../components/editors/RangeEditors';
import { t } from '@/i18n';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');

const texts = (renderer: TestRenderer.ReactTestRenderer) =>
  renderer.root.findAll(node => (node.type as unknown) === 'Text').map(node => [].concat(node.props.children).join(''));

function render(element: React.ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  return renderer;
}

describe('ListSearchField', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const type = (renderer: TestRenderer.ReactTestRenderer, text: string) => {
    act(() => renderer.root.findByType(TextInput).props.onChangeText(text));
    act(() => {
      jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS + 10);
    });
  };

  // M4-18: one letter stays in the field but is not searched for.
  it('says that one letter is not searched for', () => {
    const onSearch = jest.fn();
    const renderer = render(<ListSearchField listKey="grn-list" value="" onSearch={onSearch} placeholder="Search" />);
    expect(texts(renderer)).not.toContain(t('filters.search.minLength'));

    type(renderer, 'B');
    expect(onSearch).not.toHaveBeenCalled();
    expect(texts(renderer)).toContain(t('filters.search.minLength'));

    type(renderer, 'B9');
    expect(onSearch).toHaveBeenCalledWith('B9');
    expect(texts(renderer)).not.toContain(t('filters.search.minLength'));
  });

  // X1-8: the server reads the first eight words of a search and drops the rest.
  it('says that words after the eighth are not searched for', () => {
    const onSearch = jest.fn();
    const renderer = render(<ListSearchField listKey="grn-list" value="" onSearch={onSearch} placeholder="Search" />);

    type(renderer, 'one two three four five six seven eight');
    expect(texts(renderer)).not.toContain(t('filters.search.tooManyWords'));

    type(renderer, 'one two three four five six seven eight nine');
    expect(texts(renderer)).toContain(t('filters.search.tooManyWords'));
    expect(t('filters.search.tooManyWords')).toBe('Only the first eight words are searched.');
  });

  // M4-10: the server reads at most 120 characters of a search.
  it('takes no more text than the server reads', () => {
    const renderer = render(<ListSearchField listKey="grn-list" value="" onSearch={jest.fn()} placeholder="Search" />);
    expect(renderer.root.findByType(TextInput).props.maxLength).toBe(120);
  });

  // §11.2: a recent search is a whole touch target, its 32 high pill drawn inside; no hitSlop.
  it('offers each recent search as a whole touch target, and searches it again', () => {
    rememberSearch('recent-target-test', 'garlic');
    const onSearch = jest.fn();
    const renderer = render(<ListSearchField listKey="recent-target-test" value="" onSearch={onSearch} placeholder="Search" />);
    act(() => renderer.root.findByType(TextInput).props.onFocus());
    const chip = renderer.root.find(
      node => typeof node.type !== 'string' && node.props.accessibilityLabel === t('filters.search.searchAgain', { text: 'garlic' }) && typeof node.props.onPress === 'function'
    );
    expect(StyleSheet.flatten(chip.props.style).minHeight).toBe(touchTarget);
    expect(chip.props.hitSlop).toBeUndefined();
    const pill = chip.findAll(node => (node.type as unknown) === 'View' && StyleSheet.flatten(node.props.style)?.borderRadius === radius.pill);
    expect(StyleSheet.flatten(pill[0].props.style).minHeight).toBe(32);
    act(() => chip.props.onPress());
    expect(onSearch).toHaveBeenCalledWith('garlic');
  });
});

describe('filter text boxes', () => {
  // M4-6: document numbers are stored in capitals.
  it('a document-number range box holds capitals and 0-9', () => {
    const onChange = jest.fn();
    const renderer = render(<TextRangeEditor label="GRN no." value={undefined} onChange={onChange} />);
    act(() => renderer.root.findAllByType(TextInput)[0].props.onChangeText('a૦૦૧૦'));
    expect(onChange).toHaveBeenCalledWith({ from: 'A0010', to: undefined });
  });

  // M4-8: ૦-૯ typed into Package or GRN number matched nothing.
  it('a text box holds 0-9 whatever digits were typed', () => {
    const onChange = jest.fn();
    const renderer = render(<TextEditor label="Package" value={undefined} onChange={onChange} />);
    act(() => renderer.root.findByType(TextInput).props.onChangeText('red ૧૨'));
    expect(onChange).toHaveBeenCalledWith('red 12');
  });
});

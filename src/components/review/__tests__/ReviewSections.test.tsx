/**
 * The shared Review sections (style guide §14.3): the toggle, the label, the closed line, the kept-mounted body, the
 * Edit pencil, one section open at a time, Reduce Motion, the key-values at large text, and all four themes.
 */
import React from 'react';
import { Dimensions, LayoutAnimation, StyleSheet, Text, View } from 'react-native';
import { act, render as rtlRender, screen, userEvent, within } from '@testing-library/react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { BRANDS, getTokens, touchTarget, type Brand, type Mode } from '@/theme/tokens';
import { ReviewCard, ReviewKeyBlock, ReviewKeyValue, ReviewKeyValues, ReviewSection, useReviewSections } from '../ReviewSections';

let mockState: { theme: { preference: string; brand: string } } = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: jest.fn(() => false),
}));

afterEach(() => {
  jest.restoreAllMocks();
  (useReducedMotion as jest.Mock).mockReturnValue(false);
  Dimensions.set({ window: { width: 392, height: 850, scale: 2.75, fontScale: 1 } });
});

async function renderIn(brand: Brand, mode: Mode, element: React.ReactElement) {
  mockState = { theme: { preference: mode, brand } };
  return rtlRender(element);
}
const render = (element: React.ReactElement) => renderIn('orange', 'light', element);
const HIDDEN = { includeHiddenElements: true } as const;
const flat = (style: unknown) => StyleSheet.flatten(style as never) ?? {};

function Demo({ initial = 'a' as 'a' | 'b' | null }: { initial?: 'a' | 'b' | null }) {
  const { open, toggle } = useReviewSections<'a' | 'b'>(initial);
  return (
    <ReviewCard testID="demo-card">
      <ReviewSection id="a" testIDPrefix="demo" title="Alpha" count={3} closedLine="A summary" open={open === 'a'} onToggle={toggle as (id: string) => void} first>
        <Text>Alpha body</Text>
      </ReviewSection>
      <ReviewSection id="b" testIDPrefix="demo" title="Beta" closedLine="B summary" onEdit={jest.fn()} editLabel="Edit beta" open={open === 'b'} onToggle={toggle as (id: string) => void}>
        <Text>Beta body</Text>
      </ReviewSection>
    </ReviewCard>
  );
}

describe('ReviewSection', () => {
  it('is a button with its expanded state, and tapping it opens one and closes the other', async () => {
    const user = userEvent.setup({ delay: 0 });
    await render(<Demo />);
    // The toggle's name carries the closed line only while the section is closed.
    expect(screen.getByRole('button', { name: 'Alpha, 3' })).toBeExpanded();
    expect(screen.getByRole('button', { name: 'Beta, B summary' })).toBeCollapsed();
    await user.press(screen.getByRole('button', { name: 'Beta, B summary' }));
    expect(screen.getByRole('button', { name: 'Alpha, 3, A summary' })).toBeCollapsed();
    expect(screen.getByRole('button', { name: 'Beta' })).toBeExpanded();
    await user.press(screen.getByRole('button', { name: 'Beta' }));
    expect(screen.getByRole('button', { name: 'Beta, B summary' })).toBeCollapsed();
  });

  it('labels the toggle with the title, the count, the tag and the closed line', async () => {
    await render(
      <ReviewSection id="r" testIDPrefix="x" title="Rates" count={2} tag="1 without a rate" closedLine="All priced" open={false} onToggle={jest.fn()}>
        <Text>body</Text>
      </ReviewSection>,
    );
    expect(screen.getByRole('button', { name: 'Rates, 2, 1 without a rate, All priced' })).toBeOnTheScreen();
    expect(screen.getByText('RATES (2)', HIDDEN)).toBeOnTheScreen();
    expect(screen.getByText('1 without a rate', HIDDEN)).toBeOnTheScreen();
  });

  it('shows the closed line only while the section is closed', async () => {
    const user = userEvent.setup({ delay: 0 });
    await render(<Demo />);
    expect(screen.queryByText('A summary', HIDDEN)).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Alpha, 3' })).toBeOnTheScreen();
    expect(screen.getByText('B summary', HIDDEN)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Alpha, 3' }));
    expect(screen.getByText('A summary', HIDDEN)).toBeOnTheScreen();
  });

  it('keeps a closed body mounted but hidden', async () => {
    await render(<Demo />);
    // Mounted (found when hidden elements count) but not visible: display none.
    expect(screen.queryByText('Beta body')).not.toBeOnTheScreen();
    expect(screen.getByText('Beta body', HIDDEN)).not.toBeVisible();
    expect(screen.getByText('Alpha body')).toBeVisible();
  });

  it('draws Edit as its own icon-only target beside the toggle, not inside it', async () => {
    await render(<Demo />);
    const edit = screen.getByRole('button', { name: 'Edit beta' });
    expect(edit).toHaveStyle({ width: touchTarget, height: touchTarget });
    expect(within(edit).queryAllByText(/./, HIDDEN)).toEqual([]);
    // Only the second section has one.
    expect(screen.getAllByRole('button', { name: /^Edit/ })).toHaveLength(1);
    // Edit is not a child of the toggle, so a tap on it never reaches the toggle.
    expect(within(screen.getByRole('button', { name: 'Beta, B summary' })).queryByRole('button', { name: 'Edit beta' })).not.toBeOnTheScreen();
  });
});

describe('useReviewSections', () => {
  const Probe = React.forwardRef<{ api: ReturnType<typeof useReviewSections<'a' | 'b'>> }>((_p, ref) => {
    const api = useReviewSections<'a' | 'b'>('a');
    React.useImperativeHandle(ref, () => ({ api }));
    return null;
  });
  Probe.displayName = 'Probe';

  it('keeps one section open: toggle swaps or closes, show only opens', async () => {
    const ref = React.createRef<{ api: ReturnType<typeof useReviewSections<'a' | 'b'>> }>();
    await render(<Probe ref={ref} />);
    expect(ref.current!.api.open).toBe('a');
    await act(() => ref.current!.api.toggle('b'));
    expect(ref.current!.api.open).toBe('b');
    await act(() => ref.current!.api.show('b'));
    expect(ref.current!.api.open).toBe('b');
    await act(() => ref.current!.api.toggle('b'));
    expect(ref.current!.api.open).toBeNull();
    await act(() => ref.current!.api.show('a'));
    expect(ref.current!.api.open).toBe('a');
  });

  it('animates a change as an expanding section, and not under Reduce Motion', async () => {
    const user = userEvent.setup({ delay: 0 });
    const configure = jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => undefined);
    const first = await render(<Demo />);
    await user.press(screen.getByRole('button', { name: 'Beta, B summary' }));
    expect(configure).toHaveBeenCalledTimes(1);
    expect(configure.mock.calls[0][0]).toMatchObject({ duration: 200 });
    await first.unmount();

    configure.mockClear();
    (useReducedMotion as jest.Mock).mockReturnValue(true);
    await render(<Demo />);
    await user.press(screen.getByRole('button', { name: 'Beta, B summary' }));
    expect(screen.getByRole('button', { name: 'Beta' })).toBeExpanded();
    expect(configure).not.toHaveBeenCalled();
  });
});

describe('ReviewKeyValue', () => {
  const rows = (
    <ReviewKeyValues>
      <ReviewKeyValue label="Customer" value="Fictional Traders" first />
      <ReviewKeyValue label="Date" value="9 Oct 2026" emphasized />
    </ReviewKeyValues>
  );

  it('puts the label and the value side by side at font scale 1 and speaks both', async () => {
    Dimensions.set({ window: { width: 392, height: 850, scale: 2.75, fontScale: 1 } });
    await render(rows);
    // Found by its spoken label: both the label and the value are in it.
    expect(screen.getByLabelText('Customer, Fictional Traders')).toHaveStyle({ flexDirection: 'row' });
  });

  it('stacks the label over the value from font scale 1.5', async () => {
    Dimensions.set({ window: { width: 392, height: 850, scale: 2.75, fontScale: 1.5 } });
    await render(rows);
    expect(screen.getByLabelText('Customer, Fictional Traders')).toHaveStyle({ flexDirection: 'column' });
    expect(screen.getByText('Fictional Traders')).toHaveStyle({ textAlign: 'left' });
  });

  it('takes a node as the value, without an invented spoken label', async () => {
    await render(<ReviewKeyValue label="Leon" value={<View testID="tag" />} />);
    expect(screen.getByText('Leon')).toBeOnTheScreen();
    // No spoken label of the form "Leon, ...", and the row is still one accessible element.
    expect(screen.queryByLabelText(/Leon/)).not.toBeOnTheScreen();
    expect(screen.getByTestId('tag').parent!.props.accessible).toBe(true);
  });
});

describe.each(BRANDS.flatMap((brand) => (['light', 'dark'] as Mode[]).map((mode) => [brand, mode] as const)))('%s %s', (brand, mode) => {
  it('draws the card, the open fill, the divider and the title in the theme', async () => {
    const t = getTokens(brand, mode);
    await renderIn(brand, mode, <Demo />);
    expect(screen.getByTestId('demo-card')).toHaveStyle({ backgroundColor: t.surface.card, borderColor: t.table.outline });
    // The open section (Alpha) is filled; its body sits inside that fill.
    let open = screen.getByTestId('demo-body-a').parent!;
    while (open.parent && flat(open.props.style).backgroundColor !== t.table.insetFill) open = open.parent;
    expect(flat(open.props.style).backgroundColor).toBe(t.table.insetFill);
    let second = screen.getByTestId('demo-body-b', HIDDEN).parent!;
    while (second.parent && flat(second.props.style).borderTopWidth === undefined) second = second.parent;
    expect(flat(second.props.style)).toMatchObject({ borderTopColor: t.table.separator, borderTopWidth: 1 });
    expect(screen.getByText('ALPHA (3)', HIDDEN)).toHaveStyle({ color: t.text.primary });
  });
});

describe('ReviewKeyBlock', () => {
  const NOTE = 'Deliver after 6 pm to the side gate. Call the supervisor before unloading.';

  it.each([[1], [1.5]])('puts the label above the value, left-aligned, at font scale %s', async (fontScale) => {
    Dimensions.set({ window: { width: 392, height: 850, scale: 2.75, fontScale } });
    await render(
      <ReviewKeyValues>
        <ReviewKeyValue label="Date" value="9 Oct 2026" first />
        <ReviewKeyBlock label="Notes" value={NOTE} />
      </ReviewKeyValues>,
    );
    const block = screen.getByLabelText(`Notes, ${NOTE}`);
    expect(block).toHaveTextContent(`Notes${NOTE}`);
    expect(flat(block.props.style).flexDirection).toBeUndefined();
    expect(within(block).getByText(NOTE)).toHaveStyle({ textAlign: 'left' });
    // The plain key-value beside it is right-aligned at font scale 1 (and only stacks from 1.5).
    expect(screen.getByText('9 Oct 2026')).toHaveStyle({ textAlign: fontScale >= 1.5 ? 'left' : 'right' });
  });

  it('has a divider above it unless it is first', async () => {
    await render(
      <ReviewKeyValues>
        <ReviewKeyBlock label="Notes" value="One" first />
        <ReviewKeyBlock label="Address" value="Two" />
      </ReviewKeyValues>,
    );
    const borderTop = (label: string) => flat(screen.getByLabelText(new RegExp(`^${label}`)).props.style).borderTopWidth;
    expect(borderTop('Notes')).toBeUndefined();
    expect(borderTop('Address')).toBeGreaterThan(0);
  });
});

describe('dates read aloud', () => {
  it('a screen reader gets the spoken closed line and the spoken value, the screen keeps the written date', async () => {
    await render(
      <ReviewCard>
        <ReviewSection id="a" testIDPrefix="demo" title="Alpha" closedLine="I0042 · 01/10/26" spokenClosedLine="I0042 · 1 Oct 2026" open={false} onToggle={jest.fn()} first>
          <ReviewKeyValues>
            <ReviewKeyValue label="Date" value="01/10/26" spokenValue="1 Oct 2026" />
          </ReviewKeyValues>
        </ReviewSection>
      </ReviewCard>,
    );
    expect(screen.getByRole('button', { name: 'Alpha, I0042 · 1 Oct 2026' })).toBeOnTheScreen();
    expect(screen.getByText('I0042 · 01/10/26', HIDDEN)).toBeOnTheScreen();
    expect(screen.getByText('01/10/26', HIDDEN)).toBeOnTheScreen();
    expect(screen.getByLabelText('Date, 1 Oct 2026', HIDDEN)).toBeOnTheScreen();
  });
});

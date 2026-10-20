import React from 'react';
import { Alert } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { AlertHost } from '../AlertHost';
import { resetAlertQueueForTests, showAlert } from '@/utils/alert';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';

let mockTheme = { preference: 'light', brand: 'orange' };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (sel: (s: unknown) => unknown) => sel({ theme: mockTheme }),
}));

function texts(tree: ReactTestRenderer) {
  return tree.root.findAll(n => (n.type as unknown) === 'Text').map(n => [].concat(n.props.children).join(''));
}
// A dialog takes no press in its first 250 ms (a double tap on the dialog before it): the clock is moved past that.
function settle() {
  act(() => { jest.advanceTimersByTime(300); });
}
function press(tree: ReactTestRenderer, label: string) {
  settle();
  const button = tree.root.find(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
  act(() => button.props.onPress());
}

describe('showAlert with AlertHost', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('falls back to Alert.alert when no host is mounted', () => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    showAlert('Title', 'Message');
    expect(spy).toHaveBeenLastCalledWith('Title', 'Message');
    spy.mockRestore();
  });

  describe.each(BRANDS.flatMap(b => (['light', 'dark'] as Mode[]).map(m => [b, m] as const)))('%s %s', (brand, mode) => {
    it('renders the dialog with token colours and runs the pressed handler', () => {
      mockTheme = { preference: mode, brand };
      const t = getTokens(brand, mode);
      const onDelete = jest.fn();
      let tree!: ReactTestRenderer;
      act(() => { tree = create(<AlertHost />); });
      act(() => showAlert('Delete GRN 311?', 'Its items will be removed from stock.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete GRN', style: 'destructive', onPress: onDelete },
      ]));
      expect(texts(tree)).toEqual(expect.arrayContaining(['Delete GRN 311?', 'Cancel', 'Delete GRN']));
      const flat = tree.root.findAll(n => {
        const s = [].concat(n.props.style ?? []).flat(3).filter(Boolean) as Array<{ backgroundColor?: string }>;
        return s.some(x => x && x.backgroundColor === t.surface.sheet);
      });
      expect(flat.length).toBeGreaterThan(0);
      press(tree, 'Delete GRN');
      act(() => { jest.runAllTimers(); });
      expect(onDelete).toHaveBeenCalledTimes(1);
      expect(texts(tree)).not.toContain('Delete GRN 311?');
      act(() => tree.unmount());
    });
  });

  it('cancels with the cancel button handler on scrim press', () => {
    const onCancel = jest.fn();
    let tree!: ReactTestRenderer;
    act(() => { tree = create(<AlertHost />); });
    act(() => showAlert('Discard this GRN?', undefined, [
      { text: 'Keep editing', style: 'cancel', onPress: onCancel },
      { text: 'Discard GRN', style: 'destructive' },
    ]));
    press(tree, 'Close dialog');
    act(() => { jest.runAllTimers(); });
    expect(onCancel).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });
});

// Review 2026-10-20 (contract item 10, and I7): a second press of a dialog that is closing runs nothing.
describe('a double press', () => {
  beforeEach(() => { jest.useFakeTimers(); resetAlertQueueForTests(); });
  afterEach(() => { jest.useRealTimers(); resetAlertQueueForTests(); });

  it('runs the pressed button handler once when the same dialog is pressed twice before it is gone', () => {
    const onDelete = jest.fn();
    let tree!: ReactTestRenderer;
    act(() => { tree = create(<AlertHost />); });
    act(() => showAlert('Delete invoice 7?', 'It will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]));
    settle();
    const button = tree.root.find(n => n.props.accessibilityLabel === 'Delete' && typeof n.props.onPress === 'function');
    act(() => { button.props.onPress(); button.props.onPress(); });
    act(() => { jest.runAllTimers(); });
    expect(onDelete).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  it('runs the cancel handler and onDismiss once when the scrim is pressed twice', () => {
    const onCancel = jest.fn();
    const onDismiss = jest.fn();
    let tree!: ReactTestRenderer;
    act(() => { tree = create(<AlertHost />); });
    act(() => showAlert('Discard this GRN?', undefined, [
      { text: 'Keep editing', style: 'cancel', onPress: onCancel },
      { text: 'Discard GRN', style: 'destructive' },
    ], { cancelable: true, onDismiss }));
    settle();
    const scrim = tree.root.find(n => n.props.accessibilityLabel === 'Close dialog' && typeof n.props.onPress === 'function');
    act(() => { scrim.props.onPress(); scrim.props.onPress(); });
    act(() => { jest.runAllTimers(); });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  it('shows a question that was tapped twice once: the dialog is gone after one press and the handler ran once', () => {
    const onDelete = jest.fn();
    let tree!: ReactTestRenderer;
    act(() => { tree = create(<AlertHost />); });
    const ask = () => showAlert('Delete invoice 7?', 'It will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]);
    act(() => { ask(); ask(); });
    press(tree, 'Delete');
    act(() => { jest.runAllTimers(); });
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(texts(tree)).not.toContain('Delete invoice 7?');
    act(() => tree.unmount());
  });
});


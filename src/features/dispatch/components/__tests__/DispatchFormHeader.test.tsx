import React from 'react';
import { Alert } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import { DispatchFormHeader } from '../DispatchFormHeader';

let mockState: { theme: { preference: string; brand: string } } = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const MODES: Mode[] = ['light', 'dark'];

function flatStyle(style: unknown): Record<string, unknown> {
  return Object.assign({}, ...([] as unknown[]).concat(style ?? []).flat(Infinity).filter(Boolean));
}

describe('DispatchFormHeader', () => {
  describe.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))('%s %s', (brand, mode) => {
    it('renders on surface.header with a header title and labelled cancel button', () => {
      mockState = { theme: { preference: mode, brand } };
      const t = getTokens(brand, mode);
      const onCancel = jest.fn();
      let tree!: ReactTestRenderer;
      act(() => {
        tree = create(
          <DispatchFormHeader
            title="Create dispatch"
            onCancel={onCancel}
            confirmCancel={false}
            rightAction={{ icon: 'checkmark', label: 'Save', onPress: jest.fn() }}
          />
        );
      });

      const container = tree.root.findAll(n => flatStyle(n.props.style).backgroundColor === t.surface.header);
      expect(container.length).toBeGreaterThan(0);

      const title = tree.root.find(n => n.props.accessibilityRole === 'header');
      expect([].concat(title.props.children).join('')).toBe('Create dispatch');

      const cancel = tree.root.find(n => n.props.accessibilityLabel === 'Cancel dispatch' && typeof n.props.onPress === 'function');
      act(() => cancel.props.onPress());
      expect(onCancel).toHaveBeenCalledTimes(1);
      act(() => tree.unmount());
    });
  });

  it('asks before discarding when confirmCancel is on', () => {
    mockState = { theme: { preference: 'light', brand: 'orange' } };
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<DispatchFormHeader title="Create dispatch" onCancel={jest.fn()} />);
    });
    const cancel = tree.root.find(n => n.props.accessibilityLabel === 'Cancel dispatch' && typeof n.props.onPress === 'function');
    act(() => cancel.props.onPress());
    expect(alertSpy).toHaveBeenCalledWith(
      'Discard this dispatch?',
      expect.any(String),
      expect.arrayContaining([expect.objectContaining({ text: 'Discard dispatch' })]),
      expect.anything()
    );
    alertSpy.mockRestore();
    act(() => tree.unmount());
  });
});

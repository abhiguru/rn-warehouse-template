/** RateSaveBar: content above the buttons, Discard beside Save, collapsed to the buttons, its height reported. */
import React from 'react';
import { Text, View } from 'react-native';
import { act, create } from 'react-test-renderer';
import { Button } from '@/components/ui/Button';
import { RateSaveBar } from '../components/RateSaveBar';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');

const render = (element: React.ReactElement) => {
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(element); });
  return tree;
};
const buttons = (tree: ReturnType<typeof create>) => tree.root.findAllByType(Button).map(b => String(b.props.children));
const texts = (tree: ReturnType<typeof create>) => tree.root.findAllByType(Text).map(n => [n.props.children].flat(Infinity).join(''));

it('shows the note, the hint and a full-width Save; Save is disabled and busy as told', () => {
  const onPress = jest.fn();
  const tree = render(
    <RateSaveBar helper="You are offline." primary={{ label: 'Save rate', onPress, disabled: true, loading: true, loadingText: 'Saving' }}>
      <Text>Starts on 1 Jan 2027</Text>
    </RateSaveBar>
  );
  expect(buttons(tree)).toEqual(['Save rate']);
  expect(texts(tree)).toEqual(expect.arrayContaining(['Starts on 1 Jan 2027', 'You are offline.']));
  const save = tree.root.findByType(Button);
  expect(save.props).toMatchObject({ disabled: true, loading: true, loadingText: 'Saving', size: 'fullWidth' });
});

it('puts Discard before Save, and collapsed keeps the two buttons but drops the content', () => {
  const discard = jest.fn();
  const save = jest.fn();
  const element = (collapsed: boolean) => (
    <RateSaveBar helper="hint" primary={{ label: 'Save', onPress: save }} discard={{ label: 'Discard', onPress: discard }} collapsed={collapsed}>
      <Text>Summary line</Text>
    </RateSaveBar>
  );
  const tree = render(element(false));
  expect(buttons(tree)).toEqual(['Discard', 'Save']);
  expect(texts(tree)).toEqual(expect.arrayContaining(['Summary line', 'hint']));

  act(() => tree.update(element(true)));
  expect(buttons(tree)).toEqual(['Discard', 'Save']);
  expect(texts(tree)).not.toContain('Summary line');
  expect(texts(tree)).not.toContain('hint');

  act(() => tree.root.findAllByType(Button)[0].props.onPress());
  expect(discard).toHaveBeenCalledTimes(1);
  expect(save).not.toHaveBeenCalled();
});

it('reports its measured height on every layout', () => {
  const onHeight = jest.fn();
  const tree = render(<RateSaveBar primary={{ label: 'Save', onPress: jest.fn() }} onHeight={onHeight} />);
  const bar = tree.root.findAllByType(View).find(v => v.props.testID === 'save-bar')!;
  act(() => bar.props.onLayout({ nativeEvent: { layout: { height: 96 } } }));
  expect(onHeight).toHaveBeenCalledWith(96);
});

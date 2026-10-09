import React from 'react';
import { act, create } from 'react-test-renderer';
import { GhostTextInput } from '../GhostTextInput';

jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/hooks/useListColors', () => ({ useListColors: () => require('@/theme/listColors').listColors }));

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const suggestionButtons = (tree: ReturnType<typeof create>) =>
  tree.root.findAll(node => typeof node.props.accessibilityLabel === 'string' &&
    node.props.accessibilityLabel.startsWith('Use suggestion') && typeof node.props.onPress === 'function');

// testvm2 known issue 5: an empty dispatch form showed a registration from an
// earlier session's dispatch as if it had been typed into the field.
it('shows no suggestion in an empty field and completes what the user types', async () => {
  const getSuggestion = jest.fn(async () => 'GJ01TEST0001');
  const onChangeText = jest.fn();
  const props = { getSuggestion, onChangeText, suggestionContext: 'customer-a', placeholder: 'Vehicle registration', debounceMs: 100 };
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<GhostTextInput {...props} value="" />); });
  await act(async () => { jest.advanceTimersByTime(200); });
  expect(getSuggestion).not.toHaveBeenCalled();
  expect(suggestionButtons(tree)).toHaveLength(0);
  expect(JSON.stringify(tree.toJSON())).not.toContain('GJ01TEST0001');

  await act(async () => { tree.update(<GhostTextInput {...props} value="GJ" />); });
  await act(async () => { jest.advanceTimersByTime(200); });
  expect(getSuggestion).toHaveBeenLastCalledWith('GJ', 'customer-a');
  const [accept] = suggestionButtons(tree);
  expect(accept).toBeDefined();
  await act(async () => { accept.props.onPress(); });
  expect(onChangeText).toHaveBeenCalledWith('GJ01TEST0001');

  await act(async () => { tree.update(<GhostTextInput {...props} value="" />); });
  await act(async () => { jest.advanceTimersByTime(200); });
  expect(suggestionButtons(tree)).toHaveLength(0);
  await act(async () => { tree.unmount(); });
});

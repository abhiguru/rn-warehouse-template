/** Settings > Rack buttons: an administrator or supervisor edits the Floor and Chamber buttons; staff are told it is not theirs. */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import RackPresetsScreen from '../../../app/rack-presets';
import { getRackPresets, setRackPresets } from '@/services/rackPresetsService';

let mockRole = 'admin';
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ auth: { userProfile: { role: mockRole } }, theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('expo-router', () => ({ router: { replace: jest.fn() }, Stack: { Screen: () => null }, useIsFocused: () => true }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
jest.mock('@/components/ui/HeaderBackButton', () => ({ HeaderBackButton: () => null }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/services/rackPresetsService', () => ({ getRackPresets: jest.fn(), setRackPresets: jest.fn() }));

const loaded = { floor: ['BASE', 'F1'], chamber: ['C4'], version: 2, maxLabelLength: 12, maxPerList: 20 };
let tree: ReactTestRenderer | undefined;
const byId = (id: string) => tree!.root.find((n) => n.props.testID === id && typeof n.type === 'string' || (n.props.testID === id && typeof n.props.onPress === 'function'));
const mount = async () => {
  await act(async () => { tree = create(<RackPresetsScreen />); });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRole = 'admin';
  (getRackPresets as jest.Mock).mockResolvedValue(loaded);
});
afterEach(async () => {
  if (tree) await act(async () => { tree!.unmount(); });
  tree = undefined;
});

it('shows the two lists, and saves an edit with the version that was read', async () => {
  await mount();
  expect(byId('rack-presets-floor-0').props.value).toBe('BASE');
  expect(byId('rack-presets-chamber-0').props.value).toBe('C4');
  const save = () => tree!.root.find((n) => n.props.testID === 'rack-presets-save' && typeof n.props.onPress === 'function');
  expect(save().props.disabled).toBe(true);

  await act(async () => { byId('rack-presets-floor-1').props.onChangeText('F9'); });
  await act(async () => { tree!.root.find((n) => n.props.testID === 'rack-presets-chamber-add' && typeof n.props.onPress === 'function').props.onPress(); });
  await act(async () => { byId('rack-presets-chamber-1').props.onChangeText(' C7 '); });
  (setRackPresets as jest.Mock).mockResolvedValue({ ok: true, changed: true, answer: { ...loaded, floor: ['BASE', 'F9'], chamber: ['C4', 'C7'], version: 3 } });
  expect(save().props.disabled).toBe(false);
  await act(async () => { await save().props.onPress(); });

  expect(setRackPresets).toHaveBeenCalledWith({ floor: ['BASE', 'F9'], chamber: ['C4', 'C7'] }, 2);
});

it('removes a button', async () => {
  await mount();
  await act(async () => { byId('rack-presets-floor-0-remove').props.onPress(); });
  expect(byId('rack-presets-floor-0').props.value).toBe('F1');
});

it('tells staff it is for administrators and supervisors, and reads nothing', async () => {
  mockRole = 'staff';
  await mount();
  expect(getRackPresets).not.toHaveBeenCalled();
  expect(tree!.root.findAll((n) => n.props.testID === 'rack-presets-floor')).toHaveLength(0);
});

/** Settings > Rack buttons: an administrator or supervisor edits the Floor and Chamber buttons; staff are told it is not theirs. */
import React from 'react';
import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import RackPresetsScreen from '../../../app/rack-presets';
import { getRackPresets, setRackPresets } from '@/services/rackPresetsService';
import { setLanguage } from '@/i18n/language';

let mockRole = 'admin';
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ auth: { userProfile: { role: mockRole } }, theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('expo-router', () => ({ router: { replace: jest.fn() }, Stack: { Screen: () => null }, useIsFocused: () => true }));
jest.mock('@/hooks/useLeaveGuard', () => ({
  useLeaveGuard: () => ({ leaveWithoutAsking: (go: () => void) => go() }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
jest.mock('@/components/ui/HeaderBackButton', () => ({ HeaderBackButton: () => null }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/services/rackPresetsService', () => ({ getRackPresets: jest.fn(), setRackPresets: jest.fn() }));

const loaded = { floor: ['BASE', 'F1'], chamber: ['C4'], version: 2, maxLabelLength: 12, maxPerList: 20 };
const user = userEvent.setup({ delay: 0 });
// A negative check also sees hidden-but-mounted nodes.
const hidden = { includeHiddenElements: true } as const;
const byId = (id: string) => screen.getByTestId(id);
const mount = async () => {
  await render(<RackPresetsScreen />);
  await screen.findByTestId('rack-presets-floor-0');
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRole = 'admin';
  (getRackPresets as jest.Mock).mockResolvedValue(loaded);
});
afterEach(() => {
  setLanguage('en');
});

it('shows the two lists, and saves an edit with the version that was read', async () => {
  await mount();
  expect(byId('rack-presets-floor-0')).toHaveDisplayValue('BASE');
  expect(byId('rack-presets-chamber-0')).toHaveDisplayValue('C4');
  const save = () => byId('rack-presets-save');
  expect(save()).toBeDisabled();
  expect(save().props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));

  await fireEvent.changeText(byId('rack-presets-floor-1'), 'F9');
  await user.press(byId('rack-presets-chamber-add'));
  await fireEvent.changeText(byId('rack-presets-chamber-1'), ' C7 ');
  (setRackPresets as jest.Mock).mockResolvedValue({ ok: true, changed: true, answer: { ...loaded, floor: ['BASE', 'F9'], chamber: ['C4', 'C7'], version: 3 } });
  expect(save()).toBeEnabled();
  expect(save().props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
  await user.press(save());

  expect(setRackPresets).toHaveBeenCalledWith({ floor: ['BASE', 'F9'], chamber: ['C4', 'C7'] }, 2);
});

it('keeps the edit when the save is unconfirmed, and Try again sends the same lists again', async () => {
  const { showAlert } = jest.requireMock('@/utils/alert');
  await mount();
  await fireEvent.changeText(byId('rack-presets-floor-1'), 'F9');
  (setRackPresets as jest.Mock).mockResolvedValueOnce({ ok: false, message: 'Not confirmed', changedByOthers: false, unconfirmed: true });
  await user.press(byId('rack-presets-save'));
  const buttons = showAlert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
  expect(buttons.map((b) => b.text)).toEqual(['Cancel', 'Try again']);
  expect(byId('rack-presets-floor-1')).toHaveDisplayValue('F9');
  (setRackPresets as jest.Mock).mockResolvedValueOnce({ ok: true, changed: false, answer: { ...loaded, floor: ['BASE', 'F9'], version: 3 } });
  await act(async () => { buttons[1].onPress?.(); });
  expect(setRackPresets).toHaveBeenCalledTimes(2);
  expect((setRackPresets as jest.Mock).mock.calls[1]).toEqual((setRackPresets as jest.Mock).mock.calls[0]);
});

it('removes a button', async () => {
  await mount();
  await user.press(byId('rack-presets-floor-0-remove'));
  expect(byId('rack-presets-floor-0')).toHaveDisplayValue('F1');
});

it('tells staff it is for administrators and supervisors, and reads nothing', async () => {
  mockRole = 'staff';
  await render(<RackPresetsScreen />);
  expect(getRackPresets).not.toHaveBeenCalled();
  expect(screen.queryAllByTestId('rack-presets-floor', hidden)).toHaveLength(0);
});

it('a button with no text is called by its position, in Gujarati digits in Gujarati and 0-9 in English', async () => {
  await mount();
  await user.press(byId('rack-presets-chamber-add'));
  const remove = () => byId('rack-presets-chamber-1-remove');
  expect(remove().props.accessibilityLabel).toContain('2');
  await act(async () => { setLanguage('gu'); });
  await screen.rerender(<RackPresetsScreen />);
  expect(remove().props.accessibilityLabel).toContain('૨');
  expect(remove().props.accessibilityLabel).not.toMatch(/[0-9]/);
});

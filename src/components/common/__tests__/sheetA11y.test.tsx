/**
 * sheetA11y (WH-238): no sheet exposes the bottom-sheet library's English labels ("Bottom Sheet",
 * "Bottom sheet handle", "Bottom sheet backdrop") to a screen reader. The shared settings, the pieces they carry,
 * two sheets rendered, and a check that every file that opens the library's sheet uses the settings on its sheet
 * and on its backdrop.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import ChangeLogBottomSheet from '../../ChangeLogBottomSheet';
import { RolePickerBottomSheet } from '../../RolePickerBottomSheet';
import { SHEET_A11Y, SHEET_BACKDROP_A11Y } from '../sheetA11y';

const mockState = { theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1' } } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons', MaterialCommunityIcons: 'MaterialCommunityIcons' }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => ({
  __esModule: true,
  default: (props: { children?: React.ReactNode }) => require('react').createElement('Swipeable', null, props.children),
}));
jest.mock('react-native-gesture-handler', () => {
  const ReactMock = require('react');
  return {
    GestureHandlerRootView: (props: { children?: React.ReactNode }) => ReactMock.createElement('GHRoot', null, props.children),
  };
});
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
}));
jest.mock('@gorhom/bottom-sheet', () => {
  const ReactMock = require('react');
  const passthrough = (name: string) => (props: { children?: React.ReactNode }) =>
    ReactMock.createElement(name, props, props.children);
  return {
    __esModule: true,
    default: ReactMock.forwardRef((props: { children?: React.ReactNode }, _ref: unknown) =>
      ReactMock.createElement('BottomSheet', props, props.children)),
    BottomSheetModal: ReactMock.forwardRef((props: { children?: React.ReactNode }, ref: unknown) => {
      ReactMock.useImperativeHandle(ref, () => ({ present: jest.fn(), dismiss: jest.fn() }));
      return ReactMock.createElement('BottomSheetModal', props, props.children);
    }),
    BottomSheetHandle: passthrough('BottomSheetHandle'),
    BottomSheetView: passthrough('BottomSheetView'),
    BottomSheetScrollView: passthrough('BottomSheetScrollView'),
    BottomSheetBackdrop: passthrough('BottomSheetBackdrop'),
    BottomSheetTextInput: ReactMock.forwardRef((props: object, _ref: unknown) =>
      ReactMock.createElement('BottomSheetTextInput', props)),
    BottomSheetFlatList: () => ReactMock.createElement('FlatList'),
  };
});

type HostNode = { type: string; props: Record<string, unknown>; children: Array<HostNode | string> | null };

/** The first host element of a tag; the sheet mocks are plain host tags with no role or text to query by. */
function host(type: string): HostNode {
  const find = (node: HostNode): HostNode | undefined =>
    node.type === type
      ? node
      : (node.children ?? []).reduce<HostNode | undefined>((found, child) => found ?? (typeof child === 'string' ? undefined : find(child)), undefined);
  const json = screen.toJSON() as HostNode | HostNode[] | null;
  const found = ([] as Array<HostNode | null>).concat(json).reduce<HostNode | undefined>((hit, root) => hit ?? (root ? find(root) : undefined), undefined);
  if (!found) throw new Error(`No ${type} on the screen`);
  return found;
}

const LIBRARY_WORDS = /bottom ?sheet/i;

describe('the shared settings', () => {
  it('turn the sheet\'s own label, role and stop off', () => {
    expect(SHEET_A11Y.accessible).toBe(false);
    expect(SHEET_A11Y.accessibilityRole).toBeNull();
    expect(SHEET_A11Y.accessibilityLabel).toBeNull();
  });

  it('turn the backdrop\'s label and role off and make it no stop', () => {
    expect(SHEET_BACKDROP_A11Y).toEqual({ accessible: false, accessibilityRole: null, accessibilityLabel: null });
  });

  it('the background is a plain view with no label, hidden from a screen reader, that keeps the library\'s look and the sheet\'s style', async () => {
    const Background = SHEET_A11Y.backgroundComponent as unknown as React.ComponentType<Record<string, unknown>>;
    await render(<Background pointerEvents="none" style={{ backgroundColor: '#123456' }} />);
    const view = host('View');
    expect(view.props.accessible).toBe(false);
    expect(view.props.accessibilityLabel).toBeUndefined();
    expect(view.props.importantForAccessibility).toBe('no');
    expect(view.props.accessibilityElementsHidden).toBe(true);
    expect(view.props.pointerEvents).toBe('none');
    const flat = StyleSheet.flatten(view.props.style as never) as { backgroundColor: string; borderRadius: number };
    expect(flat.borderRadius).toBe(15); // the library's default corners (3a762da6)
    expect(flat.backgroundColor).toBe('#123456'); // the sheet's own colour wins over the library's white
    await render(<Background pointerEvents="auto" style={undefined} />);
    expect(StyleSheet.flatten(host('View').props.style as never)).toEqual({ backgroundColor: 'white', borderRadius: 15 });
  });

  it('the handle is the library\'s handle with its label, role and hint off, and passes the rest on', async () => {
    const Handle = SHEET_A11Y.handleComponent as unknown as React.ComponentType<Record<string, unknown>>;
    await render(<Handle indicatorStyle={{ width: 40 }} />);
    const handle = host('BottomSheetHandle');
    expect(handle.props.accessible).toBe(false);
    expect(handle.props.accessibilityRole).toBeNull();
    expect(handle.props.accessibilityLabel).toBeNull();
    expect(handle.props.accessibilityHint).toBeNull();
    expect(handle.props.indicatorStyle).toEqual({ width: 40 });
  });
});

describe('sheets rendered', () => {
  it('the change log sheet (a modal) carries the settings and shows none of the library\'s words', async () => {
    await render(<ChangeLogBottomSheet isVisible onClose={jest.fn()} customer={null} entries={[]} loading={false} />);
    const sheet = host('BottomSheetModal');
    expect(sheet.props.accessible).toBe(false);
    expect(sheet.props.accessibilityLabel).toBeNull();
    expect(sheet.props.backgroundComponent).toBe(SHEET_A11Y.backgroundComponent);
    expect(sheet.props.handleComponent).toBe(SHEET_A11Y.handleComponent);
    expect(screen.queryAllByLabelText(LIBRARY_WORDS, { hidden: true })).toEqual([]);
  });

  it('the role picker (a plain sheet) carries the settings and its backdrop is no stop', async () => {
    await render(
      <RolePickerBottomSheet isVisible onClose={jest.fn()} onSelect={jest.fn()} currentRole="staff" callerRole="supervisor" />);
    const sheet = host('BottomSheet');
    expect(sheet.props.accessible).toBe(false);
    expect(sheet.props.backgroundComponent).toBe(SHEET_A11Y.backgroundComponent);
    expect(sheet.props.handleComponent).toBe(SHEET_A11Y.handleComponent);
    const Backdrop = sheet.props.backdropComponent as (p: object) => React.ReactElement;
    await render(Backdrop({ animatedIndex: { value: 0 }, animatedPosition: { value: 0 } }));
    const props = host('BottomSheetBackdrop').props;
    expect(props.accessible).toBe(false);
    expect(props.accessibilityRole).toBeNull();
    expect(props.accessibilityLabel).toBeNull();
  });
});

describe('every file that opens the library\'s sheet', () => {
  const root = path.resolve(__dirname, '../../../..');
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
        walk(full);
      } else if (/\.tsx$/.test(entry.name) && fs.readFileSync(full, 'utf8').match(/<BottomSheet(Modal)?[\s>]/)) {
        found.push(full);
      }
    }
  };
  walk(path.join(root, 'src'));
  walk(path.join(root, 'app'));
  const names = found.map(file => path.relative(root, file)).sort();

  it('are the eight known ones (a new sheet is added here, with the settings)', () => {
    expect(names).toEqual([
      'src/components/ChangeLogBottomSheet.tsx',
      'src/components/CustomerSearchBottomSheet.tsx',
      'src/components/ItemCatalogBrowser.tsx',
      'src/components/PrintJobsBottomSheet.tsx',
      'src/components/RolePickerBottomSheet.tsx',
      'src/components/common/SearchableBottomSheet.tsx',
      'src/features/dispatch/components/GRNItemBottomSheet.tsx',
      'src/features/dispatch/components/LotBottomSheet.tsx',
    ]);
  });

  it.each(names)('%s spreads SHEET_A11Y on its sheet and SHEET_BACKDROP_A11Y on its backdrop', (name) => {
    const source = fs.readFileSync(path.join(root, name), 'utf8');
    expect(source).toMatch(/<BottomSheet(Modal)?\s+\{\.\.\.SHEET_A11Y\}/);
    expect(source).toMatch(/<BottomSheetBackdrop\s+\{\.\.\.props\}\s+\{\.\.\.SHEET_BACKDROP_A11Y\}/);
  });
});

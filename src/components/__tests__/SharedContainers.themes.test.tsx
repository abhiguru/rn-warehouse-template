/**
 * Renders the shared dialogs, banners, tables, list states, skeletons, media
 * and overview-tab blocks in all four themes (brand x mode), and checks that
 * the key surfaces take their colours from the semantic tokens.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { BRANDS, getTokens, type Brand, type Mode } from '@/theme/tokens';

import { ConfirmDialog } from '../ConfirmDialog';
import { ForceUpdateModal } from '../ForceUpdateModal';
import { UpdatePrompt } from '../UpdatePrompt';
import { TokenExpiryBanner } from '../TokenExpiryBanner';
import { CachedImage } from '../CachedImage';
import { ImageOverlay } from '../ImageOverlay';
import { CameraModal } from '../CameraModal';
import { FioriDataTable as RootTable, formatCellValue } from '../FioriDataTable';
import { FioriDataTable as FioriPathTable } from '../fiori/FioriDataTable';
import { FioriDataTable as ReportsPathTable } from '../reports/FioriDataTable';
import { ListEmptyState } from '../list/ListEmptyState';
import { LoadingState } from '../list/LoadingState';
import { ListSkeletonCard } from '../list/ListSkeletonCard';
import { GenericFilterableList } from '../list/GenericFilterableList';
import { DetailSkeleton, ListSkeleton, SkeletonBox } from '../skeletons';
import {
  ActionsSection,
  ContactCard,
  InfoChip,
  NotesSection,
  SectionHeader,
  FIORI,
} from '../common/overview-tab';
import { formatContactPhone } from '../common/overview-tab/ContactCard';
import { useListColors } from '@/hooks/useListColors';
import { FIORI_DIMENSIONS, FIORI_TYPOGRAPHY } from '@/constants/fioriDesignTokens';
import { commonStyles, useCommonStyles } from '@/styles';

type MockState = {
  theme: { preference: string; brand: string };
  auth: { tokenExpiryWarning: boolean; tokenExpired: boolean; error: string | null; configFetchFailed: boolean };
};
let mockState: MockState;
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons', MaterialCommunityIcons: 'MaterialCommunityIcons' }));
jest.mock('react-native-safe-area-context', () => {
  const ReactMock = require('react');
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaView: (props: { children?: React.ReactNode }) => ReactMock.createElement('SafeAreaView', props, props.children),
  };
});
jest.mock('react-native-paper', () => {
  const ReactMock = require('react');
  return { Portal: (props: { children?: React.ReactNode }) => ReactMock.createElement('Portal', null, props.children) };
});
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn() }) }));
jest.mock('@/store/slices/authSlice', () => ({
  clearTokenExpiryStates: jest.fn(),
  clearAuthError: jest.fn(),
  logout: jest.fn(),
  setConfigFetchFailed: jest.fn(),
}));
jest.mock('@/hooks/useForceUpdate', () => ({
  useForceUpdate: () => ({
    updateRequired: true,
    currentVersion: '1.0.0',
    minimumVersion: '1.2.0',
    isConfigLoaded: true,
    openStore: jest.fn(),
  }),
}));
jest.mock('@/hooks/useOTAUpdates', () => ({
  useOTAUpdates: () => ({
    isUpdateAvailable: false,
    isUpdatePending: true,
    isDownloading: false,
    isChecking: false,
    error: new Error('HTTP 500 from update server'),
    downloadProgress: 0,
    downloadUpdate: jest.fn(),
    applyUpdate: jest.fn(),
    dismissUpdate: jest.fn(),
    isEnabled: true,
  }),
}));
jest.mock('expo-image', () => ({
  Image: Object.assign(() => null, { prefetch: jest.fn(), clearDiskCache: jest.fn(), clearMemoryCache: jest.fn() }),
}));
jest.mock('expo-camera', () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: false }, jest.fn()],
}));
jest.mock('react-native-image-viewing', () => {
  const ReactMock = require('react');
  return (props: { HeaderComponent: React.ComponentType<{ imageIndex: number }>; FooterComponent: React.ComponentType<{ imageIndex: number }>; backgroundColor?: string }) =>
    ReactMock.createElement(
      'ImageViewing',
      { backgroundColor: props.backgroundColor },
      ReactMock.createElement(props.HeaderComponent, { imageIndex: 0 }),
      ReactMock.createElement(props.FooterComponent, { imageIndex: 0 })
    );
});
jest.mock('@shopify/flash-list', () => {
  const ReactMock = require('react');
  return {
    FlashList: (props: { data: unknown[]; ListEmptyComponent?: React.ComponentType }) =>
      props.data.length === 0 && props.ListEmptyComponent
        ? ReactMock.createElement(props.ListEmptyComponent)
        : ReactMock.createElement('FlashList', null),
  };
});
jest.mock('../GhostTextInput', () => ({ GhostTextInput: () => null }));

const MODES: Mode[] = ['light', 'dark'];
const THEMES = BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const));

function setTheme(brand: Brand, mode: Mode, auth: Partial<MockState['auth']> = {}) {
  mockState = {
    theme: { preference: mode, brand },
    auth: { tokenExpiryWarning: false, tokenExpired: false, error: null, configFetchFailed: false, ...auth },
  };
}

function render(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  return tree;
}

function flatStyle(style: unknown): Record<string, unknown> {
  const list = ([] as unknown[]).concat(style ?? []).flat(Infinity as 1).filter(Boolean);
  return Object.assign({}, ...(list as object[]));
}

function hasBackground(tree: ReactTestRenderer, colour: string) {
  return tree.root.findAll(node => {
    const raw = node.props?.style;
    const style = typeof raw === 'function' ? raw({ pressed: false }) : raw;
    return flatStyle(style).backgroundColor === colour;
  }).length > 0;
}

function texts(tree: ReactTestRenderer): string[] {
  return tree.root
    .findAll(node => (node.type as unknown) === 'Text')
    .map(node => ([] as unknown[]).concat(node.props.children).join(''));
}

const tableColumns = [
  { key: 'name', label: 'Item' },
  { key: 'bags', label: 'Bags', dataType: 'number' as const, sortable: true },
  { key: 'amount', label: 'Amount', dataType: 'currency' as const },
  { key: 'rack', label: 'Rack' },
];
const tableData = [
  { id: 'a', name: 'Potato', bags: 1200, amount: 123456.5, rack: 'B-14' },
  { id: 'b', name: 'Onion', bags: 40, amount: 980, rack: 'C-2' },
];

describe.each(THEMES)('shared containers in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);
  beforeEach(() => setTheme(brand, mode));

  it('ConfirmDialog uses the sheet surface, scrim and destructive fill', () => {
    const tree = render(
      <ConfirmDialog
        visible
        title="Delete GRN 311?"
        message="Its items will be removed from stock."
        confirmText="Delete GRN"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
        variant="danger"
      />
    );
    expect(hasBackground(tree, t.overlay.scrim)).toBe(true);
    expect(hasBackground(tree, t.surface.sheet)).toBe(true);
    expect(hasBackground(tree, t.destructive.fill)).toBe(true);
    expect(texts(tree)).toEqual(expect.arrayContaining(['Delete GRN', 'Cancel']));
    act(() => tree.unmount());
  });

  it('ForceUpdateModal and UpdatePrompt render as dialogs without developer text', () => {
    const force = render(<ForceUpdateModal />);
    expect(hasBackground(force, t.surface.sheet)).toBe(true);
    expect(hasBackground(force, t.brand.fill)).toBe(true);
    expect(texts(force)).toContain('Update app');
    act(() => force.unmount());

    const prompt = render(<UpdatePrompt />);
    expect(hasBackground(prompt, t.overlay.scrim)).toBe(true);
    expect(texts(prompt).join(' ')).not.toContain('HTTP 500');
    expect(texts(prompt)).toEqual(expect.arrayContaining(['Update ready', 'Restart app', 'Later']));
    act(() => prompt.unmount());
  });

  it('TokenExpiryBanner uses status backgrounds', () => {
    setTheme(brand, mode, { tokenExpiryWarning: true });
    const warning = render(<TokenExpiryBanner />);
    expect(hasBackground(warning, t.status.critical.background)).toBe(true);
    expect(texts(warning)).toContain('Sign in again');
    act(() => warning.unmount());

    setTheme(brand, mode, { tokenExpired: true });
    const expired = render(<TokenExpiryBanner />);
    expect(hasBackground(expired, t.status.negative.background)).toBe(true);
    act(() => expired.unmount());
  });

  it('media components use the placeholder and photo tokens', () => {
    const image = render(<CachedImage uri="https://example.com/a.jpg" usePlaceholder={false} />);
    expect(hasBackground(image, t.surface.cardActive)).toBe(true);
    act(() => image.unmount());

    const overlay = render(
      <ImageOverlay
        visible
        images={[{ id: '1', imageUrl: 'u', fileName: 'lot.jpg', fileSize: 1, mimeType: 'image/jpeg', uploadTimestamp: '', uploadStatus: 'completed' }]}
        onClose={jest.fn()}
      />
    );
    expect(overlay.root.findByType('ImageViewing' as unknown as React.ElementType).props.backgroundColor).toBe(
      t.overlay.imageBackdrop
    );
    expect(overlay.root.findAll(n => n.props.accessibilityLabel === 'Close photo').length).toBeGreaterThan(0);
    act(() => overlay.unmount());

    const camera = render(<CameraModal visible onClose={jest.fn()} onCapture={jest.fn()} />);
    expect(hasBackground(camera, t.background.base)).toBe(true);
    expect(texts(camera)).toContain('Allow camera access');
    act(() => camera.unmount());
  });

  it('the three table paths render the one table spec', () => {
    for (const Table of [RootTable, FioriPathTable, ReportsPathTable]) {
      const tree = render(
        <Table
          columns={tableColumns}
          data={tableData}
          keyExtractor={(row: { id: string }) => row.id}
          sortColumn="bags"
          sortDirection="asc"
          onSort={jest.fn()}
          totals={{ name: 'Total', bags: 1240 }}
        />
      );
      // Header on background.base, rows on surface.card, no alternate shading
      expect(hasBackground(tree, t.background.base)).toBe(true);
      expect(hasBackground(tree, t.surface.card)).toBe(true);
      const all = texts(tree);
      expect(all).toEqual(expect.arrayContaining(['Potato', '1,200', '₹1,23,456.50', 'Total', '1,240']));
      expect(tree.root.findAll(n => n.props.accessibilityLabel === 'Bags, sorted ascending').length).toBeGreaterThan(0);
      act(() => tree.unmount());
    }

    const empty = render(<RootTable columns={tableColumns} data={[]} emptyMessage="No items in this GRN." />);
    expect(texts(empty)).toContain('No items in this GRN.');
    act(() => empty.unmount());
  });

  it('list states, skeletons and the filterable list use tokens', () => {
    const emptyFiltered = render(<ListEmptyState activeFilterCount={2} onClearFilters={jest.fn()} />);
    expect(texts(emptyFiltered)).toContain('Clear filters');
    act(() => emptyFiltered.unmount());

    const loading = render(<LoadingState />);
    expect(hasBackground(loading, t.background.base)).toBe(true);
    act(() => loading.unmount());

    const skeletons = render(
      <>
        <ListSkeletonCard />
        <ListSkeleton count={1} />
        <DetailSkeleton />
        <SkeletonBox />
      </>
    );
    expect(hasBackground(skeletons, t.surface.cardActive)).toBe(true);
    act(() => skeletons.unmount());

    const list = render(
      <GenericFilterableList
        data={[]}
        loading={false}
        refreshing={false}
        loadingMore={false}
        onRefresh={jest.fn()}
        onEndReached={jest.fn()}
        renderItem={() => null}
        keyExtractor={(_: unknown, i: number) => String(i)}
        activeFilterCount={1}
        onFilterPress={jest.fn()}
        headerTitle="GRNs"
        totalCount={1}
      />
    );
    expect(hasBackground(list, t.background.base)).toBe(true);
    expect(list.root.findAll(n => n.props.accessibilityLabel === 'Filter, 1 active').length).toBeGreaterThan(0);
    expect(texts(list)).toContain('1 item');
    act(() => list.unmount());
  });

  it('overview tab blocks use tokens', () => {
    const tree = render(
      <>
        <SectionHeader title="Customer" />
        <ContactCard type="Customer" name="Patel Traders" phone="9876543210" iconName="account-outline" iconColor={t.brand.tint} iconBgColor={t.brand.subtle} />
        <InfoChip icon="calendar" label="9 Oct 2026" />
        <NotesSection note="Handle with care" />
        <ActionsSection entityType="GRN" entityNumber="311" entityId="g1" onEdit={jest.fn()} onDelete={jest.fn()} onSharePDF={jest.fn()} />
      </>
    );
    expect(hasBackground(tree, t.surface.card)).toBe(true);
    expect(hasBackground(tree, t.status.neutral.background)).toBe(true);
    expect(hasBackground(tree, t.brand.fill)).toBe(true);
    expect(texts(tree)).toEqual(expect.arrayContaining(['CUSTOMER', '+91 98765 43210', 'Edit GRN', 'Delete GRN']));
    act(() => tree.unmount());
  });

  it('legacy adapters are derived from tokens', () => {
    let palette: ReturnType<typeof useListColors> | undefined;
    let common: ReturnType<typeof useCommonStyles> | undefined;
    function Probe() {
      palette = useListColors();
      common = useCommonStyles();
      return null;
    }
    const tree = render(<Probe />);
    expect(palette!.primary).toBe(t.brand.fill);
    expect(palette!.cellBackground).toBe(t.surface.card);
    expect(palette!.textSecondary).toBe(t.text.secondary);
    expect(flatStyle(common!.screenGray).backgroundColor).toBe(t.background.base);
    act(() => tree.unmount());
  });
});

describe('static legacy exports', () => {
  it('keep their shapes', () => {
    expect(FIORI.spacing.lg).toBe(16);
    expect(FIORI.colors.cardBackground).toBe(getTokens('orange', 'light').surface.card);
    expect(FIORI_DIMENSIONS.objectCellMinHeight).toBe(72);
    expect(FIORI_TYPOGRAPHY.caption.fontSize).toBe(12);
    expect(commonStyles.flex1).toEqual({ flex: 1 });
  });

  it('formats table and phone values per the style guide', () => {
    expect(formatCellValue(null)).toBe('-');
    expect(formatCellValue(12.5, 'percent')).toBe('12.5%');
    expect(formatContactPhone('+91 98765-43210')).toBe('+91 98765 43210');
    expect(formatContactPhone('080 1234')).toBe('080 1234');
  });
});

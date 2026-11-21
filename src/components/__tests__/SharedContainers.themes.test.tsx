/**
 * Renders the shared dialogs, banners, list states, skeletons, media
 * and overview-tab blocks in all four themes (brand x mode), and checks that
 * the key surfaces take their colours from the semantic tokens.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { BRANDS, getTokens, type Brand, type Mode } from '@/theme/tokens';

import { ConfirmDialog } from '../ConfirmDialog';
import { ForceUpdateModal } from '../ForceUpdateModal';
import { CachedImage } from '../CachedImage';
import { ImageOverlay } from '../ImageOverlay';
import { CameraModal } from '../CameraModal';
import { ListEmptyState } from '../list/ListEmptyState';
import { LoadingState } from '../list/LoadingState';
import { ListSkeletonCard } from '../list/ListSkeletonCard';
import { DetailSkeleton, ListSkeleton, SkeletonBox } from '../skeletons';
import {
  ActionsSection,
  ContactCard,
  InfoChip,
  NotesSection,
} from '../common/overview-tab';
import { formatContactPhone } from '../common/overview-tab/ContactCard';
import { SectionHeader } from '../ui/SectionHeader';

type MockState = {
  theme: { preference: string; brand: string };
  auth: { error: string | null };
};
let mockState: MockState;
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
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
  clearAuthError: jest.fn(),
  logout: jest.fn(),
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

const MODES: Mode[] = ['light', 'dark'];
const THEMES = BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const));

function setTheme(brand: Brand, mode: Mode, auth: Partial<MockState['auth']> = {}) {
  mockState = {
    theme: { preference: mode, brand },
    auth: { error: null, ...auth },
  };
}

function flatStyle(style: unknown): Record<string, unknown> {
  const list = ([] as unknown[]).concat(style ?? []).flat(Infinity as 1).filter(Boolean);
  return Object.assign({}, ...(list as object[]));
}

type Json = ReturnType<typeof screen.toJSON>;
type JsonNode = Exclude<NonNullable<Json>, unknown[]>;

/** Every element of the rendered tree (a style has no role or text to query, so the tree is walked). */
function elements(json: Json = screen.toJSON()): JsonNode[] {
  const out: JsonNode[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node === 'string') return;
    if (Array.isArray(node)) return node.forEach(walk);
    out.push(node as JsonNode);
    ((node as JsonNode).children ?? []).forEach(walk);
  };
  walk(json);
  return out;
}

function hasBackground(colour: string) {
  return elements().some(node => flatStyle(node.props?.style).backgroundColor === colour);
}

describe.each(THEMES)('shared containers in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);
  beforeEach(() => setTheme(brand, mode));

  it('ConfirmDialog uses the sheet surface, scrim and destructive fill', async () => {
    await render(
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
    expect(hasBackground(t.overlay.scrim)).toBe(true);
    expect(hasBackground(t.surface.sheet)).toBe(true);
    expect(hasBackground(t.destructive.fill)).toBe(true);
    expect(screen.getByText('Delete GRN')).toBeOnTheScreen();
    expect(screen.getByText('Cancel')).toBeOnTheScreen();
  });

  it('ForceUpdateModal renders as a dialog without developer text', async () => {
    await render(<ForceUpdateModal />);
    expect(hasBackground(t.surface.sheet)).toBe(true);
    expect(hasBackground(t.brand.fill)).toBe(true);
    expect(screen.getByText('Update app')).toBeOnTheScreen();
  });

  it('media components use the placeholder and photo tokens', async () => {
    const image = await render(<CachedImage uri="https://example.com/a.jpg" usePlaceholder={false} />);
    expect(hasBackground(t.surface.cardActive)).toBe(true);
    await image.unmount();

    const overlay = await render(
      <ImageOverlay
        visible
        images={[{ id: '1', imageUrl: 'u', fileName: 'lot.jpg', fileSize: 1, mimeType: 'image/jpeg', uploadTimestamp: '', uploadStatus: 'completed' }]}
        onClose={jest.fn()}
      />
    );
    // The viewer is a string-typed stand-in, so its backdrop colour is only on the tree.
    expect(elements().find(n => n.type === 'ImageViewing')?.props.backgroundColor).toBe(t.overlay.imageBackdrop);
    expect(screen.getAllByLabelText('Close photo').length).toBeGreaterThan(0);
    await overlay.unmount();

    await render(<CameraModal visible onClose={jest.fn()} onCapture={jest.fn()} />);
    expect(hasBackground(t.background.base)).toBe(true);
    expect(screen.getByText('Allow camera access')).toBeOnTheScreen();
  });

  it('list states and skeletons use tokens', async () => {
    const emptyFiltered = await render(<ListEmptyState activeFilterCount={2} onClearFilters={jest.fn()} />);
    expect(screen.getByText('Clear filters')).toBeOnTheScreen();
    await emptyFiltered.unmount();

    const loading = await render(<LoadingState />);
    expect(hasBackground(t.background.base)).toBe(true);
    await loading.unmount();

    await render(
      <>
        <ListSkeletonCard />
        <ListSkeleton count={1} />
        <DetailSkeleton />
        <SkeletonBox />
      </>
    );
    expect(hasBackground(t.surface.cardActive)).toBe(true);
  });

  it('overview tab blocks use tokens', async () => {
    await render(
      <>
        <SectionHeader title="Customer" />
        <ContactCard type="Customer" name="Patel Traders" phone="9876543210" iconName="account-outline" iconColor={t.brand.tint} iconBgColor={t.brand.subtle} />
        <InfoChip icon="calendar" label="9 Oct 2026" />
        <NotesSection note="Handle with care" />
        <ActionsSection entityType="GRN" entityNumber="311" entityId="g1" canEdit onDelete={jest.fn()} onSharePDF={jest.fn()} />
      </>
    );
    expect(hasBackground(t.surface.card)).toBe(true);
    expect(hasBackground(t.status.neutral.background)).toBe(true);
    // WH-216: the primary Edit button moved to the page header, so this section no longer draws a brand fill.
    expect(hasBackground(t.brand.fill)).toBe(false);
    expect(screen.getByText('CUSTOMER')).toBeOnTheScreen();
    expect(screen.getByText('+91 98765 43210')).toBeOnTheScreen();
    expect(screen.getByText('Delete GRN')).toBeOnTheScreen();
  });
});

describe('contact card without a number', () => {
  const card = (phone: string | undefined) => {
    mockState = { ...mockState, theme: { preference: 'light', brand: 'orange' } };
    return render(
      <ContactCard type="Supervisor" name="Ravi Example" phone={phone} iconName="account-tie" iconColor="#111111" iconBgColor="#eeeeee" />
    );
  };

  // The server leaves the supervisor's mobile out for a customer account (migration 45).
  it.each([[undefined], [''], ['   ']])('shows the name and no Call action when the phone is %j', async (phone) => {
    await card(phone);
    expect(screen.getByText('Ravi Example')).toBeOnTheScreen();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('shows Call when there is a number', async () => {
    await card('9876543210');
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});

describe('value formats', () => {
  it('formats phone values per the style guide', () => {
    expect(formatContactPhone('+91 98765-43210')).toBe('+91 98765 43210');
    expect(formatContactPhone('080 1234')).toBe('080 1234');
  });
});

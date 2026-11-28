/**
 * The Holding list (WH-304, Design offline-capture.md 7.1, 7.2; contract 5.1): the items the server refused and holds for a
 * supervisor or administrator, oldest first, each item that follows another directly under it. It needs the server: offline it
 * says so (Part 2) and asks for nothing. A row opens the item.
 */
import React, { useCallback, useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { ListEmptyState } from '@/components/list/ListEmptyState';
import { ReportEmptyState } from '@/components/reports/ReportEmptyState';
import { ListSkeleton } from '@/components/skeletons/ListSkeleton';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { StatusTag } from '@/components/ui/StatusTag';
import { ScreenNeedsConnection } from '@/features/phone-copy/components/ScreenNeedsConnection';
import { useCopyOffline } from '@/features/phone-copy/useCopyOffline';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as tr } from '@/i18n';
import { queryKeys } from '@/lib/queryClient';
import { layout, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { formatLoadedAt } from '@/utils/formatters';
import { getHeldItems, type HeldListRow } from './holdingApi';
import { describeReason } from './heldReason';
import { heldWhatText } from './heldWhat';

const makeStyles = (t: ThemeTokens) => ({
  screen: { flex: 1, backgroundColor: t.background.base },
  note: { ...typography.footnote, color: t.text.secondary, paddingHorizontal: layout.marginCompact, paddingVertical: space.sm },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    minHeight: layout.objectCellMinHeight,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    gap: space.md,
    backgroundColor: t.surface.card,
  },
  pressed: { backgroundColor: t.surface.cardPressed },
  divider: { height: 1, marginLeft: space.lg, backgroundColor: t.border.divider },
  main: { flex: 1, gap: space.xxs },
  title: { ...typography.headline, color: t.text.primary },
  subtitle: { ...typography.subhead, color: t.text.secondary },
  footnote: { ...typography.footnote, color: t.text.secondary },
  tag: { alignItems: 'flex-end' as const, flexShrink: 1, maxWidth: '45%' as const },
  fill: { flex: 1 },
});

interface HeldRowProps {
  row: HeldListRow;
  divider: boolean;
  onOpen: (id: string) => void;
}

/** One row (object cell, §13.6): what it is, the customer, who recorded it, when and from which phone, and the reason's tag. */
const HeldRow = React.memo(function HeldRow({ row, divider, onOpen }: HeldRowProps) {
  const styles = useThemedStyles(makeStyles);
  const title = heldWhatText(row.what);
  const recorded = Date.parse(row.recordedAt ?? '');
  const footnote = [row.recordedByName, Number.isNaN(recorded) ? null : formatLoadedAt(recorded), row.phone].filter(Boolean).join(' · ');
  const tag = describeReason(row.reason, { kind: row.kind, what: row.what, customer: row.customerName, data: row.reasonData, followsWhat: null }).tag;
  const label = [title, row.customerName, footnote, tag].filter(Boolean).join(', ');
  return (
    <View>
      <Pressable
        testID={`holding-row-${row.id}`}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        onPress={() => onOpen(row.id)}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <View style={styles.main}>
          <Text style={styles.title}>{title}</Text>
          {row.customerName ? <Text style={styles.subtitle}>{row.customerName}</Text> : null}
          <Text style={styles.footnote}>{footnote}</Text>
        </View>
        <View style={styles.tag}>
          <StatusTag testID={`holding-row-tag-${row.id}`} status="critical" label={tag} wrap />
        </View>
      </Pressable>
      {divider ? <View style={styles.divider} /> : null}
    </View>
  );
});

export function HoldingListScreen() {
  const styles = useThemedStyles(makeStyles);
  const tokens = useTokens();
  const offline = useCopyOffline();
  const query = useQuery({ queryKey: queryKeys.holding.list(), queryFn: getHeldItems, enabled: !offline, retry: false });
  const rows = useMemo(() => query.data ?? [], [query.data]);
  const open = useCallback((id: string) => router.push(`/held-item/${id}`), []);

  // The screen's own test id and its note are there once the list has loaded (the note and the rows appear together).
  let loaded = false;
  let body: React.ReactNode;
  if (offline) {
    body = <ScreenNeedsConnection testID="holding-needs-connection" />;
  } else if (query.isPending) {
    body = <ListSkeleton count={4} showFooter={false} />;
  } else if (query.isError) {
    body = (
      <ReportEmptyState
        icon="cloud-alert-outline"
        tone="error"
        message={tr('common.couldNotLoad')}
        actionLabel={tr('common.retry')}
        onAction={() => void query.refetch()}
      />
    );
  } else {
    loaded = true;
    body = (
      <FlashList
        data={rows}
        keyExtractor={row => row.id}
        renderItem={({ item, index }) => <HeldRow row={item} divider={index < rows.length - 1} onOpen={open} />}
        ListEmptyComponent={
          <View style={styles.fill}>
            <ListEmptyState
              testID="holding-empty"
              activeFilterCount={0}
              emptyIcon="inbox-outline"
              emptyTitle={tr('offline.holding.emptyTitle')}
              emptySubtitle={tr('offline.holding.emptyText')}
            />
          </View>
        }
      />
    );
  }

  return (
    <View testID={loaded ? 'holding-screen' : undefined} style={styles.screen}>
      <Stack.Screen options={{ title: tr('offline.holding.title'), headerLeft: () => <HeaderBackButton /> }} />
      <EdgeToEdgeStatusBar barStyle={tokens.statusBarStyle} />
      {loaded ? (
        <Text testID="holding-list-note" style={styles.note}>
          {tr('offline.holding.listNote')}
        </Text>
      ) : null}
      {body}
    </View>
  );
}

export default HoldingListScreen;

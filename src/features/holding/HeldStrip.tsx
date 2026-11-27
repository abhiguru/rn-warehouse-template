/**
 * The strip at the top of the GRN and Dispatch tabs (WH-304, Design offline-capture.md 7.1): "N held items need a decision" for
 * administrators and supervisors while the copy holds items waiting for a decision; one target that opens the Holding list.
 * It is outside the list, so it shows in every state of it. Hidden at 0, for staff and customer accounts, and when the facility
 * has no holding list.
 */
import React, { useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { InlineValidation } from '@/components/fiori/InlineValidation';
import { isManager } from '@/config/roles';
import { useTokens } from '@/hooks/useTheme';
import { t as tr } from '@/i18n';
import { useAppSelector } from '@/store/hooks';
import { iconSize, layout, space, touchTarget } from '@/theme/tokens';
import { holdingOn } from './handOver';
import { heldNeedingDecision, subscribeHeldRows } from './heldRows';

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: touchTarget,
    paddingHorizontal: layout.marginCompact,
    paddingBottom: space.xs,
  },
  text: { flex: 1 },
});

export function HeldStrip() {
  const tokens = useTokens();
  const manager = useAppSelector(state => isManager(state.auth.userProfile?.role));
  const count = useSyncExternalStore(subscribeHeldRows, heldNeedingDecision, heldNeedingDecision);
  if (!manager || !holdingOn() || count === 0) return null;
  const text = tr('offline.holding.strip', { count });
  return (
    <Pressable
      testID="holding-strip"
      style={styles.strip}
      onPress={() => router.push('/holding-list')}
      accessibilityRole="button"
      accessibilityLabel={`${text}, ${tr('offline.holding.stripOpens')}`}
    >
      {/* The strip is read once, by the button's own label. */}
      <View style={styles.text} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <InlineValidation variant="warning" message={text} />
      </View>
      <Icon name="chevron-right" size={iconSize.md} color={tokens.icon.secondary} importantForAccessibility="no" />
    </Pressable>
  );
}

export default HeldStrip;

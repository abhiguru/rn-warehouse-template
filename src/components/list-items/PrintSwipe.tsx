/**
 * PrintSwipe - the Print swipe action of a list card (docs/STYLE_GUIDE.md §13.6: 72 wide, an icon over a caption1
 * label, `surface.cardActive`). The same action is offered to screen readers by the card itself. The GRN list has its
 * own swipe with View and Edit as well; the dispatch and invoice lists offer only Print.
 */
import React, { useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { t as translate } from '@/i18n';

interface PrintSwipeProps {
  onPrint: () => void;
  /** Spoken label of the action, e.g. "Print dispatch I4613". */
  label: string;
  /** The card's own vertical margin, so the action is as tall as the card. */
  cardMargin: number;
  children: React.ReactElement;
}

const makeStyles = (t: ThemeTokens) => ({
  actions: {
    flexDirection: 'row' as const,
    alignItems: 'stretch' as const,
    marginLeft: space.sm,
    marginRight: layout.marginCompact,
    borderRadius: radius.card,
    overflow: 'hidden' as const,
  },
  button: {
    width: 72,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    backgroundColor: t.surface.cardActive,
  },
  buttonPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  text: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
  },
});

export const PrintSwipe: React.FC<PrintSwipeProps> = ({ onPrint, label, cardMargin, children }) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const swipeableRef = useRef<SwipeableMethods>(null);

  const renderRightActions = () => (
    <View style={[styles.actions, { marginVertical: cardMargin }]}>
      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={() => {
          swipeableRef.current?.close();
          onPrint();
        }}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Icon name="printer-outline" size={iconSize.lg} color={t.icon.primary} />
        <Text style={styles.text} maxFontSizeMultiplier={1.6}>{translate('common.print')}</Text>
      </Pressable>
    </View>
  );

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
      friction={2}
      rightThreshold={40}
    >
      {children}
    </ReanimatedSwipeable>
  );
};

/**
 * SAP Fiori card (docs/STYLE_GUIDE.md §13.6).
 *
 * Features:
 * - Header/Body/Footer anatomy (Fiori Card structure)
 * - Status tag with icon and semantic colours
 * - Loading skeleton and error message strip
 * - Pressed and selected states
 * - Elevation from the theme shadows (sm 1, md 2, lg 3, xl 4)
 * - Minimum touch targets on footer actions
 * - Maximum height constraint (520pt per spec)
 *
 * Backwards compatible with existing Card usage (children-only mode)
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ViewStyle,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  radius,
  space,
  touchTarget,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';
import { getButtonColors } from './Button';

const CARD_MAX_HEIGHT = 520;
const HEADER_ICON_SIZE = 40;

// ============================================================================
// TYPES
// ============================================================================

/** Status badge semantic types */
export type CardStatusType = 'positive' | 'critical' | 'negative' | 'neutral';

/** Card padding variants (backwards compatible) */
export type CardPadding = 'none' | 'compact' | 'default' | 'comfortable' | 'spacious';

/** Card shadow variants */
export type CardShadow = 'none' | 'sm' | 'md' | 'lg' | 'xl';

/** Card header configuration */
export interface CardHeaderConfig {
  /** Main title */
  title: string;
  /** Optional subtitle */
  subtitle?: string;
  /** Optional header image/icon */
  icon?: string;
  /** Status badge */
  status?: {
    label: string;
    type: CardStatusType;
  };
  /** Show divider below header */
  showDivider?: boolean;
}

/** Card footer action */
export interface CardFooterAction {
  /** Button label */
  label: string;
  /** Press handler */
  onPress: () => void;
  /** Button style variant */
  style?: 'primary' | 'secondary' | 'tertiary';
  /** Icon name (optional) */
  icon?: string;
  /** Loading state */
  loading?: boolean;
  /** Disabled state */
  disabled?: boolean;
}

/** Card footer configuration */
export interface CardFooterConfig {
  /** Footer actions (buttons) */
  actions?: CardFooterAction[];
  /** Align actions: 'start' | 'center' | 'end' | 'space-between' */
  align?: 'start' | 'center' | 'end' | 'space-between';
  /** Show divider above footer */
  showDivider?: boolean;
}

/** Full Fiori Card props (new structured API) */
export interface FioriCardProps {
  /** Card header configuration */
  header?: CardHeaderConfig;
  /** Card body content */
  body?: React.ReactNode;
  /** Card footer configuration */
  footer?: CardFooterConfig;
  /** Loading state - shows skeleton */
  loading?: boolean;
  /** Error state - shows error message */
  error?: boolean | string;
  /** Selected state */
  selected?: boolean;
  /** Press handler for entire card */
  onPress?: () => void;
  /** Long press handler */
  onLongPress?: () => void;
  /** Custom container style */
  style?: ViewStyle;
  /** Accessibility label */
  accessibilityLabel?: string;
  /** Test ID */
  testID?: string;
}

/** Simple Card props (backwards compatible API) */
export interface CardProps {
  /** Card content (backwards compatible) */
  children?: React.ReactNode;
  /** Padding variant */
  padding?: CardPadding;
  /** Shadow size */
  shadow?: CardShadow;
  /** Custom container style */
  style?: ViewStyle;
  /** Make card touchable with onPress callback */
  onPress?: () => void;
  /** Long press handler */
  onLongPress?: () => void;
  /** Accessibility label */
  accessibilityLabel?: string;
  /** Test ID */
  testID?: string;
  // === Fiori Card props (new API) ===
  /** Card header configuration */
  header?: CardHeaderConfig;
  /** Card body content (alternative to children) */
  body?: React.ReactNode;
  /** Card footer configuration */
  footer?: CardFooterConfig;
  /** Loading state */
  loading?: boolean;
  /** Error state */
  error?: boolean | string;
  /** Selected state */
  selected?: boolean;
}

// ============================================================================
// UTILITIES
// ============================================================================

function getPaddingValue(padding: CardPadding): number {
  const paddingMap: Record<CardPadding, number> = {
    none: space.none,
    compact: space.md,
    default: space.lg,
    comfortable: space.xl,
    spacious: space.xxl,
  };
  return paddingMap[padding];
}

/** Shadow level per CardShadow (style guide §13.6: sm 1, md 2, lg 3, xl 4). */
const SHADOW_LEVEL: Record<Exclude<CardShadow, 'none'>, 1 | 2 | 3 | 4> = {
  sm: 1,
  md: 2,
  lg: 3,
  xl: 4,
};

/** Status icon per style guide §3.5. */
const STATUS_ICON: Record<CardStatusType, string> = {
  positive: 'check-circle',
  critical: 'alert',
  negative: 'alert-circle',
  neutral: 'circle-outline',
};

type Styles = ReturnType<typeof makeStyles>;

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/** Card Header */
function CardHeader({ config, showDivider = true, styles }: { config: CardHeaderConfig; showDivider?: boolean; styles: Styles }) {
  const t = useTokens();
  const status = config.status ? t.status[config.status.type] : null;

  return (
    <View style={[styles.header, showDivider && styles.headerWithDivider]}>
      {/* Icon */}
      {config.icon && (
        <View style={styles.headerIcon}>
          <Icon name={config.icon} size={iconSize.lg} color={t.icon.primary} />
        </View>
      )}

      {/* Title/Subtitle */}
      <View style={styles.headerTextContainer}>
        <Text style={styles.headerTitle} numberOfLines={2} accessibilityRole="header">
          {config.title}
        </Text>
        {config.subtitle && (
          <Text style={styles.headerSubtitle} numberOfLines={2}>
            {config.subtitle}
          </Text>
        )}
      </View>

      {/* Status tag: colour plus icon plus word */}
      {config.status && status && (
        <View style={[styles.statusBadge, { backgroundColor: status.background }]}>
          <Icon name={STATUS_ICON[config.status.type]} size={iconSize.sm} color={status.text} />
          <Text style={[styles.statusBadgeText, { color: status.text }]} maxFontSizeMultiplier={1.6}>
            {config.status.label}
          </Text>
        </View>
      )}
    </View>
  );
}

/** One footer action, coloured like the Button component. */
function CardFooterButton({ action, styles }: { action: CardFooterAction; styles: Styles }) {
  const t = useTokens();
  const type = action.style ?? 'tertiary';
  const isDisabled = action.disabled || action.loading;

  return (
    <Pressable
      onPress={action.onPress}
      disabled={isDisabled}
      style={({ pressed }) => {
        const c = getButtonColors(t, type, 'tint', pressed);
        return [
          styles.footerAction,
          { backgroundColor: c.background, borderColor: c.border, borderWidth: c.borderWidth },
          action.disabled && styles.footerActionDisabled,
        ];
      }}
      accessibilityRole="button"
      accessibilityLabel={action.label}
      accessibilityState={{ disabled: !!isDisabled, busy: !!action.loading }}
    >
      {({ pressed }) => {
        const c = getButtonColors(t, type, 'tint', pressed);
        return (
          <>
            {action.loading ? (
              <ActivityIndicator size="small" color={c.text} style={styles.footerActionIcon} />
            ) : (
              action.icon && (
                <Icon name={action.icon} size={iconSize.md} color={c.text} style={styles.footerActionIcon} />
              )
            )}
            <Text style={[styles.footerActionText, { color: c.text }]}>{action.label}</Text>
          </>
        );
      }}
    </Pressable>
  );
}

/** Card Footer */
function CardFooter({
  config,
  showDivider = true,
  styles,
}: {
  config: CardFooterConfig;
  showDivider?: boolean;
  styles: Styles;
}) {
  const justifyContent =
    config.align === 'start'
      ? 'flex-start'
      : config.align === 'center'
      ? 'center'
      : config.align === 'space-between'
      ? 'space-between'
      : 'flex-end';

  return (
    <View style={[styles.footer, showDivider && styles.footerWithDivider, { justifyContent }]}>
      {config.actions?.map((action, index) => (
        <CardFooterButton key={index} action={action} styles={styles} />
      ))}
    </View>
  );
}

/** Skeleton Loader */
function CardSkeleton({ styles }: { styles: Styles }) {
  return (
    <View
      style={styles.skeleton}
      accessible
      accessibilityLabel="Loading"
      accessibilityState={{ busy: true }}
    >
      <View style={styles.skeletonHeader}>
        <View style={styles.skeletonIcon} />
        <View style={styles.skeletonTextContainer}>
          <View style={[styles.skeletonText, { width: '60%' }]} />
          <View style={[styles.skeletonText, { width: '40%', marginTop: space.xs }]} />
        </View>
      </View>
      <View style={styles.skeletonBody}>
        <View style={[styles.skeletonText, { width: '100%' }]} />
        <View style={[styles.skeletonText, { width: '80%', marginTop: space.sm }]} />
        <View style={[styles.skeletonText, { width: '60%', marginTop: space.sm }]} />
      </View>
    </View>
  );
}

/** Error state: a negative message strip */
function CardError({ message, styles }: { message?: string; styles: Styles }) {
  const t = useTokens();
  return (
    <View style={styles.errorContainer}>
      <View style={styles.errorStrip} accessibilityRole="alert">
        <Icon name="alert-circle" size={iconSize.md} color={t.status.negative.text} />
        <Text style={styles.errorText}>
          {typeof message === 'string' ? message : "Couldn't load this content. Try again."}
        </Text>
      </View>
    </View>
  );
}

// ============================================================================
// CARD COMPONENT
// ============================================================================

export function Card({
  children,
  padding = 'default',
  shadow = 'md',
  style,
  onPress,
  onLongPress,
  accessibilityLabel,
  testID,
  // Fiori props
  header,
  body,
  footer,
  loading,
  error,
  selected,
}: CardProps) {
  const [isPressed, setIsPressed] = useState(false);
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);

  // Determine if using Fiori structure (header/body/footer) or simple children mode
  const isFioriMode = !!(header || body || footer || loading || error);

  // Container styles
  const containerStyle: ViewStyle = StyleSheet.flatten([
    styles.card,
    shadow === 'none' ? styles.cardFlat : t.shadow[SHADOW_LEVEL[shadow]],
    isPressed && styles.cardPressed,
    selected && styles.cardSelected,
    style,
  ]);

  // Simple mode: use padding prop
  const simpleContentStyle: ViewStyle = {
    padding: getPaddingValue(padding),
  };

  // Render content
  const renderContent = () => {
    if (loading) {
      return <CardSkeleton styles={styles} />;
    }

    if (error) {
      return <CardError message={typeof error === 'string' ? error : undefined} styles={styles} />;
    }

    if (isFioriMode) {
      return (
        <>
          {header && <CardHeader config={header} showDivider={header.showDivider !== false} styles={styles} />}
          <View style={styles.body}>{body || children}</View>
          {footer && footer.actions && footer.actions.length > 0 && (
            <CardFooter config={footer} showDivider={footer.showDivider !== false} styles={styles} />
          )}
        </>
      );
    }

    // Simple children mode (backwards compatible)
    return <View style={simpleContentStyle}>{children}</View>;
  };

  // Selected cards carry a check as well as the border (colour is never the only cue)
  const selectedMark = selected ? (
    <View style={styles.selectedMark} pointerEvents="none">
      <Icon name="check-circle" size={iconSize.md} color={t.brand.tint} />
    </View>
  ) : null;

  // Touchable card
  if (onPress || onLongPress) {
    return (
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={() => setIsPressed(true)}
        onPressOut={() => setIsPressed(false)}
        style={containerStyle}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || header?.title}
        accessibilityState={{ selected, busy: !!loading }}
        testID={testID}
      >
        {renderContent()}
        {selectedMark}
      </Pressable>
    );
  }

  // Static card
  return (
    <View
      style={containerStyle}
      accessibilityLabel={accessibilityLabel || header?.title}
      accessibilityState={selected ? { selected } : undefined}
      testID={testID}
    >
      {renderContent()}
      {selectedMark}
    </View>
  );
}

// ============================================================================
// CARD VARIANTS (Backwards Compatible)
// ============================================================================

/**
 * Compact Card - Less padding for dense layouts
 */
export function CompactCard(props: Omit<CardProps, 'padding'>) {
  return <Card {...props} padding="compact" />;
}

/**
 * Spacious Card - More padding for emphasis
 */
export function SpaciousCard(props: Omit<CardProps, 'padding'>) {
  return <Card {...props} padding="spacious" />;
}

/**
 * Elevated Card - Stronger shadow for prominence
 */
export function ElevatedCard(props: Omit<CardProps, 'shadow'>) {
  return <Card {...props} shadow="lg" />;
}

/**
 * Flat Card - No shadow for subtle containers
 */
export function FlatCard(props: Omit<CardProps, 'shadow'>) {
  return <Card {...props} shadow="none" />;
}

// ============================================================================
// FIORI CARD PRESETS
// ============================================================================

/**
 * List Card - For displaying lists of object cells
 */
export function ListCard(props: Omit<CardProps, 'padding'>) {
  return <Card {...props} padding="none" />;
}

/**
 * Data Table Card - For key-value data displays
 */
export function DataTableCard(props: CardProps) {
  return <Card {...props} />;
}

/**
 * Object Card - For object previews with header image
 */
export function ObjectCard(props: CardProps) {
  return <Card {...props} />;
}

// ============================================================================
// STYLES
// ============================================================================

const makeStyles = (t: ThemeTokens) => ({
  // Card container
  card: {
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    overflow: 'hidden' as const,
    maxHeight: CARD_MAX_HEIGHT,
  },
  // A flat card has no shadow, so a hairline keeps it apart from the background.
  cardFlat: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border.divider,
  },
  cardPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  cardSelected: {
    borderWidth: 2,
    borderColor: t.brand.tint,
  },
  selectedMark: {
    position: 'absolute' as const,
    top: space.sm,
    right: space.sm,
  },

  // Header
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: touchTarget,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  headerWithDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  headerIcon: {
    width: HEADER_ICON_SIZE,
    height: HEADER_ICON_SIZE,
    borderRadius: radius.button,
    backgroundColor: t.background.base,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: space.md,
  },
  headerTextContainer: {
    flex: 1,
    marginRight: space.sm,
  },
  headerTitle: {
    ...typography.headline,
    color: t.text.primary,
  },
  headerSubtitle: {
    ...typography.subhead,
    color: t.text.secondary,
    marginTop: space.xxs,
  },

  // Status tag
  statusBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.field,
  },
  statusBadgeText: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
  },

  // Body
  body: {
    padding: space.lg,
  },

  // Footer
  footer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: touchTarget,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    gap: space.sm,
  },
  footerWithDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
  },
  footerAction: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: touchTarget,
    paddingHorizontal: space.lg,
    borderRadius: radius.button,
  },
  footerActionDisabled: {
    opacity: t.interaction.disabledOpacity,
  },
  footerActionIcon: {
    marginRight: space.s6,
  },
  footerActionText: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
  },

  // Skeleton
  skeleton: {
    padding: space.lg,
  },
  skeletonHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: space.lg,
  },
  skeletonIcon: {
    width: HEADER_ICON_SIZE,
    height: HEADER_ICON_SIZE,
    borderRadius: radius.button,
    backgroundColor: t.surface.cardActive,
    marginRight: space.md,
  },
  skeletonTextContainer: {
    flex: 1,
  },
  skeletonText: {
    height: 14,
    borderRadius: radius.field,
    backgroundColor: t.surface.cardActive,
  },
  skeletonBody: {
    marginTop: space.sm,
  },

  // Error
  errorContainer: {
    padding: space.lg,
  },
  errorStrip: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: t.status.negative.border,
    backgroundColor: t.status.negative.background,
  },
  errorText: {
    ...typography.subhead,
    flex: 1,
    color: t.status.negative.text,
  },
});

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default Card;

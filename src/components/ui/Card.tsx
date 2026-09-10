/**
 * GCS Mobile App - Card Component (SAP Fiori Design)
 *
 * SAP Fiori Card implementation following:
 * @see design/sap-fiori-specs/13-card.md
 *
 * Features:
 * - Header/Body/Footer anatomy (Fiori Card structure)
 * - Status badges with semantic colors
 * - Loading and error states with skeletons
 * - Pressed state feedback
 * - Platform-specific shadows
 * - 44pt minimum touch targets
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
  TextStyle,
  Platform,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import theme, { Colors } from '@/theme';
import { listColors } from '@/theme/listColors';
import { useTheme } from '@/hooks/useTheme';

// ============================================================================
// FIORI CONSTANTS
// ============================================================================

const FIORI_DIMENSIONS = {
  // Card dimensions
  card: {
    maxHeight: 520,
    minWidth: 280,
    cornerRadius: 12,
    padding: 16,
    spacing: 16,
  },
  // Header
  header: {
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  // Footer
  footer: {
    minHeight: 48,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  // Body
  body: {
    padding: 16,
  },
  // Typography
  typography: {
    title: {
      fontSize: 17,
      fontWeight: '600' as const,
      lineHeight: 22,
    },
    subtitle: {
      fontSize: 14,
      fontWeight: '400' as const,
      lineHeight: 20,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '600' as const,
      lineHeight: 18,
      letterSpacing: 0.5,
    },
  },
  // Shadow (elevation 2 resting, 8 raised)
  shadow: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
    },
    android: {
      elevation: 2,
    },
  }) as ViewStyle,
  shadowRaised: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 8,
    },
    android: {
      elevation: 8,
    },
  }) as ViewStyle,
} as const;

/**
 * Generate theme-aware FIORI colors for Card
 */
function getFioriColors(colors: Colors) {
  return {
    background: colors.fiori.objectCell.background,
    backgroundPressed: colors.fiori.objectCell.backgroundPressed,
    backgroundSelected: colors.fiori.objectCell.backgroundSelected,
    border: colors.fiori.objectCell.divider,
    borderSelected: colors.fiori.objectCell.selectedBorder,
    divider: colors.fiori.objectCell.divider,
    textPrimary: colors.fiori.text.primary,
    textSecondary: colors.fiori.text.secondary,
  };
}

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
    none: 0,
    compact: 12,               // Fiori compact
    default: FIORI_DIMENSIONS.card.padding, // 16pt Fiori default
    comfortable: 20,
    spacious: 24,
  };
  return paddingMap[padding];
}

function getStatusColor(type: CardStatusType): { bg: string; text: string; border: string } {
  switch (type) {
    case 'positive':
      return {
        bg: listColors.statusPositiveLight,
        text: listColors.statusPositiveDark,
        border: listColors.statusPositiveBorder,
      };
    case 'critical':
      return {
        bg: listColors.statusCriticalLight,
        text: listColors.statusCriticalDark,
        border: listColors.statusCriticalBorder,
      };
    case 'negative':
      return {
        bg: listColors.statusNegativeLight,
        text: listColors.statusNegativeDark,
        border: listColors.statusNegativeBorder,
      };
    case 'neutral':
    default:
      return {
        bg: listColors.statusNeutralLight,
        text: listColors.statusNeutralDark,
        border: listColors.statusNeutralBorder,
      };
  }
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/** Card Header */
function CardHeader({ config, showDivider = true, fioriColors }: { config: CardHeaderConfig; showDivider?: boolean; fioriColors: ReturnType<typeof getFioriColors> }) {
  const statusColors = config.status ? getStatusColor(config.status.type) : null;

  return (
    <View style={[styles.header, showDivider && styles.headerWithDivider, showDivider && { borderBottomColor: fioriColors.divider }]}>
      {/* Icon */}
      {config.icon && (
        <View style={styles.headerIcon}>
          <Icon name={config.icon} size={24} color={fioriColors.textPrimary} />
        </View>
      )}

      {/* Title/Subtitle */}
      <View style={styles.headerTextContainer}>
        <Text
          style={[styles.headerTitle, { color: fioriColors.textPrimary }]}
          numberOfLines={2}
          accessibilityRole="header"
        >
          {config.title}
        </Text>
        {config.subtitle && (
          <Text style={[styles.headerSubtitle, { color: fioriColors.textSecondary }]} numberOfLines={1}>
            {config.subtitle}
          </Text>
        )}
      </View>

      {/* Status Badge */}
      {config.status && statusColors && (
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor: statusColors.bg,
              borderColor: statusColors.border,
            },
          ]}
        >
          <Text style={[styles.statusBadgeText, { color: statusColors.text }]}>
            {config.status.label}
          </Text>
        </View>
      )}
    </View>
  );
}

/** Card Footer */
function CardFooter({
  config,
  showDivider = true,
  fioriColors,
  themeColors,
}: {
  config: CardFooterConfig;
  showDivider?: boolean;
  fioriColors: ReturnType<typeof getFioriColors>;
  themeColors: Colors;
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
    <View style={[styles.footer, showDivider && styles.footerWithDivider, showDivider && { borderTopColor: fioriColors.divider }, { justifyContent }]}>
      {config.actions?.map((action, index) => {
        const isPrimary = action.style === 'primary';
        const isSecondary = action.style === 'secondary';
        const isTertiary = action.style === 'tertiary' || !action.style;

        return (
          <Pressable
            key={index}
            onPress={action.onPress}
            disabled={action.disabled || action.loading}
            style={({ pressed }) => [
              styles.footerAction,
              isPrimary && [styles.footerActionPrimary, { backgroundColor: themeColors.primary }],
              isSecondary && [styles.footerActionSecondary, { borderColor: themeColors.primary }],
              isTertiary && styles.footerActionTertiary,
              pressed && styles.footerActionPressed,
              action.disabled && styles.footerActionDisabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel={action.label}
          >
            {action.loading ? (
              <ActivityIndicator
                size="small"
                color={isPrimary ? '#FFFFFF' : themeColors.primary}
              />
            ) : (
              <>
                {action.icon && (
                  <Icon
                    name={action.icon}
                    size={18}
                    color={isPrimary ? '#FFFFFF' : themeColors.primary}
                    style={styles.footerActionIcon}
                  />
                )}
                <Text
                  style={[
                    styles.footerActionText,
                    { color: themeColors.primary },
                    isPrimary && styles.footerActionTextPrimary,
                  ]}
                >
                  {action.label}
                </Text>
              </>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Skeleton Loader */
function CardSkeleton() {
  return (
    <View style={styles.skeleton}>
      {/* Header skeleton */}
      <View style={styles.skeletonHeader}>
        <View style={styles.skeletonIcon} />
        <View style={styles.skeletonTextContainer}>
          <View style={[styles.skeletonText, { width: '60%' }]} />
          <View style={[styles.skeletonText, { width: '40%', marginTop: 4 }]} />
        </View>
      </View>
      {/* Body skeleton */}
      <View style={styles.skeletonBody}>
        <View style={[styles.skeletonText, { width: '100%' }]} />
        <View style={[styles.skeletonText, { width: '80%', marginTop: 8 }]} />
        <View style={[styles.skeletonText, { width: '60%', marginTop: 8 }]} />
      </View>
    </View>
  );
}

/** Error State */
function CardError({ message }: { message?: string }) {
  return (
    <View style={styles.errorContainer}>
      <Icon name="alert-circle-outline" size={32} color={listColors.statusNegative} />
      <Text style={styles.errorText}>
        {typeof message === 'string' ? message : 'Failed to load content'}
      </Text>
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
  const { colors: themeColors } = useTheme();
  const FIORI = getFioriColors(themeColors);

  // Determine if using Fiori structure (header/body/footer) or simple children mode
  const isFioriMode = !!(header || body || footer || loading || error);

  // Container styles
  const containerStyle: ViewStyle = {
    ...styles.card,
    backgroundColor: FIORI.background,
    borderColor: FIORI.border,
    ...(shadow !== 'none' ? FIORI_DIMENSIONS.shadow : {}),
    ...(selected ? { ...FIORI_DIMENSIONS.shadowRaised, borderColor: FIORI.borderSelected, borderWidth: 2 } : {}),
    ...(isPressed ? { backgroundColor: FIORI.backgroundPressed } : {}),
    ...(selected ? { backgroundColor: FIORI.backgroundSelected } : {}),
    ...(style as object),
  };

  // Simple mode: use padding prop
  const simpleContentStyle: ViewStyle = {
    padding: getPaddingValue(padding),
  };

  // Render content
  const renderContent = () => {
    // Loading state
    if (loading) {
      return <CardSkeleton />;
    }

    // Error state
    if (error) {
      return <CardError message={typeof error === 'string' ? error : undefined} />;
    }

    // Fiori structured mode
    if (isFioriMode) {
      return (
        <>
          {header && <CardHeader config={header} showDivider={header.showDivider !== false} fioriColors={FIORI} />}
          <View style={styles.body}>{body || children}</View>
          {footer && footer.actions && footer.actions.length > 0 && (
            <CardFooter config={footer} showDivider={footer.showDivider !== false} fioriColors={FIORI} themeColors={themeColors} />
          )}
        </>
      );
    }

    // Simple children mode (backwards compatible)
    return <View style={simpleContentStyle}>{children}</View>;
  };

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
        accessibilityState={{ selected }}
        testID={testID}
      >
        {renderContent()}
      </Pressable>
    );
  }

  // Static card
  return (
    <View
      style={containerStyle}
      accessibilityLabel={accessibilityLabel || header?.title}
      testID={testID}
    >
      {renderContent()}
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

const styles = StyleSheet.create({
  // Card container
  card: {
    backgroundColor: theme.colors.fiori.objectCell.background,
    borderRadius: FIORI_DIMENSIONS.card.cornerRadius,
    borderWidth: 1,
    borderColor: theme.colors.fiori.objectCell.divider,
    overflow: 'hidden',
    maxHeight: FIORI_DIMENSIONS.card.maxHeight,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: FIORI_DIMENSIONS.header.minHeight,
    paddingVertical: FIORI_DIMENSIONS.header.paddingVertical,
    paddingHorizontal: FIORI_DIMENSIONS.header.paddingHorizontal,
  },
  headerWithDivider: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.fiori.objectCell.divider,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: theme.colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTextContainer: {
    flex: 1,
    marginRight: 8,
  },
  headerTitle: {
    ...FIORI_DIMENSIONS.typography.title,
    color: theme.colors.fiori.text.primary,
  } as TextStyle,
  headerSubtitle: {
    ...FIORI_DIMENSIONS.typography.subtitle,
    color: theme.colors.fiori.text.secondary,
    marginTop: 2,
  } as TextStyle,

  // Status badge
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Body
  body: {
    padding: FIORI_DIMENSIONS.body.padding,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: FIORI_DIMENSIONS.footer.minHeight,
    paddingVertical: FIORI_DIMENSIONS.footer.paddingVertical,
    paddingHorizontal: FIORI_DIMENSIONS.footer.paddingHorizontal,
    gap: 8,
  },
  footerWithDivider: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.fiori.objectCell.divider,
  },
  footerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  footerActionPrimary: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 16,
  },
  footerActionSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.primary,
    paddingHorizontal: 16,
  },
  footerActionTertiary: {
    backgroundColor: 'transparent',
  },
  footerActionPressed: {
    opacity: 0.7,
  },
  footerActionDisabled: {
    opacity: 0.4,
  },
  footerActionIcon: {
    marginRight: 6,
  },
  footerActionText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  footerActionTextPrimary: {
    color: '#FFFFFF',
  },

  // Skeleton
  skeleton: {
    padding: FIORI_DIMENSIONS.body.padding,
  },
  skeletonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  skeletonIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: theme.colors.gray[200],
    marginRight: 12,
  },
  skeletonTextContainer: {
    flex: 1,
  },
  skeletonText: {
    height: 14,
    borderRadius: 4,
    backgroundColor: theme.colors.gray[200],
  },
  skeletonBody: {
    marginTop: 8,
  },

  // Error
  errorContainer: {
    padding: FIORI_DIMENSIONS.body.padding,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
  },
  errorText: {
    fontSize: 14,
    color: theme.colors.fiori.text.secondary,
    marginTop: 8,
    textAlign: 'center',
  },
});

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default Card;

/**
 * Error Boundary Component
 *
 * Catches JavaScript errors anywhere in the component tree and shows the
 * error state from docs/STYLE_GUIDE.md §13.6: an alert icon in negative text,
 * "Something went wrong", a plain-language cause and a "Try again" button.
 * Stack traces are shown in development builds only.
 *
 * Also exports the building blocks other full-screen and error states share:
 * `ErrorStateView` (the error layout) and `StateActionButton` (primary,
 * secondary and tertiary buttons that depend on nothing but the tokens, so
 * they still render when the component that crashed is a shared one).
 */

import type { ErrorInfo, ReactNode } from 'react';
import React, { Component } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { createLogger } from '@/utils/logger';
import { captureException } from '@/config/sentryConfig';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

// ============================================================================
// Action button (tokens only)
// ============================================================================

export type StateActionVariant = 'primary' | 'secondary' | 'tertiary';

export interface StateActionButtonProps {
  label: string;
  onPress: () => void;
  variant?: StateActionVariant;
  icon?: IconName;
  loading?: boolean;
  loadingLabel?: string;
  disabled?: boolean;
  /** Stretch to the container width (bottom action of a full-screen state). */
  fullWidth?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

const makeButtonStyles = (t: ThemeTokens) => ({
  base: {
    minHeight: touchTarget,
    minWidth: 120,
    borderRadius: radius.button,
    paddingHorizontal: space.xl,
    paddingVertical: space.sm,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.sm,
  },
  fullWidth: { alignSelf: 'stretch' as const },
  primary: { backgroundColor: t.brand.fill },
  primaryPressed: { backgroundColor: t.brand.fillPressed },
  secondary: { borderWidth: 1, borderColor: t.border.button, backgroundColor: 'transparent' },
  secondaryPressed: { backgroundColor: t.brand.subtle },
  tertiary: { backgroundColor: 'transparent' },
  tertiaryPressed: { backgroundColor: t.brand.subtle },
  disabled: { opacity: t.interaction.disabledOpacity },
  label: { ...typography.callout, textAlign: 'center' as const },
  labelPrimary: { color: t.brand.onFill },
  labelOther: { color: t.brand.tint },
});

export function StateActionButton({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  loadingLabel,
  disabled = false,
  fullWidth = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: StateActionButtonProps) {
  const styles = useThemedStyles(makeButtonStyles);
  const t = useTokens();
  const isDisabled = disabled || loading;
  const contentColor = variant === 'primary' ? t.brand.onFill : t.brand.tint;
  const pressedStyle =
    variant === 'primary' ? styles.primaryPressed : variant === 'secondary' ? styles.secondaryPressed : styles.tertiaryPressed;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        fullWidth && styles.fullWidth,
        pressed && !isDisabled && pressedStyle,
        isDisabled && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={contentColor} />
      ) : (
        icon && <MaterialCommunityIcons name={icon} size={iconSize.lg} color={contentColor} />
      )}
      <Text style={[styles.label, variant === 'primary' ? styles.labelPrimary : styles.labelOther]}>
        {loading && loadingLabel ? loadingLabel : label}
      </Text>
    </Pressable>
  );
}

// ============================================================================
// Error state layout
// ============================================================================

export interface ErrorStateViewProps {
  /** Title; defaults to "Something went wrong". */
  title?: string;
  /** Plain-language cause and what to do next. */
  message: string;
  /** Glyph; defaults to `alert-circle-outline`. */
  icon?: IconName;
  /** Error shown in development builds only. */
  error?: Error | null;
  /** Component stack shown in development builds only. */
  componentStack?: string | null;
  onRetry?: () => void;
  /** Defaults to "Try again". */
  retryLabel?: string;
  retryAccessibilityLabel?: string;
  retryAccessibilityHint?: string;
  /** Optional extra low-emphasis action, such as going back to a list. */
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  secondaryActionAccessibilityLabel?: string;
  /**
   * `screen` fills the screen (safe areas, status bar, hero icon).
   * `inline` fills its container, for lists and sections.
   */
  presentation?: 'screen' | 'inline';
}

const makeStateStyles = (t: ThemeTokens) => ({
  screen: { flex: 1, backgroundColor: t.background.base },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.xxxl,
  },
  column: { width: '100%' as const, maxWidth: layout.maxFormWidth, alignItems: 'center' as const },
  icon: { marginBottom: space.lg },
  titleScreen: { ...typography.title2, color: t.text.primary, textAlign: 'center' as const, marginBottom: space.sm },
  titleInline: { ...typography.title3, color: t.text.primary, textAlign: 'center' as const, marginBottom: space.sm },
  message: { ...typography.body, color: t.text.secondary, textAlign: 'center' as const, marginBottom: space.xxl },
  actions: { alignItems: 'center' as const, gap: space.sm },
  devDetails: {
    alignSelf: 'stretch' as const,
    backgroundColor: t.status.negative.background,
    borderColor: t.status.negative.border,
    borderWidth: 1,
    borderRadius: radius.button,
    padding: space.md,
    marginBottom: space.xxl,
  },
  devTitle: { ...typography.footnote, fontWeight: fontWeight.semibold, color: t.status.negative.text, marginBottom: space.xs },
  devText: {
    ...typography.caption1,
    color: t.text.primary,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
  },
});

export function ErrorStateView({
  title = 'Something went wrong',
  message,
  icon = 'alert-circle-outline',
  error,
  componentStack,
  onRetry,
  retryLabel = 'Try again',
  retryAccessibilityLabel,
  retryAccessibilityHint,
  secondaryActionLabel,
  onSecondaryAction,
  secondaryActionAccessibilityLabel,
  presentation = 'screen',
}: ErrorStateViewProps) {
  const styles = useThemedStyles(makeStateStyles);
  const t = useTokens();
  const isScreen = presentation === 'screen';

  const body = (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.column}>
        <MaterialCommunityIcons
          name={icon}
          size={isScreen ? iconSize.hero : iconSize.xl}
          color={t.status.negative.text}
          style={styles.icon}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <Text style={isScreen ? styles.titleScreen : styles.titleInline} accessibilityRole="header">
          {title}
        </Text>
        <Text style={styles.message}>{message}</Text>

        {__DEV__ && error ? (
          <View style={styles.devDetails}>
            <Text style={styles.devTitle}>Details (development builds only)</Text>
            <Text style={styles.devText} selectable>
              {error.toString()}
            </Text>
            {componentStack ? (
              <Text style={styles.devText} numberOfLines={10} selectable>
                {componentStack}
              </Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.actions}>
          {onRetry && (
            <StateActionButton
              variant="secondary"
              icon="refresh"
              label={retryLabel}
              onPress={onRetry}
              accessibilityLabel={retryAccessibilityLabel}
              accessibilityHint={retryAccessibilityHint}
            />
          )}
          {secondaryActionLabel && onSecondaryAction && (
            <StateActionButton
              variant="tertiary"
              label={secondaryActionLabel}
              onPress={onSecondaryAction}
              accessibilityLabel={secondaryActionAccessibilityLabel}
            />
          )}
        </View>
      </View>
    </ScrollView>
  );

  if (!isScreen) return <View style={styles.screen}>{body}</View>;

  return (
    <SafeAreaView style={styles.screen}>
      <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />
      {body}
    </SafeAreaView>
  );
}

// ============================================================================
// Error boundary
// ============================================================================

const errorBoundaryLogger = createLogger('ErrorBoundary');

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    errorBoundaryLogger.error('Caught error:', error);
    errorBoundaryLogger.error('Error info:', errorInfo);

    // Send to GlitchTip crash reporting
    captureException(error, {
      componentStack: errorInfo.componentStack,
      source: 'ErrorBoundary',
    });

    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <ErrorStateView
          message="The app ran into a problem and couldn't show this screen. Try again. If it keeps happening, restart the app."
          error={this.state.error}
          componentStack={this.state.errorInfo?.componentStack}
          onRetry={this.handleReset}
          retryAccessibilityHint="Reloads the screen"
        />
      );
    }

    return this.props.children;
  }
}

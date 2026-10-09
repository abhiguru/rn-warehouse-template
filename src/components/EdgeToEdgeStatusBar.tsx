import React, { useEffect, useRef } from 'react';
import {
  Platform,
  StatusBar,
  type StatusBarStyle,
} from 'react-native';
import { useTokens } from '@/hooks/useTheme';

interface EdgeToEdgeStatusBarProps {
  /**
   * Status bar icon style. Pass `tokens.statusBarStyle` (docs/STYLE_GUIDE.md
   * §5.2). When omitted, the current theme's `statusBarStyle` is used.
   */
  barStyle?: StatusBarStyle;
  animated?: boolean;
  active?: boolean;
}

interface StatusBarEntry {
  barStyle: StatusBarStyle;
  animated: boolean;
}

const entries: StatusBarEntry[] = [];

function applyTopEntry() {
  if (Platform.OS === 'web') return;

  const entry = entries[entries.length - 1];
  if (entry) {
    StatusBar.setBarStyle(entry.barStyle, entry.animated);
  }
}

interface AppliedStatusBarProps {
  barStyle: StatusBarStyle;
  animated: boolean;
  active: boolean;
}

/** Pushes one entry on the local stack while mounted and active. */
function AppliedStatusBar({ barStyle, animated, active }: AppliedStatusBarProps) {
  const entryRef = useRef<StatusBarEntry>({ barStyle, animated });

  useEffect(() => {
    const entry = entryRef.current;
    const existingIndex = entries.indexOf(entry);
    const wasTopEntry = existingIndex === entries.length - 1;

    entry.barStyle = barStyle;
    entry.animated = animated;

    if (!active) {
      if (existingIndex !== -1) {
        entries.splice(existingIndex, 1);
        if (wasTopEntry) applyTopEntry();
      }
      return;
    }

    if (existingIndex === -1) entries.push(entry);
    if (entries[entries.length - 1] === entry) applyTopEntry();
  }, [active, animated, barStyle]);

  useEffect(() => {
    const entry = entryRef.current;
    return () => {
      const index = entries.lastIndexOf(entry);
      if (index === -1) return;

      const wasTopEntry = index === entries.length - 1;
      entries.splice(index, 1);
      if (wasTopEntry) applyTopEntry();
    };
  }, []);

  return null;
}

/** Applies the theme's status bar style (light icons in dark mode, dark icons in light mode). */
function ThemedStatusBar({ animated, active }: Omit<AppliedStatusBarProps, 'barStyle'>) {
  const t = useTokens();
  return <AppliedStatusBar barStyle={t.statusBarStyle} animated={animated} active={active} />;
}

/**
 * Applies only the status-bar style API supported by Android edge-to-edge.
 * The local stack restores the previous style when a screen or modal unmounts.
 */
export function EdgeToEdgeStatusBar({
  barStyle,
  animated = false,
  active = true,
}: EdgeToEdgeStatusBarProps) {
  if (barStyle === undefined) {
    return <ThemedStatusBar animated={animated} active={active} />;
  }
  return <AppliedStatusBar barStyle={barStyle} animated={animated} active={active} />;
}

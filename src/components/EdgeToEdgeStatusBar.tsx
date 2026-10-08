import { useEffect, useRef } from 'react';
import {
  Platform,
  StatusBar,
  type StatusBarStyle,
} from 'react-native';

interface EdgeToEdgeStatusBarProps {
  barStyle: StatusBarStyle;
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

/**
 * Applies only the status-bar style API supported by Android edge-to-edge.
 * The local stack restores the previous style when a screen or modal unmounts.
 */
export function EdgeToEdgeStatusBar({
  barStyle,
  animated = false,
  active = true,
}: EdgeToEdgeStatusBarProps) {
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

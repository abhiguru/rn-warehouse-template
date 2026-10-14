/**
 * The A-Z rail of the Customers list: a vertical strip of letters for quick navigation.
 * It lives here, not in app/customers.tsx, because a route file exports only its screen.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useThemedStyles } from '@/hooks/useTheme';
import { useHaptics } from '@/hooks/useHaptics';
import { fontWeight, radius, space, typography, type ThemeTokens } from '@/theme/tokens';
import { t as tr } from '@/i18n';

interface AlphabeticalRailProps {
  letters: string[];
  availableLetters: Set<string>;
  activeLetter: string | null;
  onLetterPress: (letter: string) => void;
}

/** The rail entry under a finger `y` dp from the top of the rail; the ends hold. */
export function letterAtOffset(y: number, railHeight: number, letters: string[]): string | undefined {
  if (railHeight <= 0 || letters.length === 0) return undefined;
  const index = Math.floor(y / (railHeight / letters.length));
  return letters[Math.min(letters.length - 1, Math.max(0, index))];
}

/**
 * The A–Z rail (style guide §9): a tap jumps to a letter, and a finger drawn
 * down the rail scrubs through the letters, with a selection haptic each time
 * the letter changes. Letters without customers stay visible but do nothing.
 */
export function AlphabeticalRail({
  letters,
  availableLetters,
  activeLetter,
  onLetterPress,
}: AlphabeticalRailProps) {
  const styles = useThemedStyles(makeStyles);
  const { selection } = useHaptics();
  const [railHeight, setRailHeight] = useState(0);
  // The letter last reached, so a finger resting on one letter calls once.
  const lastLetter = useRef<string | null>(null);

  const reach = useCallback(
    (letter: string | undefined) => {
      if (!letter || letter === lastLetter.current) return;
      lastLetter.current = letter;
      if (!availableLetters.has(letter)) return;
      selection();
      onLetterPress(letter);
    },
    [availableLetters, onLetterPress, selection]
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onUpdate((event) => reach(letterAtOffset(event.y, railHeight, letters)))
        .onFinalize(() => {
          lastLetter.current = null;
        }),
    [reach, railHeight, letters]
  );

  return (
    <GestureDetector gesture={pan}>
      <View
        style={styles.alphabetRail}
        hitSlop={{ left: space.xs, right: space.xs }}
        onLayout={(event: LayoutChangeEvent) => setRailHeight(event.nativeEvent.layout.height)}
      >
        {letters.map((letter) => {
          const hasLoadedCustomers = availableLetters.has(letter);
          const isActive = activeLetter === letter;

          return (
            <Pressable
              key={letter}
              onPress={() => {
                lastLetter.current = letter;
                if (!hasLoadedCustomers) return;
                selection();
                onLetterPress(letter);
              }}
              style={[styles.letterItem, isActive && styles.letterItemActive]}
              accessibilityRole="button"
              accessibilityLabel={tr('customers.list.jumpTo', { letter })}
              accessibilityState={{ disabled: !hasLoadedCustomers, selected: isActive }}
            >
              <Text
                style={[
                  styles.letterText,
                  !hasLoadedCustomers && styles.letterTextDisabled,
                  isActive && styles.letterTextActive,
                ]}
                maxFontSizeMultiplier={1.2}
              >
                {letter}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </GestureDetector>
  );
}

const makeStyles = (t: ThemeTokens) => ({
  alphabetRail: {
    position: 'absolute' as const,
    right: space.xxs,
    top: 0,
    bottom: 0,
    width: 44,
    justifyContent: 'space-evenly' as const,
    alignItems: 'center' as const,
  },
  letterItem: {
    width: 44,
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  letterItemActive: {
    backgroundColor: t.brand.fill,
    borderRadius: radius.button,
  },
  letterText: {
    ...typography.footnote,
    fontWeight: fontWeight.bold,
    textAlign: 'center' as const,
    color: t.brand.tint,
  },
  letterTextDisabled: {
    color: t.text.disabled,
  },
  letterTextActive: {
    color: t.brand.onFill,
  },
});

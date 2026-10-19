/**
 * A row of the line table (the heading or a line), which scrolls sideways (style guide 13.7, owner decision 2026-10-19).
 * Every row and the heading of one open card show the same offset: a Reanimated shared value per card
 * (`TableScroll`), so the columns line up and nothing re-renders while the finger moves. The rows stay parts of the
 * page's virtualized list; each one draws its pinned Dispatch cell (given as `pinned`, which never moves) and a viewport:
 *
 * - the horizontal pan covers the whole row, the pinned cell included, so a swipe that starts there moves the table;
 * - a clipped view (`overflow: hidden`) whose inner row of cells, `content` wide, is moved by `translateX: -offset`
 *   on the UI thread (a tap on a cell hits the cell where it is drawn: the move is a native transform);
 * - a horizontal pan (react-native-gesture-handler, `activeOffsetX` and `failOffsetY`, so an up-down swipe fails the
 *   pan and scrolls the page as before) that sets the offset, held between 0 and `content - viewport`, and lets
 *   go with a decay (`withDecay`, clamped the same);
 * - edge cues, when more columns are off to the left or the right: a fade (one `LinearGradient` from the row's
 *   fill to clear) and a ◂ / ▸, shown by the offset alone (`useAnimatedStyle`), in theme tokens.
 *
 * The viewport's width is measured by the view itself and written to the card's shared `viewport` value, which the
 * clamp and the cues read. `scrollToReveal` moves the offset (animated) so a column is fully visible.
 * Rows are recycled by the list: the parent gives this component a `key` that follows the card.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, makeMutable, useAnimatedReaction, useAnimatedStyle, useSharedValue, withDecay, withTiming, type SharedValue } from 'react-native-reanimated';
import { useTokens } from '@/hooks/useTheme';
import { space, typography } from '@/theme/tokens';
import { revealOffset } from './sidewaysScroll';

/** One open card's sideways position and the width of its visible part (0 until a row has been laid out). */
export interface TableScroll {
  offset: SharedValue<number>;
  viewport: SharedValue<number>;
}
/** A card's scroll values; made outside a component (the editor keeps one per card for its life). */
export const makeTableScroll = (): TableScroll => ({ offset: makeMutable(0), viewport: makeMutable(0) });

/** A horizontal move of this many dp starts the pan; this much up or down fails it (the page scrolls). */
const PAN_SLOP = 10;
/** The decay of a fling (Reanimated's default is 0.998; a table of nine columns wants a little less drift). */
const FLING_DECELERATION = 0.997;
/** The cue is fully shown from this many dp of scroll away from its edge. */
const CUE_RAMP = 24;
/** The fade at an edge: from the row's fill, this opaque at each step inward (one gradient, steps of FADE_STEP dp), to clear. */
const FADE_ALPHAS = ['F2', 'B3', '66', '26', '00'] as const;
const FADE_STEP = 5;
const CUE_WIDTH = (FADE_ALPHAS.length - 1) * FADE_STEP;
/** Room left beside a column that is brought into view, on a side with no cue. */
const REVEAL_PAD = 8;
/** ...and on a side with columns beyond it, where a cue shows: the cell is clear of the fade and the glyph. */
const REVEAL_PAD_CUE = CUE_WIDTH + space.xs;
const REVEAL_MS = 200;

/**
 * Moves a card's offset (animated) so that the column [`left`, `left + width`) is fully visible; nothing moves when it
 * is already. A row that has just been drawn (the Next key opened its card) has not been measured yet, so the layout's
 * estimate of the visible width (`estimate`) stands in until it is.
 */
export function scrollToReveal(scroll: TableScroll, content: number, left: number, width: number, estimate: number): void {
  const viewport = scroll.viewport.value > 0 ? scroll.viewport.value : estimate;
  if (viewport <= 0) return;
  const current = scroll.offset.value;
  const padStart = left > 0 ? REVEAL_PAD_CUE : REVEAL_PAD;
  const padEnd = left + width < content ? REVEAL_PAD_CUE : REVEAL_PAD;
  const target = revealOffset(current, viewport, content, left, width, padStart, padEnd);
  if (Math.abs(target - current) < 0.5) return;
  cancelAnimation(scroll.offset);
  scroll.offset.value = withTiming(target, { duration: REVEAL_MS });
}

interface CueProps {
  side: 'left' | 'right';
  fill: string;
  glyphColor: string;
  style: React.ComponentProps<typeof Animated.View>['style'];
}

/** The fade and the ◂ / ▸ at one edge; its opacity (0 to 1) is the animated `style`. */
function EdgeCue({ side, fill, glyphColor, style }: CueProps) {
  const left = side === 'left';
  // Hex fills only (the theme's); the alpha is two more digits.
  const colors = (left ? [...FADE_ALPHAS] : [...FADE_ALPHAS].reverse()).map((alpha) => `${fill}${alpha}`) as [string, string, ...string[]];
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[cueStyles.cue, left ? cueStyles.left : cueStyles.right, style]}
    >
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      <Text allowFontScaling={false} style={[typography.caption1, left ? cueStyles.glyphLeft : cueStyles.glyphRight, { color: glyphColor }]}>
        {left ? '◂' : '▸'}
      </Text>
    </Animated.View>
  );
}

interface Props {
  scroll: TableScroll;
  /** The width of the cells together. */
  content: number;
  /** The colour behind the cells (the row's or the heading's), which the edge fade blends into. */
  fill: string;
  /** The row itself: its layout style and test id; the pan covers all of it. */
  rowStyle: StyleProp<ViewStyle>;
  testID?: string;
  /** The pinned cell at the left, which stays where it is. */
  pinned: React.ReactNode;
  children: React.ReactNode;
}

// Not memoized: `pinned` and `children` are new elements on every render, so a memo would never skip.
export function SidewaysViewport({ scroll, content, fill, rowStyle, testID, pinned, children }: Props) {
  const t = useTokens();
  const { offset, viewport } = scroll;
  const start = useSharedValue(0);
  const flinging = useSharedValue(false);
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-PAN_SLOP, PAN_SLOP])
        .failOffsetY([-PAN_SLOP, PAN_SLOP])
        // A touch stops a fling at once (only a fling: a reveal that is running is left to finish); the pan then
        // moves the offset from where it stood when it began.
        .onBegin(() => {
          if (flinging.value) {
            flinging.value = false;
            cancelAnimation(offset);
          }
        })
        .onStart(() => {
          start.value = offset.value;
        })
        .onUpdate((event) => {
          const max = Math.max(0, content - viewport.value);
          offset.value = Math.min(Math.max(start.value - event.translationX, 0), max);
        })
        .onEnd((event) => {
          const max = Math.max(0, content - viewport.value);
          flinging.value = true;
          offset.value = withDecay({ velocity: -event.velocityX, clamp: [0, max], deceleration: FLING_DECELERATION }, () => {
            'worklet';
            // The fling is over (or was cut short): a later touch has nothing to stop, so it cannot cancel a focus reveal.
            flinging.value = false;
          });
        }),
    [offset, viewport, start, flinging, content]
  );
  // The content or the viewport shrinks (text size, rotation, a column left out): the offset is held in range.
  useAnimatedReaction(
    () => Math.max(0, content - viewport.value),
    (max) => {
      if (offset.value > max) {
        cancelAnimation(offset);
        offset.value = max;
      }
    },
    [content]
  );
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: -offset.value }] }), [offset]);
  const leftCue = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, offset.value / CUE_RAMP)) }), [offset]);
  const rightCue = useAnimatedStyle(
    () => ({ opacity: viewport.value > 0 ? Math.min(1, Math.max(0, (content - viewport.value - offset.value) / CUE_RAMP)) : 0 }),
    [offset, viewport, content]
  );
  const onLayout = (event: LayoutChangeEvent) => {
    viewport.value = event.nativeEvent.layout.width;
  };
  return (
    <GestureDetector gesture={pan}>
      <View style={rowStyle} testID={testID} collapsable={false}>
        {pinned}
        <View style={styles.viewport} onLayout={onLayout} collapsable={false}>
          <Animated.View style={[styles.cells, { width: content }, slide]}>{children}</Animated.View>
          <EdgeCue side="left" fill={fill} glyphColor={t.text.secondary} style={leftCue} />
          <EdgeCue side="right" fill={fill} glyphColor={t.text.secondary} style={rightCue} />
        </View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1, minWidth: 0, alignSelf: 'stretch', overflow: 'hidden' },
  cells: { flexDirection: 'row', flexGrow: 1 },
});

const cueStyles = StyleSheet.create({
  cue: { position: 'absolute', top: 0, bottom: 0, width: CUE_WIDTH, justifyContent: 'center' },
  left: { left: 0 },
  right: { right: 0 },
  glyphLeft: { textAlign: 'left', paddingLeft: 2 },
  glyphRight: { textAlign: 'right', paddingRight: 2 },
});

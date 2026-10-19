/**
 * Layout motion shared by lists whose rows open (style guide §9): one 200 ms change, skipped under
 * Reduce Motion. Only for one row at a time: opening every row of a long list is not animated.
 */
import { LayoutAnimation, type LayoutAnimationConfig } from 'react-native';
import { motion } from '@/theme/tokens';

/** Opening or closing a section (§9): 200 ms, ease-out in, ease-in out. */
export const EXPAND_ANIMATION: LayoutAnimationConfig = {
  duration: motion.standard,
  create: { type: LayoutAnimation.Types.easeOut, property: LayoutAnimation.Properties.opacity },
  update: { type: LayoutAnimation.Types.easeInEaseOut },
  delete: { type: LayoutAnimation.Types.easeIn, property: LayoutAnimation.Properties.opacity },
};

/** Animates the next layout change as an expanding section, unless Reduce Motion is on. */
export const animateExpand = (reduceMotion: boolean): void => {
  if (!reduceMotion) LayoutAnimation.configureNext(EXPAND_ANIMATION);
};

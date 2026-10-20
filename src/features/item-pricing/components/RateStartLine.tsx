/**
 * The "From <date>" line at the top of a rate box, drawn as the GRN Change rate screen draws its dates line (a rounded
 * pill with a calendar). It is 48 dp tall in every state, so the first tap on a + or − never moves what is below it.
 *  - at rest (nothing changed yet): the rate's own start as a fixed fact, a filled pill (`caption`, "Lots received
 *    since 1 Apr 2026"; for a planned rate being edited, its start day);
 *  - a correction (`fixed`): the rate's own start day, a filled pill with a locked calendar; it cannot be chosen;
 *  - being edited (`editing`: something in the box is changed, or it is a new rate): the day the new rate starts, an
 *    outlined pill that opens the choice (StartsOnField: Today, the next chips, Other date with the calendar). The
 *    choice opens on a tap, when the page's Save bar asks for it (`openSignal`) and after a refused save, never by
 *    itself. The rules on which days are allowed (a manager may start in the past) are StartsOnField's and the
 *    editor's.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { iconSize, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import type { StartsOnChoice } from '../editModel';
import { dateText } from '../rateText';
import { type FieldNode, type FieldRegistry } from './fieldLink';
import { StartsOnField } from './StartsOnField';

interface Props {
  /** The start day of the rate being edited (null: not chosen yet). */
  day: string | null;
  choice: StartsOnChoice | null;
  today: string;
  earliest?: string | null;
  canStartInPast: boolean;
  /** The day is the rate's own (a correction). */
  fixed: boolean;
  /** The box is changed (or is a new rate): the day can be chosen. False: the line is a fact, not a control. */
  editing: boolean;
  /** At rest: since when the rate in force applies. */
  caption?: string;
  error?: string;
  onChange: (choice: StartsOnChoice, day: string) => void;
  /** The page's cell registry, so a refused day can be scrolled into view. */
  fields?: FieldRegistry;
  /** Changes when the page's Save bar asks for the day choice (its "Choose a start date." link): the choice opens. */
  openSignal?: number;
  testID: string;
}

const makeStyles = (th: ThemeTokens) => ({
  wrap: { gap: space.sm },
  // Both looks share one geometry (same height, same border width), so the line does not change size when it turns
  // from a fact into a control.
  // A fixed fact: filled, no visible border (the GRN dates pill).
  fact: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    minHeight: touchTarget,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: th.table.insetFill,
  },
  // Something that opens: outlined, with an accent chevron.
  toggle: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    minHeight: touchTarget,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: th.border.button,
  },
  refused: { borderColor: th.status.negative.border },
  text: { ...typography.subhead, fontWeight: '600' as const, color: th.text.primary, flex: 1 },
  error: { ...typography.footnote, color: th.status.negative.text },
});

export function RateStartLine({ day, choice, today, earliest, canStartInPast, fixed, editing, caption, error, onChange, fields, openSignal = 0, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
  const th = useTokens();
  const [open, setOpen] = useState(false);
  const anchor = useRef<View>(null);

  // A refused save scrolls to the day: register the line under the key the editor names it by.
  useEffect(() => {
    if (!fields) return undefined;
    const node: FieldNode = {
      focus: () => undefined,
      measureInWindow: callback => anchor.current?.measureInWindow(callback),
    };
    fields.register('startsOn', node);
    return () => fields.register('startsOn', null);
  }, [fields]);

  // The choice opens when a refused save names the day, or when the Save bar's link asks for it; it closes with the
  // change (the box is back to rest).
  const refused = editing && !fixed && !!error;
  useEffect(() => {
    if (refused) setOpen(true);
  }, [refused]);
  useEffect(() => {
    if (openSignal > 0 && editing && !fixed) setOpen(true);
    // Only a new request opens it: a later change of `editing` must not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal]);
  useEffect(() => {
    if (!editing) setOpen(false);
  }, [editing]);

  if (!editing || fixed) {
    const text = fixed ? t('pricing.box.datesFrom', { date: day ? dateText(day) : '—' }) : caption ?? (day ? t('pricing.box.datesFrom', { date: dateText(day) }) : null);
    if (!text) return null;
    return (
      <View ref={anchor} style={styles.fact} accessible accessibilityLabel={text} testID={testID}>
        <Icon name={fixed ? 'calendar-lock' : 'calendar'} size={iconSize.sm} color={th.icon.secondary} />
        <Text style={styles.text} numberOfLines={2} testID={`${testID}-text`}>{text}</Text>
      </View>
    );
  }

  const text = day ? t('pricing.box.datesFrom', { date: dateText(day) }) : t('pricing.edit.startsOn');
  const showRefused = !open && !!error;
  return (
    <View ref={anchor} style={styles.wrap} testID={testID}>
      <Pressable
        style={[styles.toggle, showRefused && styles.refused]}
        onPress={() => setOpen(o => !o)}
        accessibilityRole="button"
        accessibilityLabel={text}
        accessibilityHint={error ?? t('pricing.edit.chooseDate')}
        accessibilityState={{ expanded: open }}
        testID={`${testID}-toggle`}
      >
        <Icon name="calendar" size={iconSize.sm} color={th.brand.tint} />
        <Text style={styles.text} numberOfLines={2} testID={`${testID}-text`}>{text}</Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={iconSize.md} color={th.brand.tint} />
      </Pressable>
      {showRefused ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
      {open ? (
        <StartsOnField
          choice={choice}
          day={day}
          today={today}
          earliest={earliest}
          canStartInPast={canStartInPast}
          error={error}
          onChange={onChange}
          hideLabel
        />
      ) : null}
    </View>
  );
}

export default RateStartLine;

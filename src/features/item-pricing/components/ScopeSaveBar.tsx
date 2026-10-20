/**
 * The Save bar of the rate boxes, drawn by the page from what ScopeRates reports (`onBar`): the lots rule, the
 * live "What changes" lines, and Discard / Save. It sits outside the page's scroll view; with the keyboard up
 * (`collapsed`) it keeps only the two buttons, so the cell being typed in stays in view. The start day is not chosen
 * here: it is the "From <date>" line at the top of the rate box (RateStartLine). While no day is chosen the bar says
 * so, and that line is a link to the choice (`chooseStart`); `startsOn` stays in the report as the state of that
 * choice.
 */
import React from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useThemedStyles } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { space, typography, type ThemeTokens } from '@/theme/tokens';
import type { StartsOnChoice } from '../editModel';
import { ChangeSummary } from './ChangeSummary';
import { EditorStrip } from './EditorStrip';
import { RateSaveBar } from './RateSaveBar';

/** What the page's Save bar shows for the box being edited (and the state of its start-day choice, drawn in the box). Every function keeps its identity between reports. */
export interface RateSaveBarState {
  /** The start-day choice of the box. The Save bar does not draw it (the box's "From <date>" line does); the page's tests and the report's signature read it. */
  startsOn: {
    choice: StartsOnChoice | null;
    day: string | null;
    today: string;
    canStartInPast: boolean;
    fixed: boolean;
    onChange: (choice: StartsOnChoice, day: string) => void;
  };
  /** "Lots received from 1 Nov 2026 are charged the new rate. Lots received before keep ₹11.00." */
  rule: string | null;
  /** The start day is in the past (a manager's choice): lots already received will be charged the new rate. */
  warning: string | null;
  summaryLines: string[];
  /** Offline, or no start day yet. */
  helper: string | null;
  /** The helper asks for a start day: tapping it scrolls the box's "From <date>" line into view and opens the choice. Null: the helper is plain text. */
  chooseStart: (() => void) | null;
  saveLabel: string;
  save: { onPress: () => void; disabled: boolean; loading: boolean };
  discard: { onPress: () => void };
}

interface Props {
  bar: RateSaveBarState;
  collapsed?: boolean;
  onHeight?: (height: number) => void;
}

const makeStyles = (th: ThemeTokens) => ({
  content: { gap: space.sm },
  rule: { ...typography.subhead, color: th.text.secondary },
});

export function ScopeSaveBar({ bar, collapsed = false, onHeight }: Props) {
  const styles = useThemedStyles(makeStyles);
  // The content may be long (a rate of ten bands has ten lines): it scrolls inside, the buttons stay in view.
  const { height } = useWindowDimensions();
  return (
    <RateSaveBar
      helper={bar.helper}
      onHelperPress={bar.chooseStart ?? undefined}
      primary={{
        label: bar.saveLabel,
        onPress: bar.save.onPress,
        disabled: bar.save.disabled,
        loading: bar.save.loading,
        loadingText: t('pricing.edit.saving'),
      }}
      discard={{ label: t('pricing.box.discard'), onPress: bar.discard.onPress }}
      collapsed={collapsed}
      onHeight={onHeight}
    >
      <ScrollView style={{ maxHeight: height * 0.4 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
        {bar.rule ? <Text style={styles.rule}>{bar.rule}</Text> : null}
        {bar.warning ? <EditorStrip variant="warning" message={bar.warning} /> : null}
        <View>
          <ChangeSummary lines={bar.summaryLines} />
        </View>
      </ScrollView>
    </RateSaveBar>
  );
}

export default ScopeSaveBar;

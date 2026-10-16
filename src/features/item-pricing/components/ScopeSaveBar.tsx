/**
 * The Save bar of the rate boxes, drawn by the page from what ScopeRates reports (`onBar`): the start day, the lots
 * rule, the live "What changes" lines, and Discard / Save. It sits outside the page's scroll view; with the keyboard up
 * (`collapsed`) it keeps only the two buttons, so the cell being typed in stays in view.
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
import { StartsOnField } from './StartsOnField';

/** What the page's Save bar shows for the box being edited. Every function keeps its identity between reports. */
export interface RateSaveBarState {
  startsOn: {
    choice: StartsOnChoice | null;
    day: string | null;
    today: string;
    earliest?: string | null;
    canStartInPast: boolean;
    fixed: boolean;
    error?: string;
    onChange: (choice: StartsOnChoice, day: string) => void;
  };
  /** "Lots received from 1 Nov 2026 are charged the new rate. Lots received before keep ₹11.00." */
  rule: string | null;
  /** The start day is in the past (a manager's choice): lots already received will be charged the new rate. */
  warning: string | null;
  summaryLines: string[];
  /** Offline, or no start day yet. */
  helper: string | null;
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
        <StartsOnField
          choice={bar.startsOn.choice}
          day={bar.startsOn.day}
          today={bar.startsOn.today}
          earliest={bar.startsOn.earliest}
          canStartInPast={bar.startsOn.canStartInPast}
          fixed={bar.startsOn.fixed}
          error={bar.startsOn.error}
          onChange={bar.startsOn.onChange}
        />
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

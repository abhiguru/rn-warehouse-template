/**
 * FactLines: the short facts under the title of a report row ("3 items", "2 GRNs").
 *
 * English joins them with " · " on one line, as the rows always did. Gujarati
 * words are longer, so there each fact gets its own line: every row then has the
 * same shape, and no line breaks in the middle of a fact or loses its last word.
 */

import React from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { getLanguage } from '@/i18n';

type Fact = string | null | undefined | false;

/** The facts as one text, for accessibility labels and for the one-line form. */
export const joinFacts = (facts: Fact[]): string => facts.filter(Boolean).join(' · ');

/** Whether the app's language shows each fact on its own line. */
export const stacksFacts = (): boolean => getLanguage() === 'gu';

interface FactLinesProps {
  facts: Fact[];
  style?: StyleProp<TextStyle>;
  /** Line limit of the one-line (English) form; a stacked fact may always use two lines. */
  numberOfLines?: number;
}

export const FactLines: React.FC<FactLinesProps> = ({ facts, style, numberOfLines }) => {
  const shown = facts.filter((fact): fact is string => Boolean(fact));
  if (shown.length === 0) return null;
  if (!stacksFacts()) {
    return (
      <Text style={style} numberOfLines={numberOfLines}>
        {joinFacts(shown)}
      </Text>
    );
  }
  return (
    <>
      {shown.map((fact, index) => (
        <Text key={index} style={style} numberOfLines={2}>
          {fact}
        </Text>
      ))}
    </>
  );
};

export default FactLines;

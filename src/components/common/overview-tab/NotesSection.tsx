/**
 * NotesSection Component
 *
 * Notes or remarks card for overview tabs (docs/STYLE_GUIDE.md §13.6).
 */

import React from 'react';
import { View, Text } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { iconSize } from '@/theme/tokens';
import { overviewStyles, useOverviewColors } from './FioriStyles';
import { SectionHeader } from './SectionHeader';

interface NotesSectionProps {
  note: string;
  title?: string;
}

export const NotesSection: React.FC<NotesSectionProps> = ({
  note,
  title = 'Remarks',
}) => {
  const colorStyles = useOverviewColors();

  return (
    <>
      <SectionHeader title={title} />
      <View style={[overviewStyles.card, colorStyles.card]}>
        <View style={overviewStyles.notesContent}>
          <Icon
            name="note-text-outline"
            size={iconSize.md}
            color={colorStyles.iconTertiary}
            style={overviewStyles.notesIcon}
            accessible={false}
            importantForAccessibility="no"
          />
          <Text style={[overviewStyles.notesText, colorStyles.notesText]}>{note}</Text>
        </View>
      </View>
    </>
  );
};

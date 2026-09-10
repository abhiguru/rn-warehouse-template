/**
 * NotesSection Component
 *
 * Reusable notes/remarks section for overview tabs
 * Based on SAP Fiori for iOS Card Pattern
 */

import React from 'react';
import { View, Text } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
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
            size={20}
            color={colorStyles.iconTertiary}
            style={overviewStyles.notesIcon}
          />
          <Text style={[overviewStyles.notesText, colorStyles.notesText]}>{note}</Text>
        </View>
      </View>
    </>
  );
};

/**
 * LanguageSwitch: English or ગુજરાતી, for the screens a person sees before
 * signing in (server selection, sign-in). After signing in the choice lives in
 * Settings, which also offers "Phone language".
 *
 * Each language is named in its own script, whatever the app's language is, and
 * the segment in effect is the selected one (also when the choice still follows
 * the phone).
 */
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { SegmentedControl } from '@/components/ui/RadioButton';
import { useThemedStyles } from '@/hooks/useTheme';
import { LANGUAGES, t, type AppLanguage } from '@/i18n';
import { useAppLanguage } from '@/i18n/useAppLanguage';

export interface LanguageSwitchProps {
  style?: StyleProp<ViewStyle>;
}

export function LanguageSwitch({ style }: LanguageSwitchProps) {
  const styles = useThemedStyles(makeStyles);
  const { language, setPreference } = useAppLanguage();
  return (
    <View style={[styles.container, style]} accessibilityRole="radiogroup" accessibilityLabel={t('auth.language.switchLabel')}>
      <SegmentedControl
        value={language}
        onValueChange={value => setPreference(value as AppLanguage)}
        options={LANGUAGES}
        style={styles.control}
      />
    </View>
  );
}

const makeStyles = () => ({
  container: {
    alignItems: 'center' as const,
  },
  // The shared control pads itself as a form row; here it stands alone.
  control: {
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
});

export default LanguageSwitch;

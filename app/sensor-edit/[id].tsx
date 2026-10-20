/**
 * Edit sensor (administrators only: update_sensor_device, and the route guard refuses the rest).
 *
 * Opened from a sensor's page. Name (1 to 100 characters), Location (up to 200), "Mark as no
 * recent data after" (5 to 1440 minutes) and the temperature limits, lowest and highest in °C,
 * both optional, the lowest below the highest. A field shows its problem once it has been left,
 * and every problem at once when Save is pressed (docs/STYLE_GUIDE.md §13.2, §14.4). Leaving
 * with changes asks first (useLeaveGuard); Save shows busy and ignores a second press.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ReportEmptyState, ReportHeader } from '@/components/reports';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { invalidateSensorQueries } from '@/features/sensors/sensorQueries';
import {
  formFromDevice,
  hasChanges,
  LOCATION_MAX,
  limitsChanged,
  limitsOf,
  MINUTES_MAX,
  MINUTES_MIN,
  NAME_MAX,
  parseMinutes,
  validateForm,
  type SensorFormErrors,
  type SensorFormField,
  type SensorFormValues,
} from '@/features/sensors/sensorEditForm';
import { useSensorDevice } from '@/features/sensors/useSensorQueries';
import { useLeaveGuard } from '@/hooks/useLeaveGuard';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as tr } from '@/i18n';
import { updateDevice } from '@/services/sensor-service';
import { layout, radius, space, typography, type ThemeTokens } from '@/theme/tokens';
import { showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.background.base },
    flex: { flex: 1 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: space.lg },
    loadingText: { ...typography.subhead, color: t.text.secondary },
    scrollContent: { padding: layout.marginCompact, paddingBottom: space.xl, gap: space.lg },
    card: {
      backgroundColor: t.surface.card,
      borderRadius: radius.card,
      padding: space.lg,
      gap: space.lg,
      ...t.shadow[2],
    },
    cardTitle: { ...typography.headline, color: t.text.primary },
    cardHint: { ...typography.footnote, color: t.text.secondary },
    bottomBar: {
      paddingHorizontal: layout.marginCompact,
      paddingTop: space.md,
      backgroundColor: t.surface.card,
      ...t.shadow[3],
    },
  });

/** The order of the fields on the screen: the first wrong one gets the focus. */
const FIELD_ORDER: SensorFormField[] = ['name', 'location', 'minutes', 'lowest', 'highest'];

/** The field a server refusal code belongs to, with the text to show under it; undefined for any other code. */
function refusedField(code: string | undefined): { name: SensorFormField; message: string } | undefined {
  switch (code) {
    case 'INVALID_NAME':
      return { name: 'name', message: tr('sensors.edit.tooLong', { max: NAME_MAX }) };
    case 'INVALID_LOCATION':
      return { name: 'location', message: tr('sensors.edit.tooLong', { max: LOCATION_MAX }) };
    case 'INVALID_THRESHOLD':
      return { name: 'minutes', message: tr('sensors.edit.minutesInvalid', { min: MINUTES_MIN, max: MINUTES_MAX }) };
    case 'INVALID_TEMPERATURE_LIMIT':
      return { name: 'highest', message: tr('sensors.edit.limitsOrder') };
    default:
      return undefined;
  }
}

const SensorEditScreen: React.FC = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const deviceQuery = useSensorDevice(id);
  const device = deviceQuery.data?.device ?? null;

  // The form starts from the sensor once, when it first arrives: a later re-read does not undo typing.
  const [original, setOriginal] = useState<SensorFormValues | null>(null);
  const [values, setValues] = useState<SensorFormValues | null>(null);
  useEffect(() => {
    if (device && original === null) {
      const start = formFromDevice(device);
      setOriginal(start);
      setValues(start);
    }
  }, [device, original]);

  const [touched, setTouched] = useState<Partial<Record<SensorFormField, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const inputs = useRef<Partial<Record<SensorFormField, TextInput | null>>>({});
  // What the server refused, by field; a field's refusal goes when it is typed in again.
  const [refused, setRefused] = useState<SensorFormErrors>({});

  const errors = values ? validateForm(values) : {};
  const shown = (field: SensorFormField) => refused[field] ?? (touched[field] || submitted ? errors[field] : undefined);
  const changed = values !== null && original !== null && hasChanges(values, original);

  // Every way out asks first when something changed: the header Back, the phone's Back key, the swipe.
  // While a save runs the question is off and every way out is held (a no-op below), so a screen
  // that was discarded cannot toast "saved" or an alert afterwards.
  const { leaveWithoutAsking } = useLeaveGuard({ hasChanges: changed && !saving });
  usePreventRemove(saving, () => {});

  const change = useCallback((field: SensorFormField, text: string) => {
    setValues(previous => (previous ? { ...previous, [field]: text } : previous));
    setRefused(previous => (previous[field] ? { ...previous, [field]: undefined } : previous));
  }, []);
  const leave = useCallback((field: SensorFormField) => setTouched(previous => ({ ...previous, [field]: true })), []);

  const save = async () => {
    if (savingRef.current || !device || !values || !original) return;
    setSubmitted(true);
    const found = validateForm(values);
    const wrong = FIELD_ORDER.filter(field => found[field]);
    if (wrong.length > 0) {
      // Style guide §11.3 and §14.4: say how many, and take the cursor to the first one.
      inputs.current[wrong[0]]?.focus();
      AccessibilityInfo.announceForAccessibility(tr('sensors.edit.fixFields', { count: wrong.length }));
      return;
    }
    setRefused({});
    // Nothing changed: there is nothing to save, so just go back.
    if (!changed) {
      router.back();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await updateDevice({
        deviceId: device.id,
        name: values.name.trim(),
        location: values.location.trim(),
        stalenessMinutes: parseMinutes(values.minutes) ?? MINUTES_MIN,
        limits: limitsChanged(values, original) ? limitsOf(values) : undefined,
      });
      if (result.success) {
        void invalidateSensorQueries();
        showToast(tr('sensors.edit.savedToast', { name: values.name.trim() }));
        leaveWithoutAsking(() => router.back());
      } else {
        const field = refusedField(result.code);
        if (field) {
          setRefused({ [field.name]: field.message });
          inputs.current[field.name]?.focus();
          AccessibilityInfo.announceForAccessibility(tr('sensors.edit.fixFields', { count: 1 }));
        } else if (result.code === 'DEVICE_NOT_FOUND') {
          showAlert(tr('sensors.detail.notFoundTitle'), tr('sensors.detail.notFound'));
        } else if (result.code === 'PGRST202') {
          showAlert(tr('sensors.edit.couldNotSaveTitle'), tr('sensors.edit.serverTooOld'));
        } else {
          showAlert(tr('sensors.edit.couldNotSaveTitle'), result.message ?? tr('sensors.edit.couldNotSave'));
        }
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const header = <ReportHeader title={tr('sensors.edit.title')} subtitle={device?.device_name} />;

  if (deviceQuery.phase === 'loading') {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.loadingContainer} accessibilityLiveRegion="polite">
          <ActivityIndicator size="large" color={t.brand.tint} />
          <Text style={styles.loadingText}>{tr('sensors.detail.loading')}</Text>
        </View>
      </View>
    );
  }

  if (!device || !values) {
    const notFound = deviceQuery.data !== undefined && device === null;
    return (
      <View style={styles.container}>
        {header}
        <ReportEmptyState
          icon={notFound ? 'thermometer-off' : 'alert-circle-outline'}
          tone={notFound ? 'default' : 'error'}
          message={notFound ? tr('sensors.detail.notFoundTitle') : tr('sensors.somethingWentWrong')}
          description={notFound ? tr('sensors.detail.notFound') : deviceQuery.error ?? tr('sensors.detail.deviceError')}
          actionLabel={tr('common.retry')}
          onAction={deviceQuery.retry}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {header}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <Input
              label={tr('sensors.edit.name')}
              required
              value={values.name}
              onChangeText={text => change('name', text)}
              onBlur={() => leave('name')}
              error={shown('name')}
              maxLength={NAME_MAX}
              showCharacterCount
              autoCapitalize="words"
              returnKeyType="next"
              ref={node => {
                inputs.current.name = node;
              }}
              onSubmitEditing={() => inputs.current.location?.focus()}
            />
            <Input
              label={tr('sensors.edit.location')}
              value={values.location}
              onChangeText={text => change('location', text)}
              onBlur={() => leave('location')}
              error={shown('location')}
              maxLength={LOCATION_MAX}
              showCharacterCount
              returnKeyType="next"
              ref={node => {
                inputs.current.location = node;
              }}
              onSubmitEditing={() => inputs.current.minutes?.focus()}
            />
            <Input
              label={tr('sensors.edit.minutes')}
              required
              numeric
              value={values.minutes}
              onChangeText={text => change('minutes', text)}
              onBlur={() => leave('minutes')}
              error={shown('minutes')}
              helperText={tr('sensors.edit.minutesHint', { min: MINUTES_MIN, max: MINUTES_MAX })}
              keyboardType="number-pad"
              selectTextOnFocus
              maxLength={4}
              ref={node => {
                inputs.current.minutes = node;
              }}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle} accessibilityRole="header">
              {tr('sensors.edit.limitsTitle')}
            </Text>
            <Text style={styles.cardHint}>{tr('sensors.edit.limitsHint')}</Text>
            <Input
              label={tr('sensors.edit.lowest')}
              numeric
              value={values.lowest}
              onChangeText={text => change('lowest', text)}
              onBlur={() => leave('lowest')}
              error={shown('lowest')}
              keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'}
              selectTextOnFocus
              maxLength={7}
              ref={node => {
                inputs.current.lowest = node;
              }}
            />
            <Input
              label={tr('sensors.edit.highest')}
              numeric
              value={values.highest}
              onChangeText={text => change('highest', text)}
              onBlur={() => leave('highest')}
              error={shown('highest')}
              keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'}
              selectTextOnFocus
              maxLength={7}
              ref={node => {
                inputs.current.highest = node;
              }}
            />
          </View>
        </ScrollView>

        {/* Under the form, not floating over it (style guide §14.4) */}
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + space.md }]}>
          <Button size="fullWidth" onPress={() => void save()} loading={saving} disabled={saving}>
            {tr('common.save')}
          </Button>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

export default SensorEditScreen;

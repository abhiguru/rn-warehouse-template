/**
 * In-app style guide (development builds only).
 *
 * Shows every semantic token, the type scale, spacing, shape, elevation, status
 * colours and the shared components in the current brand and mode, with
 * switches for both. Use it to check a theme change on a device; the written
 * rules are in docs/STYLE_GUIDE.md.
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme, useThemedStyles } from '@/hooks/useTheme';
import {
  AA,
  BRANDS,
  BRAND_LABELS,
  contrastRatio,
  iconSize,
  radius,
  space,
  typography,
  type ThemeTokens,
  type TypographyStyle,
} from '@/theme/tokens';
import { Avatar, Card, Input, RadioGroup, SegmentedControl, StatusTag, Switch } from '@/components/ui';
import StockIndicator from '@/components/StockIndicator';
import { FioriLinearProgress } from '@/components/FioriLinearProgress';
import StepIndicator from '@/components/StepIndicator';
import FilterChip from '@/components/FilterChip';
import { StepperInput } from '@/components/fiori/StepperInput';
import { KPICard } from '@/components/reports/KPICard';
import { ListEmptyState } from '@/components/list/ListEmptyState';
import { SkeletonBox } from '@/components/skeletons/SkeletonBox';
import { ConfirmDialog, type ConfirmVariant } from '@/components/ConfirmDialog';
import { showAlert } from '@/utils/alert';
import {
  formatCount,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatMobile,
  formatRelativeTime,
  formatSectionDate,
  formatTemperature,
  formatWeight,
} from '@/utils/formatters';
import { Button } from '@/components/ui/Button';
import { InlineValidation } from '@/components/fiori/InlineValidation';
import { KeyValueCell } from '@/components/fiori/KeyValueCell';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';

const STATUS = ['negative', 'critical', 'positive', 'informative', 'neutral'] as const;
const STATUS_ICON: Record<(typeof STATUS)[number], string> = {
  negative: 'alert-circle',
  critical: 'alert',
  positive: 'check-circle',
  informative: 'information',
  neutral: 'circle-outline',
};

const makeStyles = (t: ThemeTokens) => ({
  wrapRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  // KPICard fills a row (flex: 1), as it does inside KPIGrid.
  half: {
    flexBasis: '47%' as const,
    flexGrow: 1,
    flexDirection: 'row' as const,
  },
  screen: { flex: 1, backgroundColor: t.background.base },
  content: { padding: space.lg, gap: space.xxl },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    backgroundColor: t.surface.header,
    borderBottomWidth: 1,
    borderBottomColor: t.border.divider,
  },
  headerTitle: { ...typography.title3, color: t.text.primary, flex: 1 },
  sectionTitle: { ...typography.footnote, fontWeight: '600' as const, textTransform: 'uppercase' as const, color: t.text.secondary, marginBottom: space.sm },
  card: { backgroundColor: t.surface.card, borderRadius: radius.card, padding: space.lg, gap: space.md, ...t.shadow[1] },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.md },
  wrap: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: space.sm },
  segment: { flexDirection: 'row' as const, borderRadius: radius.button, borderWidth: 1, borderColor: t.border.button, overflow: 'hidden' as const },
  segmentItem: { paddingHorizontal: space.lg, paddingVertical: space.sm, backgroundColor: t.surface.card, minHeight: 36, justifyContent: 'center' as const },
  segmentItemOn: { backgroundColor: t.brand.fill },
  segmentText: { ...typography.callout, color: t.text.primary },
  segmentTextOn: { color: t.brand.onFill },
  swatch: { width: 40, height: 40, borderRadius: radius.button, borderWidth: 1, borderColor: t.border.divider },
  tokenName: { ...typography.subhead, color: t.text.primary },
  tokenMeta: { ...typography.caption1, color: t.text.secondary },
  fail: { ...typography.caption1, color: t.status.negative.text, fontWeight: '600' as const },
  body: { ...typography.body, color: t.text.primary },
  secondary: { ...typography.subhead, color: t.text.secondary },
  statusChip: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.xs, paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.pill, borderWidth: 1 },
  spaceBar: { height: 12, backgroundColor: t.brand.fill, borderRadius: radius.field },
  elevationTile: { width: 96, height: 64, borderRadius: radius.card, backgroundColor: t.surface.card, alignItems: 'center' as const, justifyContent: 'center' as const },
  link: { ...typography.body, color: t.brand.tint, fontWeight: '600' as const },
});

type Styles = ReturnType<typeof makeStyles>;

function Segment<T extends string>({ value, options, onChange, styles }: {
  value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; styles: Styles;
}) {
  return (
    <View style={styles.segment} accessibilityRole="radiogroup">
      {options.map(o => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.segmentItem, on && styles.segmentItemOn]}
            accessibilityRole="radio" accessibilityState={{ selected: on }}>
            <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Section({ title, children, styles }: { title: string; children: React.ReactNode; styles: Styles }) {
  return (
    <View>
      <Text style={styles.sectionTitle} accessibilityRole="header">{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

/** One colour token: swatch, name, value and its contrast against the given background. */
function TokenRow({ name, value, against, min, styles }: {
  name: string; value: string; against?: string; min?: number; styles: Styles;
}) {
  const ratio = against ? contrastRatio(value, against) : undefined;
  const failing = ratio !== undefined && min !== undefined && ratio < min;
  return (
    <View style={styles.row}>
      <View style={[styles.swatch, { backgroundColor: value }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.tokenName}>{name}</Text>
        <Text style={styles.tokenMeta}>
          {value}{ratio !== undefined ? `  ·  ${ratio.toFixed(2)}:1${min ? ` (min ${min}:1)` : ''}` : ''}
        </Text>
      </View>
      {failing && <Text style={styles.fail}>Fails</Text>}
    </View>
  );
}

export default function StyleGuideScreen() {
  const insets = useSafeAreaInsets();
  const { tokens: t, brand, setBrand, resolvedMode, setPreference } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [switchOn, setSwitchOn] = useState(true);
  const [radio, setRadio] = useState('a');
  const [field, setField] = useState('');
  const [segment, setSegment] = useState('120');
  const [stepper, setStepper] = useState(25);
  const [dialog, setDialog] = useState<ConfirmVariant | null>(null);

  if (!__DEV__) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + space.lg, paddingHorizontal: space.lg }]}>
        <Text style={styles.body}>The style guide is available in development builds only.</Text>
      </View>
    );
  }

  const bg = t.surface.card;
  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8}>
          <Icon name="arrow-left" size={iconSize.lg} color={t.icon.primary} />
        </Pressable>
        <Text style={styles.headerTitle} accessibilityRole="header">Style guide</Text>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxxl }]}>
        <Section title="Theme" styles={styles}>
          <Segment styles={styles} value={brand} onChange={setBrand}
            options={BRANDS.map(b => ({ value: b, label: BRAND_LABELS[b] }))} />
          <Segment styles={styles} value={resolvedMode} onChange={m => setPreference(m)}
            options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
          <Text style={styles.secondary}>Mode here sets your app preference; choose System again in Settings.</Text>
        </Section>

        <Section title="Brand" styles={styles}>
          <TokenRow styles={styles} name="brand.fill (onFill text)" value={t.brand.fill} />
          <TokenRow styles={styles} name="brand.onFill on brand.fill" value={t.brand.onFill} against={t.brand.fill} min={AA.text} />
          <TokenRow styles={styles} name="brand.fillPressed" value={t.brand.fillPressed} />
          <TokenRow styles={styles} name="brand.tint on card" value={t.brand.tint} against={bg} min={AA.text} />
          <TokenRow styles={styles} name="brand.subtle" value={t.brand.subtle} />
          <TokenRow styles={styles} name="brand.subtleStrong" value={t.brand.subtleStrong} />
          <TokenRow styles={styles} name="brand.secondary (decoration)" value={t.brand.secondary} />
          <TokenRow styles={styles} name="brand.secondaryText on card" value={t.brand.secondaryText} against={bg} min={AA.text} />
          <TokenRow styles={styles} name="destructive.onFill on destructive.fill" value={t.destructive.onFill} against={t.destructive.fill} min={AA.text} />
        </Section>

        <Section title="Surfaces and text" styles={styles}>
          <TokenRow styles={styles} name="background.base" value={t.background.base} />
          <TokenRow styles={styles} name="background.grouped" value={t.background.grouped} />
          <TokenRow styles={styles} name="surface.card" value={t.surface.card} />
          <TokenRow styles={styles} name="surface.cardPressed" value={t.surface.cardPressed} />
          <TokenRow styles={styles} name="surface.selected" value={t.surface.selected} />
          <TokenRow styles={styles} name="surface.field" value={t.surface.field} />
          <TokenRow styles={styles} name="surface.fieldReadOnly" value={t.surface.fieldReadOnly} />
          <TokenRow styles={styles} name="text.primary on card" value={t.text.primary} against={bg} min={AA.text} />
          <TokenRow styles={styles} name="text.secondary on card" value={t.text.secondary} against={bg} min={AA.text} />
          <TokenRow styles={styles} name="text.placeholder on field" value={t.text.placeholder} against={t.surface.field} min={AA.text} />
          <TokenRow styles={styles} name="icon.secondary on card" value={t.icon.secondary} against={bg} min={AA.large} />
          <TokenRow styles={styles} name="border.field on field" value={t.border.field} against={t.surface.field} min={AA.large} />
          <TokenRow styles={styles} name="border.fieldFocus on field" value={t.border.fieldFocus} against={t.surface.field} min={AA.large} />
          <TokenRow styles={styles} name="border.divider" value={t.border.divider} />
          <TokenRow styles={styles} name="text.required" value={t.text.required} against={bg} min={AA.text} />
        </Section>

        <Section title="Status" styles={styles}>
          {STATUS.map(s => (
            <View key={s} style={{ gap: space.xs }}>
              <View style={styles.row}>
                <View style={[styles.statusChip, { backgroundColor: t.status[s].background, borderColor: t.status[s].border }]}>
                  <Icon name={STATUS_ICON[s]} size={iconSize.sm} color={t.status[s].text} />
                  <Text style={[typography.caption1, { color: t.status[s].text, fontWeight: '600' }]}>{s[0].toUpperCase() + s.slice(1)}</Text>
                </View>
                <Icon name={STATUS_ICON[s]} size={iconSize.md} color={t.status[s].element} />
              </View>
              <TokenRow styles={styles} name={`status.${s}.text on card`} value={t.status[s].text} against={bg} min={AA.text} />
              <TokenRow styles={styles} name={`status.${s}.element on card`} value={t.status[s].element} against={bg} min={AA.large} />
            </View>
          ))}
        </Section>

        <Section title="Typography" styles={styles}>
          {(Object.keys(typography) as TypographyStyle[]).map(k => (
            <View key={k}>
              <Text style={[typography[k], { color: t.text.primary }]}>{k}</Text>
              <Text style={styles.tokenMeta}>{`${typography[k].fontSize}/${typography[k].lineHeight} · weight ${typography[k].fontWeight}`}</Text>
            </View>
          ))}
        </Section>

        <Section title="Spacing" styles={styles}>
          {Object.entries(space).filter(([, v]) => v > 0).map(([k, v]) => (
            <View key={k} style={styles.row}>
              <Text style={[styles.tokenMeta, { width: 64 }]}>{`${k} ${v}`}</Text>
              <View style={[styles.spaceBar, { width: v * 3 }]} />
            </View>
          ))}
        </Section>

        <Section title="Shape and elevation" styles={styles}>
          <View style={styles.wrap}>
            {Object.entries(radius).filter(([k]) => k !== 'pill').map(([k, v]) => (
              <View key={k} style={[styles.elevationTile, { borderRadius: v, borderWidth: 1, borderColor: t.border.field }]}>
                <Text style={styles.tokenMeta}>{`${k} ${v}`}</Text>
              </View>
            ))}
          </View>
          <View style={styles.wrap}>
            {t.shadow.map((s, i) => (
              <View key={i} style={[styles.elevationTile, s]}>
                <Text style={styles.tokenMeta}>{`level ${i}`}</Text>
              </View>
            ))}
          </View>
        </Section>

        <Section title="Buttons" styles={styles}>
          <Button type="primary" size="fullWidth">Primary</Button>
          <Button type="secondary" size="fullWidth">Secondary</Button>
          <Button type="tertiary">Tertiary</Button>
          <Button type="primary" variant="negative" size="fullWidth">Negative</Button>
          <Button type="primary" size="fullWidth" disabled>Disabled</Button>
          <Button type="primary" size="fullWidth" loading loadingText="Saving">Loading</Button>
        </Section>

        <Section title="Fields and selection" styles={styles}>
          <Input label="Customer name" placeholder="e.g. Sunrise Agro Foods" value={field} onChangeText={setField} helperText="Helper text explains the field." />
          <Input label="Quantity" value="-3" error="Quantity must be greater than zero" onChangeText={() => {}} />
          <Input label="Read-only" value="DV0001" editable={false} onChangeText={() => {}} />
          <Switch label="Notify me" value={switchOn} onValueChange={setSwitchOn} helperText="Switch with helper text" />
          <RadioGroup label="Pricing" selectedValue={radio} onValueChange={setRadio}
            options={[{ label: 'Monthly', value: 'a' }, { label: 'One-time', value: 'b' }, { label: 'Disabled', value: 'c', disabled: true }]} />
          <InlineValidation variant="error" message="Error message" visible />
          <InlineValidation variant="warning" message="Warning message" visible />
          <InlineValidation variant="success" message="Success message" visible />
          <InlineValidation variant="helper" message="Helper message" visible />
        </Section>

        <Section title="Selection" styles={styles}>
          <SegmentedControl label="Period" value={segment} onValueChange={setSegment}
            options={[{ value: '120', label: '120 days' }, { value: '240', label: '240 days' }, { value: '364', label: '364 days' }]} />
          <StepperInput label="Quantity" value={stepper} onValueChange={setStepper} min={0} max={100} suffix="bags" />
        </Section>

        <Section title="Tags, avatars and indicators" styles={styles}>
          <View style={styles.wrapRow}>
            <StatusTag status="positive" label="In stock" />
            <StatusTag status="critical" label="Low stock" />
            <StatusTag status="negative" label="Out of stock" />
            <StatusTag status="informative" label="Printing" />
            <StatusTag status="neutral" label="Fully dispatched" icon="check-all" />
            <StatusTag status="neutral" label="Staff" icon={null} />
          </View>
          <View style={styles.wrapRow}>
            <Avatar name="Sunrise Agro Foods" id="customer-1" size="sm" />
            <Avatar name="Green Valley Traders" id="customer-2" />
            <Avatar name="Dev Administrator" id="user-1" size="lg" />
          </View>
          <View style={styles.wrapRow}>
            <FilterChip label="Last 7 days" onRemove={() => {}} />
            <FilterChip label="In stock" onRemove={() => {}} />
          </View>
          <StockIndicator currentStock={150} originalStock={200} />
          <StockIndicator currentStock={20} originalStock={200} />
          <StockIndicator currentStock={0} originalStock={200} />
          <FioriLinearProgress progress={0.6} label="Uploading photos" showPercentage />
          <FioriLinearProgress progress={1} variant="success" label="Uploaded" />
          <FioriLinearProgress progress={0.3} variant="error" label="Upload failed" />
        </Section>

        <Section title="Steps" styles={styles}>
          <StepIndicator
            steps={[{ label: 'GRN details' }, { label: 'Items' }, { label: 'Review' }]}
            currentStep={2}
            completedSteps={[1]}
          />
        </Section>

        <Section title="Reports" styles={styles}>
          <View style={styles.wrapRow}>
            <View style={styles.half}><KPICard icon="account-group" value={5} label="Customers" variant="primary" /></View>
            <View style={styles.half}><KPICard icon="warehouse" value="995" unit="bags" label="In stock" variant="success" /></View>
            <View style={styles.half}><KPICard icon="alert" value={3} label="Low stock items" variant="warning" /></View>
            <View style={styles.half}><KPICard icon="truck-delivery-outline" value={12} label="Dispatches" variant="neutral" /></View>
          </View>
        </Section>

        <Section title="Dialogs and alerts" styles={styles}>
          <Button type="secondary" size="fullWidth" onPress={() => setDialog('default')}>Confirm dialog</Button>
          <Button type="secondary" size="fullWidth" onPress={() => setDialog('warning')}>Warning dialog</Button>
          <Button type="secondary" variant="negative" size="fullWidth" onPress={() => setDialog('danger')}>Danger dialog</Button>
          <Button type="secondary" size="fullWidth"
            onPress={() => showAlert('Delete GRN 311?', 'Its items will be removed from stock.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete GRN', style: 'destructive' },
            ])}>
            Alert with two buttons
          </Button>
          <Button type="secondary" size="fullWidth"
            onPress={() => showAlert('Save this item?', 'You changed the quantity.', [
              { text: 'Keep editing', style: 'cancel' },
              { text: 'Discard item', style: 'destructive' },
              { text: 'Save item' },
            ])}>
            Alert with three buttons
          </Button>
          <ConfirmDialog
            visible={dialog !== null}
            variant={dialog ?? 'default'}
            title={dialog === 'danger' ? 'Delete dispatch DD0006?' : dialog === 'warning' ? 'Leave without saving?' : 'Create this GRN?'}
            message={dialog === 'danger' ? 'This cannot be undone.' : 'You can change it later.'}
            confirmText={dialog === 'danger' ? 'Delete dispatch' : dialog === 'warning' ? 'Leave' : 'Create GRN'}
            cancelText="Cancel"
            onConfirm={() => setDialog(null)}
            onCancel={() => setDialog(null)}
          />
        </Section>

        <Section title="States" styles={styles}>
          <ListEmptyState activeFilterCount={0} emptyIcon="truck-delivery-outline" emptyTitle="No dispatches yet"
            emptySubtitle="Dispatches you create appear here." />
          <ListEmptyState activeFilterCount={2} filteredTitle="No GRNs match your filters" />
          <SkeletonBox height={16} width="60%" />
          <SkeletonBox height={16} width="40%" />
        </Section>

        <Section title="Formats" styles={styles}>
          <KeyValueCell keyLabel="formatDate" value={formatDate(new Date(2026, 8, 22))} showDivider />
          <KeyValueCell keyLabel="formatDate short" value={formatDate(new Date(), 'short')} showDivider />
          <KeyValueCell keyLabel="formatDateTime" value={formatDateTime(new Date(2026, 9, 9, 16, 5))} showDivider />
          <KeyValueCell keyLabel="formatSectionDate" value={formatSectionDate('2026-10-06')} showDivider />
          <KeyValueCell keyLabel="formatRelativeTime" value={formatRelativeTime(new Date(Date.now() - 5 * 60000).toISOString())} showDivider />
          <KeyValueCell keyLabel="formatMobile" value={formatMobile('9876543210')} showDivider />
          <KeyValueCell keyLabel="formatCurrency" value={formatCurrency(123456.5, { minimumFractionDigits: 2 })} showDivider />
          <KeyValueCell keyLabel="formatWeight" value={formatWeight(1250.5)} showDivider />
          <KeyValueCell keyLabel="formatTemperature" value={formatTemperature(-18.5)} showDivider />
          <KeyValueCell keyLabel="formatCount" value={`${formatCount(1, 'item')} · ${formatCount(120, 'bag')}`} />
        </Section>

        <Section title="Content" styles={styles}>
          <KeyValueCell keyLabel="Customer" value="Sunrise Agro Foods" showDivider />
          <KeyValueCell keyLabel="Total" value="1,906.00" valuePrefix="₹" emphasized showDivider />
          <KeyValueCell keyLabel="Linked dispatch" value="DD0001" actionable onPress={() => {}} />
          <Card>
            <Text style={styles.body}>Card body text.</Text>
          </Card>
          <Text style={styles.link}>Text link</Text>
        </Section>
      </ScrollView>
    </View>
  );
}

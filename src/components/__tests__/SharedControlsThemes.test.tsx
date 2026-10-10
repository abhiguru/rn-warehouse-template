/**
 * Renders the shared controls (style guide §13.1-13.5, §13.8) in all four
 * themes and checks the token roles the guide assigns to them.
 */
import React from 'react';
import { StyleSheet, Switch as RNSwitch, Text } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { BRANDS, getTokens, type Brand, type Mode } from '@/theme/tokens';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { FormLabel, FormLabelGroup } from '@/components/ui/FormLabel';
import { Switch, SwitchGroup } from '@/components/ui/Switch';
import { RadioGroup, SegmentedControl, ButtonGroup } from '@/components/ui/RadioButton';
import { SectionHeader, SectionFooter } from '@/components/ui/SectionHeader';
import { DatePickerInput } from '@/components/ui/DatePickerInput';
import { CompoundRackInput } from '@/components/ui/CompoundRackInput';
import { InlineValidation } from '@/components/fiori/InlineValidation';
import { KeyValueCell, KeyValueGroup } from '@/components/fiori/KeyValueCell';
import { StepperInput } from '@/components/fiori/StepperInput';
import StockIndicator from '@/components/StockIndicator';
import { FioriLinearProgress, FioriSegmentedProgress } from '@/components/FioriLinearProgress';
import StepIndicator from '@/components/StepIndicator';
import { GenericStepIndicatorHeader } from '@/components/GenericStepIndicatorHeader';
import FormFieldWrapper from '@/components/FormFieldWrapper';
import FioriTabBar from '@/components/FioriTabBar';
import { FormStepWrapper } from '@/components/form/FormStepWrapper';
import { getStatusColors } from '@/utils/stockStatus';

let mockState: { theme: { preference: string; brand: string } } = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons', MaterialCommunityIcons: 'MaterialCommunityIcons' }));
jest.mock('@/hooks/useHaptics', () => ({
  triggerLightTap: jest.fn(),
  triggerSelection: jest.fn(),
  triggerMediumTap: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaInsetsContext: require('react').createContext(null),
}));
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('@react-native-picker/picker', () => {
  const Picker = ({ children }: { children?: React.ReactNode }) => children ?? null;
  Picker.Item = () => null;
  return { Picker };
});
jest.mock('@gorhom/bottom-sheet', () => ({ BottomSheetTextInput: 'BottomSheetTextInput' }));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({
  KeyboardAwareScrollView: ({ children }: { children?: React.ReactNode }) => children,
}));
jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: { children?: React.ReactNode }) => children,
  Gesture: { Pan: () => new Proxy({}, { get: (_t, _k, proxy) => () => proxy }) },
}));
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
jest.mock('@/hooks/useRoleBasedAccess', () => ({ useRoleBasedAccess: () => ({ canManageOrders: true }) }));
jest.mock('@/services/search-service', () => ({ searchService: {} }));
jest.mock('@/services/invoice-service', () => ({ getInvoicesList: jest.fn() }));

const MODES: Mode[] = ['light', 'dark'];
const THEMES = BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const));

function render(brand: Brand, mode: Mode, element: React.ReactElement): ReactTestRenderer {
  mockState = { theme: { preference: mode, brand } };
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  return tree;
}

const flat = (style: unknown) => StyleSheet.flatten(style as never) ?? {};

const steps = [{ label: 'Customer' }, { label: 'Items' }, { label: 'Review' }];

function Gallery() {
  return (
    <>
      <Button type="primary">Save GRN</Button>
      <Button type="primary" variant="negative">Delete GRN</Button>
      <Button type="secondary">Print</Button>
      <Button type="secondary" variant="normal">Cancel</Button>
      <Button type="secondary" variant="negative">Remove</Button>
      <Button type="tertiary">Edit</Button>
      <Button type="tertiary" variant="negative" size="compact">Clear</Button>
      <Button type="primary" size="fullWidth" loading loadingText="Saving">Save</Button>
      <Button type="secondary" iconOnly leftIcon="add">Add item</Button>
      <Card header={{ title: 'GRN 311', subtitle: 'Patel Traders', status: { label: 'Pending', type: 'critical' } }}
        footer={{ actions: [{ label: 'Open', onPress: jest.fn(), style: 'primary' }, { label: 'Share', onPress: jest.fn(), style: 'secondary' }] }}>
        <Text>Body</Text>
      </Card>
      <Card loading />
      <Card error="Couldn't load the GRN." />
      <Card selected onPress={jest.fn()} shadow="none"><Text>Selected</Text></Card>
      <Input label="Customer" required value="" onChangeText={jest.fn()} helperText="Search by name" />
      <Input label="Quantity" value="-3" error="Enter a number above zero." onChangeText={jest.fn()} maxLength={2} showCharacterCount />
      <Input label="Lot" value="L1" readOnly onChangeText={jest.fn()} />
      <FormLabel required error>Weight</FormLabel>
      <FormLabelGroup label="Notes" helperText="Optional" characterCount={{ current: 3, max: 10 }} />
      <Switch label="Notify me" value onValueChange={jest.fn()} helperText="Sends a message" />
      <SwitchGroup title="Alerts"><Switch value={false} onValueChange={jest.fn()} /></SwitchGroup>
      <RadioGroup label="Pricing" selectedValue="a" onValueChange={jest.fn()}
        options={[{ label: 'Monthly', value: 'a' }, { label: 'One-time', value: 'b', disabled: true }]} />
      <SegmentedControl label="Period" value="d" onValueChange={jest.fn()}
        options={[{ label: 'Day', value: 'd' }, { label: 'Week', value: 'w' }]} />
      <ButtonGroup label="Status" selectedValues={['o']} onSelectionChange={jest.fn()} multiSelect
        options={[{ label: 'Open', value: 'o' }, { label: 'Closed', value: 'c' }]} />
      <SectionHeader title="Items" count={3} action={{ label: 'Add', onPress: jest.fn() }} />
      <SectionFooter text="3 items" />
      <DatePickerInput label="Date" value={new Date(2026, 9, 9)} onChange={jest.fn()} error="Pick a date" />
      <CompoundRackInput value="A1" onChangeText={jest.fn()} />
      <InlineValidation variant="error" message="Error" />
      <InlineValidation variant="warning" message="Warning" />
      <InlineValidation variant="success" message="Saved" />
      <InlineValidation variant="helper" message="Helper" />
      <KeyValueCell keyLabel="Dispatch" value="DD0001" actionable onPress={jest.fn()} showDivider />
      <KeyValueGroup items={[{ key: 'Bags', value: 120, emphasized: true }]} />
      <StepperInput label="Bags" value={2} onValueChange={jest.fn()} max={2} errorText="Too many" />
      <StepperInput value={0} onValueChange={jest.fn()} layout="compact" />
      <StockIndicator currentStock={20} originalStock={200} flashRed />
      <FioriLinearProgress progress={0.4} showPercentage label="Upload" />
      <FioriLinearProgress progress={0.4} variant="error" coloredTrack size="prominent" />
      <FioriSegmentedProgress total={10} showLabels segments={[{ value: 4, label: 'Dispatched' }, { value: 6, label: 'In stock' }]} />
      <StepIndicator steps={steps} currentStep={2} completedSteps={[1]} onStepPress={jest.fn()} />
      <GenericStepIndicatorHeader steps={steps} currentStep={2} completedSteps={[1]} onCancel={jest.fn()} entityName="GRN"
        entityId="Z0813" onStepPress={jest.fn()} />
      <FormFieldWrapper label="Vehicle" required error="Enter a vehicle number."><Text>Field</Text></FormFieldWrapper>
    </>
  );
}

describe.each(THEMES)('shared controls in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('render without crashing', () => {
    const tree = render(brand, mode, <Gallery />);
    expect(tree.toJSON()).toBeTruthy();
    act(() => tree.unmount());
  });

  it('fill primary buttons with brand tokens and confirm destructive actions with destructive tokens', () => {
    const tree = render(brand, mode, (
      <>
        <Button type="primary" testID="primary">Save</Button>
        <Button type="primary" variant="negative" testID="negative">Delete</Button>
        <Button type="secondary" testID="secondary">Print</Button>
      </>
    ));
    const bg = (id: string) =>
      flat(tree.root.findAll(n => n.props?.testID === id && Boolean(n.props.style))[0].props.style);
    expect(bg('primary').backgroundColor).toBe(t.brand.fill);
    expect(bg('negative').backgroundColor).toBe(t.destructive.fill);
    expect(bg('secondary').borderColor).toBe(t.border.button);
    const labels = tree.root.findAllByType(Text).map(n => flat(n.props.style).color);
    expect(labels).toEqual([t.brand.onFill, t.destructive.onFill, t.brand.tint]);
    act(() => tree.unmount());
  });

  it('colour the switch track with brand.fill and control tokens', () => {
    const tree = render(brand, mode, <Switch label="Notify" value onValueChange={jest.fn()} />);
    const sw = tree.root.findByType(RNSwitch);
    expect(sw.props.trackColor).toEqual({ false: t.control.trackOff, true: t.brand.fill });
    expect(sw.props.thumbColor).toBe(t.control.thumb);
    act(() => tree.unmount());
  });

  it('map stock status colours to the status tokens', () => {
    expect(getStatusColors('negative', t)).toEqual({
      main: t.status.negative.element,
      light: t.status.negative.background,
      dark: t.status.negative.text,
      border: t.status.negative.border,
    });
  });

  it('label stock with the one app-wide rule (below 20% is low)', () => {
    const tree = render(brand, mode, (
      <>
        <StockIndicator currentStock={19} originalStock={100} />
        <StockIndicator currentStock={20} originalStock={100} />
        <StockIndicator currentStock={0} originalStock={100} />
        <StockIndicator currentStock={1} originalStock={1} />
      </>
    ));
    const words = tree.root.findAllByType(Text).map(n => n.props.children);
    expect(words).toEqual(expect.arrayContaining(['Low stock', 'In stock', 'Out of stock', '1 of 1 unit', '19 of 100 units']));
    act(() => tree.unmount());
  });

  it('fill plain counts with brand.fill and "needs action" counts with destructive.fill', () => {
    const header = render(brand, mode, <SectionHeader title="Items" count={3} />);
    const count = header.root.findAllByType(Text).find(n => n.props.children === '3')!;
    expect(flat(count.props.style).color).toBe(t.brand.onFill);
    act(() => header.unmount());

    const routes = [{ key: 'a', name: 'grn', params: undefined }];
    const props = {
      state: { index: 0, routes },
      descriptors: { a: { options: { title: 'GRN' } } },
      navigation: { emit: () => ({ defaultPrevented: false }), navigate: jest.fn() },
      badges: { grn: 2 },
    } as unknown as React.ComponentProps<typeof FioriTabBar>;
    const bar = render(brand, mode, <FioriTabBar {...props} />);
    const badge = bar.root.findAllByType(Text).find(n => n.props.children === '2')!;
    expect(flat(badge.props.style).color).toBe(t.destructive.onFill);
    act(() => bar.unmount());
  });

  it('render the tab bar on surface.tabBar with the selected tab in brand.tint', () => {
    const routes = [
      { key: 'a', name: 'index', params: undefined },
      { key: 'b', name: 'grn', params: undefined },
    ];
    const props = {
      state: { index: 0, routes },
      descriptors: { a: { options: { title: 'Orders' } }, b: { options: { title: 'GRN' } } },
      navigation: { emit: () => ({ defaultPrevented: false }), navigate: jest.fn() },
      badges: { grn: 3 },
    } as unknown as React.ComponentProps<typeof FioriTabBar>;
    const tree = render(brand, mode, <FioriTabBar {...props} />);
    const labels = tree.root.findAllByType(Text).filter(n => ['Orders', 'GRN'].includes(n.props.children));
    expect(flat(labels[0].props.style).color).toBe(t.brand.tint);
    expect(flat(labels[1].props.style).color).toBe(t.text.secondary);
    act(() => tree.unmount());
  });

  it('render the form step wrapper', () => {
    const tree = render(brand, mode, (
      <FormStepWrapper title="Create GRN" currentStep={1} totalSteps={3} stepLabels={['Customer', 'Items', 'Review']}
        onCancel={jest.fn()} enableSwipe={false}>
        <Text>Content</Text>
      </FormStepWrapper>
    ));
    expect(tree.toJSON()).toBeTruthy();
    act(() => tree.unmount());
  });
});

/**
 * The driver of the invoice flow tests: the real expo-router stack (`ExpoRoot` over an in-memory route context) with
 * the real Invoices tab, both invoice layouts and the three shared steps in both modes, on the real hook, slice and
 * service. Only what the invoice screens reach outside the app is stood in for: the facility's `rpc`
 * (invoiceFlowServer), the invoice details page (a button that opens the edit), and the modules each test file mocks.
 *
 * The test file starts the app with `startFlowApp({ location, advance, pendingTimers })`, where `advance` runs the pending fake
 * timers (`() => jest.runAllTimersAsync()`) and `pendingTimers` counts them (`() => jest.getTimerCount()`), and keeps its `jest.mock` lines for the modules named in
 * `docs`-style at the top of each flow test. No jest globals here.
 */
import React from 'react';
import { Pressable, Text } from 'react-native';
import { expect } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { getMockContext } from 'expo-router/build/testing-library/mock-config';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import { routerStore } from '@/tests/helpers/routerStore';
import { router, Stack, Tabs } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { InvoiceSuccessDialog } from '@/features/invoice/components/InvoiceSuccessDialog';
import { findFibers } from '@/tests/helpers/fiberTree';
import { installHardwareBack } from '@/tests/helpers/hardwareBack';
import { flowStore } from '@/tests/helpers/invoiceFlowStore';
import type { InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import InvoicesTab from '../../../app/(tabs)/invoices';
import InvoiceFormLayout from '../../../app/invoice-form/_layout';
import InvoiceFormStep1 from '../../../app/invoice-form/step1';
import InvoiceFormStep2 from '../../../app/invoice-form/step2';
import InvoiceFormStep3 from '../../../app/invoice-form/step3';
import InvoiceEditOuterLayout from '../../../app/invoice-edit/_layout';
import InvoiceEditLayout from '../../../app/invoice-edit/[id]/_layout';
import InvoiceEditStep1 from '../../../app/invoice-edit/[id]/step1';
import InvoiceEditStep2 from '../../../app/invoice-edit/[id]/step2';
import InvoiceEditStep3 from '../../../app/invoice-edit/[id]/step3';

/** The id of the invoice the edit flows open. */
export const EDIT_ID = 'inv-42';

/** The page of the invoice, reduced to the way into its edit form. */
const DetailsPage = () => (
  <Pressable testID="open-edit" accessibilityLabel="Edit" onPress={() => router.push(`/invoice-edit/${EDIT_ID}/step1` as never)}>
    <Text>Edit</Text>
  </Pressable>
);

/** A rendered host element (Testing Library exports no name for the type). */
export type Host = ReturnType<typeof screen.getByRole>;

const joined = (node: Host | string): string =>
  typeof node === 'string' ? node : node.children.map((child) => joined(child)).join('');

/** The text of a node and everything under it (a no-break space reads as a space). */
export const textOf = (node: Host | string): string => joined(node).replace(/\u00a0/g, ' ');


/** A testID or accessibility label, or a pattern for one. */
export type Id = string | RegExp;

/** What a test reads from a dialog component: its props. */
export interface DialogProps {
  props: Record<string, any>;
}

export interface FlowApp {
  store: InvoiceStore;
  /** The Android Back key. True when a screen took the press. */
  pressBackKey: () => Promise<boolean>;
  /** Runs the pending fake timers and what they start. */
  settle: () => Promise<void>;
  pathname: () => string;
  /** The routes of the root stack, with the steps of a wizard in it: ['(tabs)', ['step1', 'step2']]. */
  stack: () => unknown[];
  /** Pushes a route, as a link would. */
  go: (href: string) => Promise<void>;

  /** Every pressable with this testID or accessibility label that is on screen, in tree order. */
  controls: (id: Id) => Host[];
  /** Presses the last such control (the screen in front is drawn last); throws when there is none or it is disabled. */
  tap: (id: Id) => Promise<void>;
  /** The control exists and is not disabled. */
  canTap: (id: Id) => boolean;
  /** Presses the control once without waiting for timers (a quick second tap). */
  tapNow: (id: Id) => Promise<void>;
  /** Presses the last pressable on screen whose text is `text` (for a button that has no label of its own). */
  tapText: (text: string) => Promise<void>;
  /**
   * Taps a control `times` times in the same instant, as a double tap does: every tap meets the screen as the first
   * left it (nothing has been drawn again in between), and a disabled control is not pressed.
   */
  rapid: (id: Id, times: number) => Promise<void>;
  /** The same for a button of the dialog that is open. */
  rapidDialog: (label: string, times: number) => Promise<void>;
  /** Whether the button of the dialog that is open can be pressed. */
  dialogButtonEnabled: (label: string) => boolean;
  /** Presses a button of the dialog that is open. */
  tapDialog: (label: string) => Promise<void>;
  /** Presses the button whose text is `text` inside the invoice's success dialog (its buttons carry no label). */
  tapSuccess: (text: string) => Promise<void>;

  /** The text inputs with this testID or accessibility label. */
  input: (id: string) => Host;
  hasInput: (id: string) => boolean;
  /** Focuses the input, types the text key by key and leaves the input. */
  typeKeys: (id: string, text: string, options?: { stayInField?: boolean }) => Promise<void>;
  /** One change of the input's text, as a paste or a clear does (no focus, no blur). */
  changeText: (id: string, text: string) => Promise<void>;
  /**
   * Chooses a date in the date picker of step 1. The test file mocks `react-native-paper-dates` with
   * `{ DatePickerModal: 'DatePickerModal' }` so that the picker keeps its props; this taps the date field (the picker
   * must then be open) and confirms the date, as the picker's Save does.
   */
  chooseDate: (date: Date) => Promise<void>;
  focus: (id: string) => Promise<void>;
  blur: (id: string) => Promise<void>;
  /** The value shown in an input. */
  valueOf: (id: string) => string;

  /** The distinct testIDs on screen that match the pattern, in tree order. */
  testIDs: (pattern: RegExp) => string[];
  /** The first node with this testID. */
  byTestID: (id: string) => Host;
  /** Every Text on screen. */
  texts: () => string[];
  hasText: (text: string | RegExp) => boolean;
  /** The ConfirmDialogs that are open (their props: a dialog is a component, which has no view of its own to read). */
  dialogs: () => DialogProps[];
  /** The one open ConfirmDialog (throws when none or several). */
  dialog: () => DialogProps;
  successDialog: () => DialogProps | undefined;
  /** Lets every ConfirmDialog that wants it say it has finished closing (the iOS event). */
  dismissDialogs: () => Promise<void>;
  unmount: () => Promise<void>;
}

export interface StartOptions {
  /** Where the app opens, e.g. '/invoices'. */
  location: string;
  /** Runs the pending fake timers: `() => jest.runAllTimersAsync()`. */
  advance: () => Promise<void>;
  /** How many fake timers are still pending (`() => jest.getTimerCount()`). */
  pendingTimers: () => number;
}

const labelOf = (node: Host) => node.props.accessibilityLabel;
/** Whether a touch on the view reaches a handler (a Pressable, a button, a Text with onPress). */
const isPressable = (node: Host) => typeof node.props.onStartShouldSetResponder === 'function';
const isDisabled = (node: Host) => !!node.props.disabled || !!node.props.accessibilityState?.disabled;
const matches = (node: Host, id: Id) =>
  typeof id === 'string'
    ? node.props.testID === id || labelOf(node) === id
    : (typeof node.props.testID === 'string' && id.test(node.props.testID)) || (typeof labelOf(node) === 'string' && id.test(labelOf(node)));
const hostsOf = (where: (node: Host) => boolean, within: Host | null = screen.root): Host[] =>
  within ? within.queryAll((node) => where(node as Host), { includeSelf: true }) : [];
const dialogComponents = () => findFibers((fiber) => fiber.type === ConfirmDialog && !!fiber.memoizedProps?.visible);

export async function startFlowApp({ location, advance, pendingTimers }: StartOptions): Promise<FlowApp> {
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  const backKey = installHardwareBack();
  const context = getMockContext({
    // The app's root layout wraps everything in GestureHandlerRootView, which gesture-handler 3 requires.
    _layout: () => (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false }} />
      </GestureHandlerRootView>
    ),
    // expo-router 58 tabs show only the screens their layout declares (this context has these two tabs only).
    '(tabs)/_layout': () => (
      <Tabs screenOptions={{ headerShown: false }}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="invoices" />
      </Tabs>
    ),
    '(tabs)/index': () => null,
    '(tabs)/invoices': InvoicesTab,
    'invoice-details/[id]': DetailsPage,
    // WH-205: where "Open GST details" in the no-bills alert goes (the screen itself is tested on its own).
    'gst-details': () => null,
    'invoice-form/_layout': InvoiceFormLayout,
    'invoice-form/step1': InvoiceFormStep1,
    'invoice-form/step2': InvoiceFormStep2,
    'invoice-form/step3': InvoiceFormStep3,
    'invoice-edit/_layout': InvoiceEditOuterLayout,
    'invoice-edit/[id]/_layout': InvoiceEditLayout,
    'invoice-edit/[id]/step1': InvoiceEditStep1,
    'invoice-edit/[id]/step2': InvoiceEditStep2,
    'invoice-edit/[id]/step3': InvoiceEditStep3,
  });
  await render(<ExpoRoot context={context} location={location} />);
  await act(async () => { await advance(); });

  // The Items step draws each card's dispatch lines behind a "Show dispatch details" toggle, closed at first. The flows
  // are about the figures in those lines, so they open every card as soon as it is on screen, as a user does (the
  // toggle itself is tested with the editor).
  const openClosedLines = async () => {
    const closed = screen
      .queryAllByRole('button', { expanded: false })
      .filter((node) => typeof labelOf(node) === 'string' && labelOf(node).startsWith('Show dispatch details'));
    for (const toggle of closed) await fireEvent.press(toggle);
    // A press on a node a re-render has unmounted does nothing: none of the card toggles may still be closed.
    expect(
      screen
        .queryAllByRole('button', { expanded: false })
        .filter((node) => typeof labelOf(node) === 'string' && labelOf(node).startsWith('Show dispatch details')),
    ).toHaveLength(0);
  };
  // A step circle navigates from a timer, so the screen it opens mounts at the end of the act that ran that timer
  // and its effects schedule new timers of their own. Run rounds until none is pending (bounded).
  const settle = async () => {
    for (let round = 0; round < 10; round += 1) {
      await act(async () => { await advance(); });
      if (pendingTimers() === 0) break;
    }
    await openClosedLines();
  };

  const controls = (id: Id) => hostsOf((node) => matches(node, id) && isPressable(node));
  const last = (id: Id) => {
    const found = controls(id);
    if (found.length === 0) throw new Error(`No control "${id}" on screen`);
    return found[found.length - 1];
  };

  const inputs = (id: string) => hostsOf((node) => node.type === 'TextInput' && (node.props.testID === id || labelOf(node) === id));
  const input = (id: string) => {
    const found = inputs(id);
    if (found.length === 0) throw new Error(`No input "${id}" on screen`);
    return found[found.length - 1];
  };

  /** The visible Modal that holds the open dialog's card (its alert is named by the dialog's title). */
  const dialogView = () => {
    const open = dialogComponents();
    if (open.length !== 1) throw new Error(`Expected one open dialog, found ${open.length}`);
    const title = open[0].memoizedProps!.title;
    const view = hostsOf((node) => node.type === 'Modal' && node.props.visible !== false).find(
      (modal) => hostsOf((node) => node.props.accessibilityRole === 'alert' && labelOf(node) === title, modal).length > 0
    );
    if (!view) throw new Error(`The dialog "${title}" is not drawn`);
    return { view, title };
  };
  const dialogButton = (label: string) => {
    const { view, title } = dialogView();
    const button = hostsOf((node) => labelOf(node) === label && isPressable(node), view)[0];
    if (!button) throw new Error(`No button "${label}" in the dialog "${title}"`);
    return button;
  };
  const successView = () => {
    const open = findFibers((fiber) => fiber.type === InvoiceSuccessDialog && !!fiber.memoizedProps?.isVisible);
    if (open.length === 0) throw new Error('The invoice dialog is not open');
    return hostsOf((node) => node.type === 'Modal' && node.props.visible !== false).pop();
  };

  const app: FlowApp = {
    get store() { return flowStore(); },
    settle,
    pressBackKey: async () => {
      let taken = false;
      await act(async () => { taken = backKey.press(); });
      await settle();
      return taken;
    },
    pathname: () => routerStore.getRouteInfo().pathname,
    stack: () =>
      (routerStore.state!.routes[0].state?.routes ?? []).map((route) =>
        route.name.endsWith('-form') || route.name === 'invoice-edit'
          ? (route.state?.routes ?? []).flatMap((inner) => (inner.state?.routes ?? [inner]).map((step) => step.name))
          : route.name),
    go: async (href) => {
      await act(async () => { router.push(href as never); });
      await settle();
    },

    controls,
    canTap: (id) => controls(id).length > 0 && !isDisabled(last(id)),
    tap: async (id) => {
      const control = last(id);
      if (isDisabled(control)) throw new Error(`Control "${id}" is disabled`);
      await fireEvent.press(control);
      await settle();
    },
    tapNow: async (id) => {
      const control = last(id);
      if (isDisabled(control)) return;
      await fireEvent.press(control);
    },
    rapid: async (id, times) => {
      const control = last(id);
      await act(async () => {
        for (let n = 0; n < times; n += 1) if (!isDisabled(control)) void fireEvent.press(control);
      });
      await settle();
    },
    rapidDialog: async (label, times) => {
      const button = dialogButton(label);
      await act(async () => {
        for (let n = 0; n < times; n += 1) if (!isDisabled(button)) void fireEvent.press(button);
      });
      await settle();
    },
    dialogButtonEnabled: (label) => !isDisabled(dialogButton(label)),
    tapText: async (text) => {
      const found = hostsOf((node) => isPressable(node) && textOf(node) === text);
      if (found.length === 0) throw new Error(`No button with the text "${text}" on screen`);
      const button = found[found.length - 1];
      if (isDisabled(button)) throw new Error(`Button "${text}" is disabled`);
      await fireEvent.press(button);
      await settle();
    },
    tapDialog: async (label) => {
      const button = dialogButton(label);
      if (isDisabled(button)) throw new Error(`Button "${label}" of the dialog is disabled`);
      await fireEvent.press(button);
      await settle();
    },

    tapSuccess: async (text) => {
      const view = successView();
      const button = view ? hostsOf((node) => isPressable(node) && textOf(node) === text, view)[0] : undefined;
      if (!button) throw new Error(`No button "${text}" in the invoice dialog`);
      await fireEvent.press(button);
      await settle();
    },

    input,
    hasInput: (id) => inputs(id).length > 0,
    changeText: async (id, text) => { await fireEvent.changeText(input(id), text); },
    chooseDate: async (date) => {
      await app.tap(/^Invoice date, /);
      const picker = hostsOf((node) => node.type === 'DatePickerModal')[0];
      if (!picker?.props.visible) throw new Error('The date picker did not open');
      await act(async () => { picker.props.onConfirm({ date }); });
      await settle();
    },
    focus: async (id) => { await fireEvent(input(id), 'focus', {}); },
    blur: async (id) => { await fireEvent(input(id), 'blur', {}); },
    typeKeys: async (id, text, options = {}) => {
      await fireEvent(input(id), 'focus', {});
      for (let n = 1; n <= text.length; n += 1) {
        await fireEvent.changeText(input(id), text.slice(0, n));
      }
      if (!options.stayInField) await fireEvent(input(id), 'blur', {});
    },
    valueOf: (id) => String(input(id).props.value ?? ''),

    testIDs: (pattern) => {
      const found: string[] = [];
      hostsOf((node) => typeof node.props.testID === 'string' && pattern.test(node.props.testID)).forEach((node) => {
        if (!found.includes(node.props.testID)) found.push(node.props.testID);
      });
      return found;
    },
    byTestID: (id) => {
      const found = hostsOf((node) => node.props.testID === id);
      if (found.length === 0) throw new Error(`No node with testID "${id}"`);
      return found[0];
    },
    texts: () => hostsOf((node) => node.type === 'Text').map((node) => textOf(node)),
    hasText: (text) => app.texts().some((found) => (typeof text === 'string' ? found === text : text.test(found))),
    dialogs: () => dialogComponents().map((fiber) => ({ props: fiber.memoizedProps! })),
    dialog: () => {
      const open = dialogComponents();
      if (open.length !== 1) throw new Error(`Expected one open dialog, found ${open.length}`);
      return { props: open[0].memoizedProps! };
    },
    successDialog: () => {
      const open = findFibers((fiber) => fiber.type === InvoiceSuccessDialog && !!fiber.memoizedProps?.isVisible)[0];
      return open ? { props: open.memoizedProps! } : undefined;
    },
    dismissDialogs: async () => {
      const all = findFibers((fiber) => fiber.type === ConfirmDialog);
      await act(async () => { all.forEach((fiber) => fiber.memoizedProps!.onDismissed?.()); });
      await settle();
    },
    unmount: async () => {
      // Testing Library unmounts after each test, before a test file's own `afterEach` that calls this.
      try {
        await screen.unmount();
      } catch (error) {
        if (!String(error).includes("has not been called")) throw error;
      }
      backKey.restore();
    },
  };
  return app;
}

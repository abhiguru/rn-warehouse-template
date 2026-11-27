/**
 * WH-381, Design offline-capture.md Part 13.1 A and 13.5: `OfflineFormGate` around a dispatch or invoice form.
 *  - Opened with no connection: only the header (Back, title) and the needs-a-connection state are drawn, the form is not.
 *  - Already open when the connection drops: the form is untouched and keeps what was typed.
 *  - Opened offline, then the connection returns: the form is drawn, and a later drop leaves it as it is.
 *
 * Real: OfflineFormGate, ScreenNeedsConnection, useNeedsConnection, the sync store and engine flag, i18n. Stand-ins: the
 * navigator and the safe area (native).
 *
 * ===== AGREE WITH DEVELOPMENT =====
 *  - The gate takes its header title from its `title` prop (Design: "Dispatch" / "Invoice"; the layouts pass `common.dispatch`
 *    and `common.invoice`), the state's testID from `testID`.
 *  - Back in the gate's header is a button named "Back".
 * ==================================
 */
import React, { useState } from 'react';
import { Text, TextInput } from 'react-native';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { OfflineFormGate } from '../components/OfflineFormGate';
import * as engine from '../syncEngine';
import * as syncStore from '../syncStore';
import { setLanguage } from '@/i18n';

jest.mock('expo-router', () => ({ router: { back: jest.fn(), canGoBack: () => true } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));

const NEEDS_EN = 'This needs a connection. It will load when you reconnect.';
const NEEDS_GU = 'આ માટે કનેક્શન જોઈએ. ફરી જોડાશો ત્યારે લોડ થશે.';

/** A tiny form with one typed field and a submit, so "keeps its fields" is a real check. */
const Form = () => {
  const [note, setNote] = useState('');
  return (
    <>
      <TextInput accessibilityLabel="Dispatch note" value={note} onChangeText={setNote} />
      <Text testID="form-body">form</Text>
    </>
  );
};
const gate = () => (
  <OfflineFormGate title="Dispatch" testID="dispatch-form-needs-connection">
    <Form />
  </OfflineFormGate>
);

const setOffline = (offline: boolean) => act(async () => { engine.setCopyOffline(offline); });

beforeEach(() => {
  syncStore.resetSyncSnapshot({ feature: 'on', phase: 'ready', format: 8, kind: 'warehouse', asOf: '2026-11-25T05:12:00.000+00:00', current: true, pending: false, copyOpen: true });
  engine.setCopyOffline(false);
});
afterEach(async () => {
  engine.setCopyOffline(false);
  syncStore.resetSyncSnapshot();
  await setLanguage('en');
});

describe('OfflineFormGate (WH-381, Design 13.1 A)', () => {
  it('opened offline: the header and the needs-a-connection state, no field, no body, no "Try again"', async () => {
    engine.setCopyOffline(true);
    await render(gate());
    expect(screen.getByTestId('dispatch-form-needs-connection')).toHaveTextContent(NEEDS_EN);
    expect(screen.getByRole('header', { name: 'Dispatch' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
    expect(screen.queryByLabelText('Dispatch note')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('form-body')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeOnTheScreen();
  });

  it('opened offline, Gujarati: Design 13.3 words', async () => {
    await setLanguage('gu');
    engine.setCopyOffline(true);
    await render(gate());
    expect(screen.getByTestId('dispatch-form-needs-connection')).toHaveTextContent(NEEDS_GU);
    expect(screen.queryByTestId('form-body')).not.toBeOnTheScreen();
  });

  it('opened online: the form is drawn with no state', async () => {
    await render(gate());
    expect(screen.getByTestId('form-body')).toBeOnTheScreen();
    expect(screen.queryByTestId('dispatch-form-needs-connection')).not.toBeOnTheScreen();
  });

  it('already open when the connection drops: the form stays and keeps what was typed', async () => {
    await render(gate());
    await userEvent.type(screen.getByLabelText('Dispatch note'), 'Fictional note');
    await setOffline(true);
    expect(screen.queryByTestId('dispatch-form-needs-connection')).not.toBeOnTheScreen();
    expect(screen.getByLabelText('Dispatch note')).toHaveDisplayValue('Fictional note');
  });

  it('opened offline then the connection returns: the form is drawn, and a later drop leaves it as it is', async () => {
    engine.setCopyOffline(true);
    await render(gate());
    expect(screen.getByTestId('dispatch-form-needs-connection')).toBeOnTheScreen();
    await setOffline(false);
    expect(screen.queryByTestId('dispatch-form-needs-connection')).not.toBeOnTheScreen();
    await userEvent.type(screen.getByLabelText('Dispatch note'), 'Typed after reconnect');
    await setOffline(true);
    expect(screen.queryByTestId('dispatch-form-needs-connection')).not.toBeOnTheScreen();
    expect(screen.getByLabelText('Dispatch note')).toHaveDisplayValue('Typed after reconnect');
  });

  it('the feature off: never blocks, whatever the connection', async () => {
    syncStore.resetSyncSnapshot({ feature: 'off' });
    engine.setCopyOffline(true);
    await render(gate());
    expect(screen.getByTestId('form-body')).toBeOnTheScreen();
  });
});

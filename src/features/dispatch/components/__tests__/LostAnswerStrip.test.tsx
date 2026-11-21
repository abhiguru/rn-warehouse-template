/**
 * The strip over a screen that is locked while the server is asked what became of a request that got no answer
 * (owner rule D22): the sentence for a save or a delete, and that it is waiting for the connection while offline.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { t } from '@/i18n';
import { LostAnswerStrip } from '../LostAnswerStrip';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
let mockOffline = false;
// The strip asks the lost-answer rule's own online test (utils/lostAnswer), the one the wait uses.
jest.mock('@/utils/lostAnswer', () => ({ useIsDisconnected: () => mockOffline }));

const show = (kind: 'save' | 'delete') => render(<LostAnswerStrip kind={kind} testID="strip" />);

beforeEach(() => { mockOffline = false; });

describe('while online', () => {
  it('says it is checking whether it was saved', async () => {
    await show('save');
    expect(screen.getByText(t('errors.lostAnswer.checking'))).toBeOnTheScreen();
  });

  it('says it is checking whether it was deleted, for a delete', async () => {
    await show('delete');
    expect(screen.getByText(t('errors.lostAnswer.checkingDelete'))).toBeOnTheScreen();
  });
});

describe('while offline', () => {
  it('adds that it is waiting for the connection', async () => {
    mockOffline = true;
    await show('save');
    expect(screen.getByText(`${t('errors.lostAnswer.checking')} ${t('errors.lostAnswer.waiting')}`)).toBeOnTheScreen();
  });

  it('adds it to the delete sentence too', async () => {
    mockOffline = true;
    await show('delete');
    expect(screen.getByText(`${t('errors.lostAnswer.checkingDelete')} ${t('errors.lostAnswer.waiting')}`)).toBeOnTheScreen();
  });
});

describe('as a message', () => {
  it('is a polite live region, so a screen reader says it', async () => {
    await show('save');
    expect(screen.getByTestId('strip')).toHaveProp('accessibilityLiveRegion', 'polite');
  });
});

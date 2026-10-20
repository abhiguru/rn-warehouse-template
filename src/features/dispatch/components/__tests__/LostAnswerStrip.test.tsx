/**
 * The strip over a screen that is locked while the server is asked what became of a request that got no answer
 * (owner rule D22): the sentence for a save or a delete, and that it is waiting for the connection while offline.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { t } from '@/i18n';
import { InlineValidation } from '@/components/fiori/InlineValidation';
import { LostAnswerStrip } from '../LostAnswerStrip';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
let mockOffline = false;
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => mockOffline }));

let tree: ReactTestRenderer;
const render = (kind: 'save' | 'delete') => {
  act(() => { tree = create(<LostAnswerStrip kind={kind} testID="strip" />); });
};
const message = () => tree.root.findByType(InlineValidation).props.message as string;

beforeEach(() => { mockOffline = false; });
afterEach(() => { act(() => tree.unmount()); });

describe('while online', () => {
  it('says it is checking whether it was saved', () => {
    render('save');
    expect(message()).toBe(t('errors.lostAnswer.checking'));
  });

  it('says it is checking whether it was deleted, for a delete', () => {
    render('delete');
    expect(message()).toBe(t('errors.lostAnswer.checkingDelete'));
  });
});

describe('while offline', () => {
  it('adds that it is waiting for the connection', () => {
    mockOffline = true;
    render('save');
    expect(message()).toBe(`${t('errors.lostAnswer.checking')} ${t('errors.lostAnswer.waiting')}`);
  });

  it('adds it to the delete sentence too', () => {
    mockOffline = true;
    render('delete');
    expect(message()).toBe(`${t('errors.lostAnswer.checkingDelete')} ${t('errors.lostAnswer.waiting')}`);
  });
});

describe('as a message', () => {
  it('is a polite live region, so a screen reader says it', () => {
    render('save');
    const strip = tree.root.find((node) => node.props.testID === 'strip' && node.props.accessibilityLiveRegion === 'polite');
    expect(strip).toBeTruthy();
  });
});

/**
 * The start-up check of unfinished creates runs once the facility session is ready (a profile in the store), once per
 * session, and Open shows the saved document.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import { router } from 'expo-router';
import { checkUnfinishedSaves } from '@/services/unfinishedSaveCheck';
import { useUnfinishedSaveCheck } from '../useUnfinishedSaveCheck';

let mockProfileId: string | undefined;
jest.mock('@/store/hooks', () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ auth: { userProfile: mockProfileId ? { id: mockProfileId } : null } }),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/services/unfinishedSaveCheck', () => ({ checkUnfinishedSaves: jest.fn(async () => {}) }));

function Probe() {
  useUnfinishedSaveCheck();
  return null;
}
const render = async () => {
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<Probe />); });
  return tree;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockProfileId = undefined;
});

it('does nothing while nobody is signed in', async () => {
  await render();
  expect(checkUnfinishedSaves).not.toHaveBeenCalled();
});

it('checks once the profile is there, and again only for another session', async () => {
  mockProfileId = 'user-ana';
  const tree = await render();
  expect(checkUnfinishedSaves).toHaveBeenCalledTimes(1);

  await act(async () => { tree.update(<Probe />); });
  expect(checkUnfinishedSaves).toHaveBeenCalledTimes(1);

  mockProfileId = 'user-ben';
  await act(async () => { tree.update(<Probe />); });
  expect(checkUnfinishedSaves).toHaveBeenCalledTimes(2);
});

it('Open shows the details page of the saved GRN or dispatch', async () => {
  mockProfileId = 'user-ana';
  await render();
  const { open } = jest.mocked(checkUnfinishedSaves).mock.calls[0][0];

  open('grn', 'grn-id-1');
  open('dispatch', 'disp-id-1');

  expect(router.push).toHaveBeenNthCalledWith(1, '/grn-details/grn-id-1');
  expect(router.push).toHaveBeenNthCalledWith(2, '/dispatch-details/disp-id-1');
});

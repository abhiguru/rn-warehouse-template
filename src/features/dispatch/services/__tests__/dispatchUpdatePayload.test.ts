/** The save of an existing dispatch sends the vehicle number tidied (App 94), as the create does. */
import { updateDispatch } from '../dispatchFormService';

const mockRpc = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({
  beginOperatorMutation: () => jest.fn(),
  getAuthenticatedClient: async () => ({ rpc: mockRpc }),
}));
jest.mock('@/lib/queryClient', () => ({ ...jest.requireActual('@/lib/queryClient'), invalidateReportQueries: jest.fn(async () => {}) }));
jest.mock('../dispatchImageService', () => ({ uploadDeferredDispatchImages: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'fictional-uuid' }));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: () => Promise.resolve({ isConnected: true }), addEventListener: () => () => undefined },
}));

const header = {
  disp_no: 'I0042', disp_date: '2026-10-01', registration: ' t31  x18 ', customer_id: 'c1', customer_name: 'Fictional Traders',
  supervisor_id: 's1', supervisor_name: 'Fictional Supervisor', note: '',
};
const payload = { header, items: [{ grnItems_id: 'fictional-lot', disp_quantity: 2 }] } as unknown as Parameters<typeof updateDispatch>[1];

beforeEach(() => {
  mockRpc.mockReset();
  mockRpc.mockResolvedValue({ data: { success: true }, error: null });
  for (const method of ['log', 'warn', 'error'] as const) jest.spyOn(console, method).mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it('updateDispatch sends the vehicle number without the spaces around or inside it that were only typed', async () => {
  await updateDispatch('d1', payload);

  const [name, body] = mockRpc.mock.calls[0];
  expect(name).toBe('update_dispatch_smart');
  expect(body.p_dispatch_data.registration).toBe('T31 X18');
});

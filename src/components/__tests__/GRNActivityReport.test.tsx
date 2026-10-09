import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import GRNActivityScreen from '../../../app/reports/grn-activity';

let mockState: { theme: { preference: string; brand: string } } = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons', MaterialCommunityIcons: 'MaterialCommunityIcons' }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ customerId: 'c1', customerName: 'Patel Traders' }),
}));
jest.mock('@/hooks/useRoleBasedAccess', () => ({
  useRoleBasedAccess: () => ({ isStaff: true, role: 'staff', singleAssignedCustomerId: null, shouldShowListView: true }),
}));
jest.mock('@/components/reports', () => ({
  ReportHeader: () => null,
  KPIGrid: () => null,
  PeriodSelector: () => null,
  ReportEmptyState: () => null,
  ReportCustomerSearch: () => null,
  getDateRangeForPeriod: () => ({ from: '2026-06-01', to: '2026-10-09' }),
}));
jest.mock('@/services/reporting/grn-activity-service', () => ({
  getAllGRNActivity: jest.fn(),
  getCustomerGRNActivity: jest.fn(async () => ({
    success: true,
    data: {
      summary: { total_grns: 2, total_quantity: 120, total_invoiced_grns: 1 },
      grns: [
        {
          grn_id: 'g1', gr_no: '311', grn_date: '2026-10-08', sender_name: 'Ramesh', supervisor_name: null,
          total_qty: 100, image_count: 2,
          invoice_status: { is_invoiced: true, invoice_number: '2026-0042' },
          dispatch_summary: { current_stock: 80, dispatch_count: 1 },
        },
        {
          grn_id: 'g2', gr_no: '312', grn_date: '2026-10-08', sender_name: null, supervisor_name: 'Suresh',
          total_qty: 20, image_count: 0,
          invoice_status: { is_invoiced: false, invoice_number: null },
          dispatch_summary: { current_stock: 20, dispatch_count: 0 },
        },
      ],
    },
  })),
}));

const MODES: Mode[] = ['light', 'dark'];

function flatStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatStyle));
  return (style as Record<string, unknown>) || {};
}

describe('GRN activity report', () => {
  describe.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))('%s %s', (brand, mode) => {
    it('renders GRN cells with status words on theme tokens', async () => {
      mockState = { theme: { preference: mode, brand } };
      const t = getTokens(brand, mode);
      let tree!: ReactTestRenderer;
      await act(async () => {
        tree = create(<GRNActivityScreen />);
      });

      const texts = tree.root
        .findAll(n => (n.type as unknown) === 'Text')
        .map(n => [].concat(n.props.children).join(''));
      expect(texts).toEqual(expect.arrayContaining(['GRN 311', 'Invoice 2026-0042', 'Not invoiced', '1 dispatch']));

      const notInvoiced = tree.root.findAll(n => (n.type as unknown) === 'Text' && n.props.children === 'Not invoiced')[0];
      expect(flatStyle(notInvoiced.props.style).color).toBe(t.status.critical.text);

      const card = tree.root.findAll(
        n => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('GRN 311') && typeof n.props.style === 'function'
      )[0];
      expect(flatStyle(card.props.style({ pressed: false })).backgroundColor).toBe(t.surface.card);
    });
  });
});

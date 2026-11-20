/** WH-158 (contract section 7): ReportHubRow gains the testID `reports-hub-row-<report id>`. Written BEFORE the build. */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ReportHubRow } from '../ReportHubRow';
import { REPORTS } from '@/features/reports/reportRegistry';

let mockState = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/hooks/useHaptics', () => ({ triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn() }));

it.each(['stock-summary', 'temperature-report'])('the row of %s carries testID reports-hub-row-%s', async id => {
  const report = REPORTS.find(r => r.id === id)!;
  await render(<ReportHubRow report={report} pinned={false} onOpen={jest.fn()} onTogglePin={jest.fn()} />);
  expect(screen.getByTestId(`reports-hub-row-${id}`)).toBeOnTheScreen();
});

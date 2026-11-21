/**
 * WH-273: the first test written with Testing Library (docs/CODE_GUIDE.md, Tests). HelpSection is the titled card
 * inside the grouped Help list (style guide §14.12): its title shows as a heading and its cells show inside it.
 */
import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { HelpSection } from '../HelpSection';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange', language: 'en' } }),
}));

describe('HelpSection', () => {
  it('shows its title as a heading and the cells under it', async () => {
    await render(
      <HelpSection title="Connection">
        <Text>Server address</Text>
        <Text>Facility</Text>
      </HelpSection>,
    );

    expect(screen.getByRole('header', { name: 'Connection' })).toBeOnTheScreen();
    expect(screen.getByText('Server address')).toBeOnTheScreen();
    expect(screen.getByText('Facility')).toBeOnTheScreen();
  });

  it('shows nothing under the title when it has no cells', async () => {
    await render(<HelpSection title="Connection">{null}</HelpSection>);

    expect(screen.getByRole('header', { name: 'Connection' })).toBeOnTheScreen();
    expect(screen.queryByText('Server address')).not.toBeOnTheScreen();
  });
});

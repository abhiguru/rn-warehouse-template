/**
 * WH-141: the logo area of the sign-in screen. A build without a brand pack shows the neutral "COLD / STORAGE"
 * wordmark and no caption; a build with a pack shows the pack's wordmark and caption when its brand is chosen, and
 * the neutral wordmark when Orange is chosen. The pack here is the fictional sample-teal.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { BrandMark } from '../BrandMark';
import { setLanguage } from '@/i18n';
import { registerSampleBrand, SAMPLE_BRAND } from '@/tests/helpers/sampleBrand';
import { BRANDS } from '@/theme/brandPack';

let mockBrand = 'orange';
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: mockBrand, language: 'en' } }),
}));

afterEach(() => {
  setLanguage('en');
});

const renderMark = () => render(<BrandMark label="Review Cold Storage" />);
const logoText = () => screen.getByRole('image');

// The first describe runs before the sample pack is registered: a build without a pack.
describe('a build without a brand pack', () => {
  it('has one brand and shows the neutral wordmark with no caption', async () => {
    expect(BRANDS).toEqual(['orange']);
    await renderMark();
    expect(screen.getByText('COLD')).toBeOnTheScreen();
    expect(screen.getByText('STORAGE')).toBeOnTheScreen();
    expect(logoText()).toHaveTextContent(/^COLDSTORAGE$/);
    expect(screen.getByRole('image')).toHaveAccessibleName('Review Cold Storage logo');
  });
});

describe('a build with the sample brand pack', () => {
  beforeAll(() => registerSampleBrand());

  it('offers Orange and the sample brand', () => {
    expect(BRANDS).toEqual(['orange', SAMPLE_BRAND]);
  });

  it('shows the pack wordmark and caption when its brand is chosen, the caption in Gujarati in Gujarati', async () => {
    mockBrand = SAMPLE_BRAND;
    await renderMark();
    expect(screen.getByText('SAMPLE')).toBeOnTheScreen();
    expect(screen.getByText('SAMPLE COLD STORAGE')).toBeOnTheScreen();
    expect(logoText()).toHaveTextContent(/^SAMPLESAMPLE COLD STORAGE$/);
    await screen.unmount();
    setLanguage('gu');
    await renderMark();
    expect(screen.getByText('SAMPLE')).toBeOnTheScreen();
    expect(screen.getByText('નમૂનો કોલ્ડ સ્ટોરેજ')).toBeOnTheScreen();
    expect(logoText()).toHaveTextContent(/^SAMPLEનમૂનો કોલ્ડ સ્ટોરેજ$/);
  });

  it('shows the neutral wordmark when Orange is chosen, whatever the pack', async () => {
    mockBrand = 'orange';
    await renderMark();
    expect(logoText()).toHaveTextContent(/^COLDSTORAGE$/);
  });

  it('shows the neutral wordmark for a saved brand this build does not have', async () => {
    mockBrand = 'removed-brand';
    await renderMark();
    expect(logoText()).toHaveTextContent(/^COLDSTORAGE$/);
  });
});

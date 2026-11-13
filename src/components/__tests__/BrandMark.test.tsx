/**
 * WH-141: the logo area of the sign-in screen. A build without a brand pack shows the neutral "COLD / STORAGE"
 * wordmark and no caption; a build with a pack shows the pack's wordmark and caption when its brand is chosen, and
 * the neutral wordmark when Orange is chosen. The pack here is the fictional sample-teal.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
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

let tree: ReactTestRenderer | undefined;
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
  setLanguage('en');
});

const lines = (): string[] => tree!.root.findAllByType(Text).map(node => [node.props.children].flat(Infinity).join(''));
const render = () => {
  act(() => {
    tree = create(<BrandMark label="Review Cold Storage" />);
  });
};
const logoLabel = () => tree!.root.findAll(node => node.props.accessibilityRole === 'image')[0].props.accessibilityLabel;

// The first describe runs before the sample pack is registered: a build without a pack.
describe('a build without a brand pack', () => {
  it('has one brand and shows the neutral wordmark with no caption', () => {
    expect(BRANDS).toEqual(['orange']);
    render();
    expect(lines()).toEqual(['COLD', 'STORAGE']);
    expect(logoLabel()).toBe('Review Cold Storage logo');
  });
});

describe('a build with the sample brand pack', () => {
  beforeAll(() => registerSampleBrand());

  it('offers Orange and the sample brand', () => {
    expect(BRANDS).toEqual(['orange', SAMPLE_BRAND]);
  });

  it('shows the pack wordmark and caption when its brand is chosen, the caption in Gujarati in Gujarati', () => {
    mockBrand = SAMPLE_BRAND;
    render();
    expect(lines()).toEqual(['SAMPLE', 'SAMPLE COLD STORAGE']);
    act(() => tree?.unmount());
    setLanguage('gu');
    render();
    expect(lines()).toEqual(['SAMPLE', 'નમૂનો કોલ્ડ સ્ટોરેજ']);
  });

  it('shows the neutral wordmark when Orange is chosen, whatever the pack', () => {
    mockBrand = 'orange';
    render();
    expect(lines()).toEqual(['COLD', 'STORAGE']);
  });

  it('shows the neutral wordmark for a saved brand this build does not have', () => {
    mockBrand = 'removed-brand';
    render();
    expect(lines()).toEqual(['COLD', 'STORAGE']);
  });
});

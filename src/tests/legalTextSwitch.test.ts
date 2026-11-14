/**
 * WH-197: the association legal-text switch reads the same in the build check and in the app (value trimmed, any case),
 * and the theme does not load expo-constants.
 */
import { isAssociationLegalText } from '@/constants/legal';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { checkLegalText } = require('../../brand-packs/loadBrandPack.cjs') as { checkLegalText: (value: unknown, pack: unknown) => void };

const NAMED = { association: { name: 'Fictional Cold Storage Association' } };
let saved: string | undefined;
beforeEach(() => { saved = process.env.EXPO_PUBLIC_LEGAL_TEXT; });
afterEach(() => {
  if (saved === undefined) delete process.env.EXPO_PUBLIC_LEGAL_TEXT;
  else process.env.EXPO_PUBLIC_LEGAL_TEXT = saved;
});

describe('legal text value', () => {
  it.each(['association', 'Association', 'ASSOCIATION', '  association  ', ' Association\t'])('the app treats "%s" as the association text', value => {
    process.env.EXPO_PUBLIC_LEGAL_TEXT = value;
    expect(isAssociationLegalText()).toBe(true);
  });

  it.each(['association', 'Association', 'ASSOCIATION', '  association  '])('the build check refuses "%s" with no pack naming the association', value => {
    expect(() => checkLegalText(value, undefined)).toThrow(/EXPO_PUBLIC_LEGAL_TEXT=association/);
    expect(() => checkLegalText(value, { association: { name: '   ' } })).toThrow(/EXPO_PUBLIC_LEGAL_TEXT=association/);
  });

  it('the build check passes with a pack naming the association, and for any other value', () => {
    expect(() => checkLegalText('Association', NAMED)).not.toThrow();
    for (const other of [undefined, '', 'facility', 'associations']) expect(() => checkLegalText(other, undefined)).not.toThrow();
  });

  it('is not the association text for any other value', () => {
    for (const other of [undefined, '', 'facility', 'associations']) {
      if (other === undefined) delete process.env.EXPO_PUBLIC_LEGAL_TEXT;
      else process.env.EXPO_PUBLIC_LEGAL_TEXT = other;
      expect(isAssociationLegalText()).toBe(false);
    }
  });
});

describe('the theme and expo-constants', () => {
  it('loading the brand list and the theme slice does not load expo-constants', () => {
    const loaded = jest.fn();
    jest.isolateModules(() => {
      jest.doMock('expo-constants', () => {
        loaded();
        return { __esModule: true, default: { expoConfig: undefined } };
      });
      require('@/theme/brandPack');
      require('@/store/slices/themeSlice');
    });
    expect(loaded).not.toHaveBeenCalled();
  });
});

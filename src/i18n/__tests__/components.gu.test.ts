import { t, setLanguage, localizeDigits } from '..';

afterEach(() => setLanguage('en'));

describe('components texts in Gujarati', () => {
  it('counts: the noun does not change and the number is in Gujarati digits', () => {
    expect(t('components.printJobs.documentCount', { count: 1 }, 'gu')).toBe('૧ દસ્તાવેજ');
    expect(t('components.printJobs.documentCount', { count: 1250 }, 'gu')).toBe('૧,૨૫૦ દસ્તાવેજ');
    expect(t('components.printJobs.documentCount', { count: 1 })).toBe('1 document');
    expect(t('components.printJobs.documentCount', { count: 0 })).toBe('0 documents');
    expect(t('components.changeLog.changeCount', { count: 12 }, 'gu')).toBe('૧૨ ફેરફાર');
  });

  it('a sentence with placeholders puts the values where Gujarati wants them', () => {
    expect(t('components.steps.currentStep', { step: 2, total: 3, name: 'આઇટમ' }, 'gu')).toBe('૩માંથી પગલું ૨ · આઇટમ');
    expect(t('components.steps.currentStep', { step: 2, total: 3, name: 'Items' })).toBe('Step 2 of 3 · Items');
    expect(t('components.imageOverlay.positionLabel', { current: 1, total: 4 }, 'gu')).toBe('૪માંથી ફોટો ૧');
  });

  it('an identifier passed as a string keeps its digits', () => {
    expect(t('components.printJobs.cancelJobLabel', { start: 'Z0797', end: 'Z0801' }, 'gu')).toBe(
      'Z0797થી Z0801 સુધીની પ્રિન્ટ જૉબ રદ કરો'
    );
    expect(t('components.actions.deleteNumberedTitle', { entity: 'આવક પાવતી', number: 'Z0797' }, 'gu')).toBe(
      'આવક પાવતી Z0797 ડિલીટ કરીએ?'
    );
  });

  it('a formatted number: percentages and table cells follow the language', () => {
    expect(t('components.update.downloadingPercent', { percent: 45 }, 'gu')).toBe('ડાઉનલોડ થઈ રહ્યું છે… ૪૫%');
    expect(t('components.rack.tooLong', { max: 30, count: 34 }, 'gu')).toBe('આખા રેક માટે વધુમાં વધુ ૩૦ અક્ષર વાપરો (૩૪/૩૦).');
    // What the shared table, steppers and badges do with a number they format themselves
    expect(localizeDigits('1,23,456.5')).toBe('1,23,456.5');
    setLanguage('gu');
    expect(localizeDigits('1,23,456.5')).toBe('૧,૨૩,૪૫૬.૫');
    expect(t('components.tabBar.tabWithBadge', { label: 'ઑર્ડર', count: localizeDigits(String(12)) })).toBe('ઑર્ડર, ૧૨ બાકી');
  });
});

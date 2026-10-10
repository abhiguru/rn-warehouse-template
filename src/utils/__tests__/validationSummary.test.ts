import { validationSummary } from '../validationSummary';

describe('dispatch validation summary', () => {
  it('lists the messages, never the field names', () => {
    const summary = validationSummary({ registration: 'વાહન નંબર જરૂરી છે', customer_id: 'વેપારી જરૂરી છે' });
    expect(summary).toBe('વાહન નંબર જરૂરી છે\nવેપારી જરૂરી છે');
    expect(summary).not.toMatch(/registration|customer_id/);
  });

  it('lists a message two fields share once', () => {
    expect(validationSummary({ customer_id: 'વેપારી જરૂરી છે', customer_name: 'વેપારી જરૂરી છે' })).toBe('વેપારી જરૂરી છે');
  });

  it('is empty when there is nothing to say', () => {
    expect(validationSummary({})).toBe('');
    expect(validationSummary({ x: '' })).toBe('');
  });
});

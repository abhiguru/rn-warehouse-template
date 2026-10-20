/**
 * The Edit sensor form's rules: what must hold before Save, what counts as a change, and how
 * a sensor's limits come into the form.
 */
import type { SensorDevice } from '@/types/sensor.types';
import {
  formFromDevice,
  hasChanges,
  limitsChanged,
  limitsOf,
  parseMinutes,
  parseTemperature,
  validateForm,
  type SensorFormValues,
} from '../sensorEditForm';

const device = (over: Partial<SensorDevice> = {}): SensorDevice =>
  ({
    id: 's1',
    device_name: 'North chamber probe',
    location: 'Chamber 1',
    staleness_threshold_minutes: 30,
    alert_config: { temperature_min: -20, temperature_max: -15 },
    ...over,
  }) as SensorDevice;

const form = (over: Partial<SensorFormValues> = {}): SensorFormValues => ({ ...formFromDevice(device()), ...over });

describe('the form as it opens', () => {
  it("takes the sensor's settings and its limits from alert_config, empty where it has none", () => {
    expect(formFromDevice(device())).toEqual({ name: 'North chamber probe', location: 'Chamber 1', minutes: '30', lowest: '-20', highest: '-15' });
    expect(formFromDevice(device({ location: null as never, alert_config: null, staleness_threshold_minutes: 0 }))).toEqual({
      name: 'North chamber probe', location: '', minutes: '30', lowest: '', highest: '',
    });
    expect(formFromDevice(device({ alert_config: { temperature_max: 8 } }))).toMatchObject({ lowest: '', highest: '8' });
  });
});

describe('reading what was typed', () => {
  it('minutes are whole numbers; temperatures may be negative or decimal, with a point or a comma', () => {
    expect(parseMinutes(' 45 ')).toBe(45);
    expect(parseMinutes('4.5')).toBeNull();
    expect(parseMinutes('')).toBeNull();
    expect(parseTemperature('-18.5')).toBe(-18.5);
    expect(parseTemperature('−2,5')).toBe(-2.5);
    expect(parseTemperature('  ')).toBeUndefined();
    expect(parseTemperature('abc')).toBeNull();
    expect(parseTemperature('-')).toBeNull();
  });
});

describe('validation', () => {
  it('a sensor as it is passes', () => {
    expect(validateForm(form())).toEqual({});
    expect(validateForm(form({ lowest: '', highest: '' }))).toEqual({});
  });

  it('refuses an empty name, minutes outside 5 to 1440, and a text that is not a temperature', () => {
    expect(validateForm(form({ name: '   ' })).name).toBe('Enter a name.');
    expect(validateForm(form({ minutes: '4' })).minutes).toBe('Enter a whole number from 5 to 1440.');
    expect(validateForm(form({ minutes: '1441' })).minutes).toBeDefined();
    expect(validateForm(form({ minutes: '5' })).minutes).toBeUndefined();
    expect(validateForm(form({ minutes: '1440' })).minutes).toBeUndefined();
    expect(validateForm(form({ lowest: 'cold' })).lowest).toBeDefined();
    expect(validateForm(form({ highest: '101' })).highest).toBeDefined();
  });

  it('the lowest must be below the highest, and either may be left empty', () => {
    expect(validateForm(form({ lowest: '5', highest: '5' })).highest).toBe('The lowest temperature must be below the highest.');
    expect(validateForm(form({ lowest: '9', highest: '3' })).highest).toBeDefined();
    expect(validateForm(form({ lowest: '', highest: '3' }))).toEqual({});
    expect(validateForm(form({ lowest: '-30', highest: '' }))).toEqual({});
  });
});

describe('changes', () => {
  const original = form();

  it('nothing changed, also with spaces added or the same number typed another way', () => {
    expect(hasChanges(form(), original)).toBe(false);
    expect(hasChanges(form({ name: ' North chamber probe ' }), original)).toBe(false);
    expect(hasChanges(form({ lowest: '-20.0', minutes: '030' }), original)).toBe(false);
  });

  it('each field counts, a cleared limit and text that is not a number included', () => {
    expect(hasChanges(form({ name: 'South chamber probe' }), original)).toBe(true);
    expect(hasChanges(form({ location: '' }), original)).toBe(true);
    expect(hasChanges(form({ minutes: '45' }), original)).toBe(true);
    expect(hasChanges(form({ highest: '' }), original)).toBe(true);
    expect(hasChanges(form({ lowest: 'abc' }), original)).toBe(true);
  });

  it('limits are sent only when they changed, with null for a cleared one', () => {
    expect(limitsChanged(form(), original)).toBe(false);
    expect(limitsChanged(form({ name: 'Other' }), original)).toBe(false);
    expect(limitsChanged(form({ highest: '-10' }), original)).toBe(true);
    expect(limitsOf(form({ lowest: '', highest: '-10' }))).toEqual({ min: null, max: -10 });
  });
});

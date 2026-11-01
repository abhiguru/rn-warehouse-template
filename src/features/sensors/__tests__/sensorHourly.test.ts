import {
  HOURLY_CHUNK_DAYS,
  SENSOR_CSV_HEADER,
  bucketDaysFor,
  bucketHourlyRows,
  buildSensorCsv,
  chunkRange,
  csvText,
  hourlyHistoryData,
  mergeHourlyRows,
  rangeOfLastDays,
  selectablePeriods,
  summariseHourlyRows,
  type HourlyRow,
} from '../sensorHourly';

const DAY = 86_400_000;
const row = (hour: string, over: Partial<HourlyRow> = {}): HourlyRow => ({
  hour,
  sample_count: 10,
  temperature_min: 1,
  temperature_max: 3,
  temperature_avg: 2,
  humidity_min: 80,
  humidity_max: 90,
  humidity_avg: 85,
  ...over,
});

describe('chunkRange', () => {
  it('cuts two years into consecutive calls of at most 399 days that cover the range exactly', () => {
    const range = rangeOfLastDays(730, Date.UTC(2026, 10, 1));
    const chunks = chunkRange(range);
    expect(chunks.length).toBe(2);
    expect(chunks[0].fromMs).toBe(range.fromMs);
    expect(chunks[chunks.length - 1].toMs).toBe(range.toMs);
    chunks.forEach((chunk, index) => {
      expect(chunk.toMs - chunk.fromMs).toBeLessThanOrEqual(HOURLY_CHUNK_DAYS * DAY);
      if (index > 0) expect(chunk.fromMs).toBe(chunks[index - 1].toMs);
    });
  });

  it('is one call for 6 months and for a year, and none for an empty or backwards range', () => {
    expect(chunkRange(rangeOfLastDays(183, 1e12))).toHaveLength(1);
    expect(chunkRange(rangeOfLastDays(365, 1e12))).toHaveLength(1);
    expect(chunkRange({ fromMs: 5, toMs: 5 })).toEqual([]);
    expect(chunkRange({ fromMs: 9, toMs: 5 })).toEqual([]);
  });

  it('never asks for more than the server allows (400 days)', () => {
    expect(HOURLY_CHUNK_DAYS).toBeLessThanOrEqual(400);
  });
});

describe('mergeHourlyRows', () => {
  it('puts the chunks in hour order and keeps an hour that came twice once', () => {
    const merged = mergeHourlyRows([
      [row('2026-01-02T00:00:00Z'), row('2026-01-03T00:00:00Z')],
      [row('2026-01-01T00:00:00Z'), row('2026-01-03T00:00:00Z', { sample_count: 99 })],
    ]);
    expect(merged.map(r => r.hour)).toEqual(['2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z', '2026-01-03T00:00:00Z']);
    expect(merged[2].sample_count).toBe(99);
  });
});

describe('bucketing for the chart', () => {
  it('makes a day of hours one point: average weighted by the readings, lowest and highest of the hours', () => {
    const points = bucketHourlyRows(
      [
        row('2026-10-01T01:00:00Z', { sample_count: 10, temperature_avg: 2, temperature_min: 1, temperature_max: 3 }),
        row('2026-10-01T02:00:00Z', { sample_count: 30, temperature_avg: 4, temperature_min: 3, temperature_max: 6 }),
        row('2026-10-02T01:00:00Z', { sample_count: 5, temperature_avg: 8, temperature_min: 7, temperature_max: 9, humidity_avg: null, humidity_min: null, humidity_max: null }),
      ],
      1
    );
    expect(points).toEqual([
      { timestamp: '2026-10-01T00:00:00.000Z', temperature: 3.5, humidity: 85, temperature_min: 1, temperature_max: 6, humidity_min: 80, humidity_max: 90 },
      { timestamp: '2026-10-02T00:00:00.000Z', temperature: 8, humidity: null, temperature_min: 7, temperature_max: 9, humidity_min: null, humidity_max: null },
    ]);
  });

  it('uses days up to 6 months and weeks beyond', () => {
    expect(bucketDaysFor(183)).toBe(1);
    expect(bucketDaysFor(365)).toBe(7);
    expect(bucketDaysFor(730)).toBe(7);
    const weekly = bucketHourlyRows([row('2026-10-01T00:00:00Z'), row('2026-10-05T00:00:00Z'), row('2026-10-12T00:00:00Z')], 7);
    expect(weekly).toHaveLength(2);
  });

  it('skips a row whose hour cannot be read', () => {
    expect(bucketHourlyRows([row('not a date')], 1)).toEqual([]);
  });
});

describe('summary and history data', () => {
  it('summarises the whole range with weighted averages and the extremes', () => {
    const summary = summariseHourlyRows([
      row('2026-10-01T01:00:00Z', { sample_count: 10, temperature_avg: 2, temperature_min: -1, temperature_max: 3 }),
      row('2026-10-01T02:00:00Z', { sample_count: 30, temperature_avg: 4, temperature_min: 3, temperature_max: 8 }),
    ]);
    expect(summary).toMatchObject({ avg_temperature: 3.5, min_temperature: -1, max_temperature: 8, total_readings: 40, raw_reading_count: 40 });
  });

  it('answers the history screen in its own shape', () => {
    const data = hourlyHistoryData({ id: 's1', name: 'Chamber 1', location: 'North' }, 730, [row('2026-10-01T01:00:00Z')]);
    expect(data).toMatchObject({ device_id: 's1', device_name: 'Chamber 1', period_days: 730, aggregation_interval: '1 week', raw_reading_count: 10 });
    expect(data.readings).toHaveLength(1);
    expect(hourlyHistoryData({ id: 's1', name: 'x', location: '' }, 183, []).aggregation_interval).toBe('1 day');
  });
});

describe('the period picker', () => {
  it('offers 7 days always and each longer period once the data covers it', () => {
    expect(selectablePeriods(1, false)).toEqual([7]);
    expect(selectablePeriods(100, false)).toEqual([7, 14, 30, 90]);
    expect(selectablePeriods(200, false)).toEqual([7, 14, 30, 90, 183]);
    expect(selectablePeriods(800, false)).toEqual([7, 14, 30, 90, 183, 365, 730]);
  });

  it('leaves out 6 months and 2 years, not the year, on a backend without the hourly summary', () => {
    expect(selectablePeriods(800, true)).toEqual([7, 14, 30, 90, 365]);
  });
});

describe('the CSV', () => {
  it('has the English header and one line per hour, ended by CRLF, nulls empty', () => {
    const csv = buildSensorCsv('Chamber 1', [
      row('2026-10-01T01:00:00Z', { humidity_min: null, humidity_max: null, humidity_avg: null }),
      row('2026-10-01T02:00:00+00:00', { temperature_min: -2.5 }),
    ]);
    expect(SENSOR_CSV_HEADER).toBe('device,hour_utc,count,temp_min,temp_max,temp_avg,humidity_min,humidity_max,humidity_avg');
    expect(csv).toBe(
      [
        SENSOR_CSV_HEADER,
        'Chamber 1,2026-10-01T01:00:00.000Z,10,1,3,2,,,',
        'Chamber 1,2026-10-01T02:00:00.000Z,10,-2.5,3,2,80,90,85',
        '',
      ].join('\r\n')
    );
  });

  it('is only the header for no hours', () => {
    expect(buildSensorCsv('x', [])).toBe(`${SENSOR_CSV_HEADER}\r\n`);
  });

  it('quotes a device name with a comma, a quote or a line break, doubling the quotes', () => {
    expect(csvText('Chamber 1, north')).toBe('"Chamber 1, north"');
    expect(csvText('The "big" room')).toBe('"The ""big"" room"');
    expect(csvText('two\nlines')).toBe('"two\nlines"');
    expect(csvText(' padded')).toBe('" padded"');
    expect(csvText('plain')).toBe('plain');
    expect(buildSensorCsv('A, B', [row('2026-10-01T01:00:00Z')]).split('\r\n')[1].startsWith('"A, B",2026')).toBe(true);
  });

  it('keeps a name a spreadsheet would run as a formula from running', () => {
    expect(csvText('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvText('+1')).toBe("'+1");
    expect(csvText('@sum')).toBe("'@sum");
    expect(csvText('-cold')).toBe("'-cold");
  });

  it('keeps a Gujarati device name as it is', () => {
    expect(csvText('ચેમ્બર ૧')).toBe('ચેમ્બર ૧');
  });
});

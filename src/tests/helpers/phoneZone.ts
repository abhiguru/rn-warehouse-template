/**
 * For tests of days that must be India's whatever the clock zone of the phone.
 *
 * The suite runs in Asia/Kolkata on every machine (jest.global-setup.js) and a
 * test cannot change the zone under itself. In the suite the phone's zone is
 * therefore India's, and code that reads a day in the phone's zone gives the
 * right answer by coincidence: a wrong day cannot be shown. What can be shown
 * is the cause. A Date tells its day in the phone's zone only through its local
 * readers (`getDate`, `getFullYear`, `toDateString` ...); code that never calls
 * one on a moment cannot depend on the phone's zone for that moment.
 *
 * `watchPhoneZone(moments)` records every such read of the moments it is given,
 * and lets the read answer as usual. A test gives it the instants of its rows,
 * or the fixed "now" of its clock, draws the screen and expects no reads:
 *
 *   const watch = watchPhoneZone(['2026-09-30T20:00:00+00:00']);
 *   try {
 *     ... draw ...
 *     expect(watch.reads).toEqual([]);
 *   } finally {
 *     watch.restore();
 *   }
 *
 * A Date built from a calendar day (`new Date(2026, 9, 1)`, `parseLocalISODate`)
 * is another moment, local midnight, and reading it is not recorded: that is how
 * a plain day is written out, in any zone. Give "now" a time that is not on a
 * quarter of an hour, so that it is no zone's midnight.
 *
 * This file is not a test file, so the app's type check reads it too: it uses
 * no jest globals and replaces the readers by hand.
 */
const LOCAL_READERS = [
  'getFullYear',
  'getMonth',
  'getDate',
  'getDay',
  'getHours',
  'getMinutes',
  'getTimezoneOffset',
  'toDateString',
  'toLocaleDateString',
  'toLocaleTimeString',
  'toLocaleString',
] as const;

type Reader = (this: Date, ...args: unknown[]) => unknown;

export interface PhoneZoneWatch {
  /** One entry for each read, in order: "getDate of 2026-09-30T20:00:00.000Z". */
  reads: string[];
  /** Puts the readers back. Call it in `finally`. */
  restore: () => void;
}

export function watchPhoneZone(moments: readonly (string | number | Date)[]): PhoneZoneWatch {
  const watched = new Set(moments.map(moment => new Date(moment).getTime()));
  const reads: string[] = [];
  const prototype = Date.prototype as unknown as Record<string, Reader>;
  const originals = LOCAL_READERS.map(name => ({ name, reader: prototype[name] }));
  for (const { name, reader } of originals) {
    prototype[name] = function watchedReader(this: Date, ...args: unknown[]) {
      const time = this.getTime();
      if (watched.has(time)) reads.push(`${name} of ${new Date(time).toISOString()}`);
      return reader.apply(this, args);
    };
  }
  return {
    reads,
    restore: () => {
      for (const { name, reader } of originals) prototype[name] = reader;
    },
  };
}

/**
 * Where a read was answered from (WH-299, product/tech/app-offline-read-from-copy.md section 2).
 */

/** A read answered by the phone copy. `asOf` is the server's time of what the copy holds (ISO), never the phone's clock. */
export interface DataSource {
  kind: 'copy';
  asOf: string;
}

/** The copy became unreadable during a read (erased, replaced, or not this session's). Internal to the read layer. */
export class CopyReadError extends Error {
  constructor() {
    super('the phone copy could not be read');
    this.name = 'CopyReadError';
  }
}

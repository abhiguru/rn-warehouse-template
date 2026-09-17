import { isTemporaryGRNImageId } from '../imageId';

describe('isTemporaryGRNImageId', () => {
  it.each([undefined, null, '', 'temp_123', 'temp-legacy'])('recognizes deferred image id %p', (id) => {
    expect(isTemporaryGRNImageId(id)).toBe(true);
  });

  it.each(['3cc81bc1-fe4f-48e1-bf4c-6dd943fe79bb', 'uploaded-123'])('does not treat persisted id %s as deferred', (id) => {
    expect(isTemporaryGRNImageId(id)).toBe(false);
  });
});

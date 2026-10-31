import { photoUploadFailureText } from '../photoUploadError';

const FALLBACK = "Couldn't upload the photo. Try again.";

describe('photoUploadFailureText', () => {
  it('never shows the English sentence of a storage or server refusal', () => {
    const storage = Object.assign(new Error('new row violates row-level security policy'), { name: 'StorageApiError', status: 403 });
    expect(photoUploadFailureText(storage, FALLBACK)).toBe(FALLBACK);
    expect(photoUploadFailureText({ message: 'Bucket not found', code: '404' }, FALLBACK)).toBe(FALLBACK);
    expect(photoUploadFailureText('anything at all', FALLBACK)).toBe(FALLBACK);
  });

  it('words a request that got no answer through the photo wording', () => {
    const lost = photoUploadFailureText(new Error('Network request failed'), FALLBACK);
    expect(lost).toBe('No answer from the server. The photo change may have gone through. Check the photos on this screen before trying again.');
    expect(photoUploadFailureText({ message: '<html>Bad Gateway</html>', status: 502 }, FALLBACK)).toBe(lost);
  });
});

import { createLogger } from '@/utils/logger';
import { logPhotoFailure, photoAddFailure, photoUploadFailureText } from '../photoUploadError';

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

describe('photoAddFailure', () => {
  const LOST = 'No answer from the server. The photo change may have gone through. Check the photos on this screen before trying again.';

  it('a lost answer (M26): the check-the-photos sentence, and the photos are read again', () => {
    expect(photoAddFailure(LOST, FALLBACK)).toEqual({ message: LOST, reread: true });
    expect(photoAddFailure(new Error('Network request failed'), FALLBACK)).toEqual({ message: LOST, reread: true });
  });

  it('a plain failure (M25): the app\'s retry sentence, nothing read again', () => {
    expect(photoAddFailure(FALLBACK, FALLBACK)).toEqual({ message: FALLBACK, reread: false });
  });
});

describe('logPhotoFailure', () => {
  afterEach(() => jest.restoreAllMocks());

  it('logs no connection and a lost answer at info, with no console.error', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const log = createLogger('grn-photos');
    logPhotoFailure(log, 'Registration failed', { message: 'Network request failed' });
    logPhotoFailure(log, 'Confirmation failed', { message: 'Bad Gateway', status: 502 });
    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(2);
  });

  it('keeps console.error for an unexpected failure', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    logPhotoFailure(createLogger('grn-photos'), 'Registration failed', { message: 'permission denied', code: '42501' });
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});

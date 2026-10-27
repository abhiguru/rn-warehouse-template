import {
  registerSessionScoped,
  registeredSessionScopedNames,
  runSessionScopedClears,
} from '../sessionScopedRegistry';
import { advanceSessionGeneration } from '../sessionLifecycle';

const context = { dispatch: jest.fn() };

describe('session-scoped registry', () => {
  it('runs registered clears in registration order, awaiting each, and passes dispatch', async () => {
    const order: string[] = [];
    registerSessionScoped('t-first', async c => {
      await Promise.resolve();
      order.push(c === context ? 'first' : 'wrong-context');
    });
    registerSessionScoped('t-second', () => {
      order.push('second');
    });
    await runSessionScopedClears(context);
    expect(order).toEqual(['first', 'second']);
  });

  it('replaces an entry registered under the same name', async () => {
    const calls: string[] = [];
    registerSessionScoped('t-same', () => {
      calls.push('old');
    });
    registerSessionScoped('t-same', () => {
      calls.push('new');
    });
    await runSessionScopedClears(context);
    expect(calls).toEqual(['new']);
    expect(registeredSessionScopedNames().filter(name => name === 't-same')).toHaveLength(1);
  });

  it('also clears on a session generation change only when asked to', () => {
    const watched = jest.fn();
    const unwatched = jest.fn();
    registerSessionScoped('t-watched', watched, { onGenerationChange: true });
    registerSessionScoped('t-unwatched', unwatched);
    advanceSessionGeneration();
    expect(watched).toHaveBeenCalledTimes(1);
    expect(unwatched).not.toHaveBeenCalled();
  });

  it('stops watching the generation when the entry is replaced', () => {
    const old = jest.fn();
    registerSessionScoped('t-swap', old, { onGenerationChange: true });
    registerSessionScoped('t-swap', jest.fn());
    advanceSessionGeneration();
    expect(old).not.toHaveBeenCalled();
  });

  it('keeps a session change safe when a watched clear throws or rejects', async () => {
    registerSessionScoped('t-throws', () => {
      throw new Error('boom');
    }, { onGenerationChange: true });
    registerSessionScoped('t-rejects', async () => {
      throw new Error('boom');
    }, { onGenerationChange: true });
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    expect(() => advanceSessionGeneration()).not.toThrow();
    await new Promise(resolve => setImmediate(resolve));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});

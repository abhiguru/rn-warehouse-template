/**
 * Import before `@/store`. redux-persist arms a 5 second timer as the store is built and never clears it, which keeps
 * a Jest worker alive after a short file. Armed under fake timers it ends with the test environment.
 */
jest.useFakeTimers();

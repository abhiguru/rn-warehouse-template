// A native hand-off (camera, photo picker, share sheet) moves the app to the
// background without leaving the operator's workflow. The resume lifecycle
// consults this counter so such round trips do not suspend credentialed work.
let activeHandoffs = 0;

export function beginNativeHandoff(): () => void {
  activeHandoffs += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeHandoffs -= 1;
  };
}

export const isNativeHandoffActive = () => activeHandoffs > 0;

export async function withNativeHandoff<T>(run: () => Promise<T>): Promise<T> {
  const end = beginNativeHandoff();
  try {
    return await run();
  } finally {
    end();
  }
}

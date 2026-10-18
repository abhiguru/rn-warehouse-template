/**
 * A development aid for the swipe that does not scroll over the table body (phone run P2): with
 * `EXPO_PUBLIC_LOG_TABLE_RESPONDERS=1` in a development build, the rows of the table log the touch
 * negotiation (`start`/`move` capture, which these handlers never claim) and `console.log` it as
 * `[table-responder] <part> <event> target=<native tag>`. Off by default: it returns no props.
 *
 * Reading the log: a swipe that scrolls shows `move` entries and no cancel; a swipe that does not
 * scroll but shows `move` with an input as the target is a native text field holding the gesture.
 */
import type { GestureResponderEvent } from 'react-native';

export const LOG_TABLE_RESPONDERS = __DEV__ && process.env.EXPO_PUBLIC_LOG_TABLE_RESPONDERS === '1';

type Handlers = {
  onStartShouldSetResponderCapture?: (event: GestureResponderEvent) => boolean;
  onMoveShouldSetResponderCapture?: (event: GestureResponderEvent) => boolean;
};

export function responderLog(part: string): Handlers {
  if (!LOG_TABLE_RESPONDERS) return {};
  const log = (name: string) => (event: GestureResponderEvent) => {
    // eslint-disable-next-line no-console
    console.log(`[table-responder] ${part} ${name} target=${String(event.target)} y=${Math.round(event.nativeEvent.pageY)}`);
    return false;
  };
  return { onStartShouldSetResponderCapture: log('start'), onMoveShouldSetResponderCapture: log('move') };
}

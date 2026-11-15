import type { AccessibilityActionEvent } from 'react-native';
import { t as translate } from '@/i18n';

/**
 * The screen-reader "Refresh" action every list offers (WH-220): TalkBack and VoiceOver users cannot pull to
 * refresh, so the list's actions menu runs the same refresh as the pull. Spread onto the list:
 * `<FlashList {...listRefreshAccessibility(handleRefresh)} />`.
 */
export function listRefreshAccessibility(onRefresh: () => void) {
  return {
    accessibilityActions: [{ name: 'refresh', label: translate('lists.refreshAction') }],
    onAccessibilityAction: (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === 'refresh') onRefresh();
    },
  };
}

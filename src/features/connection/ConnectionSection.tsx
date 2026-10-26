/**
 * Help, "Connection" (WS-L): which path the phone reaches the server over, the server's address on the
 * warehouse network, and whether that address works, so a broken fallback shows before an outage.
 *
 *  - Connected via: Internet, or Warehouse network while the internet is not working
 *    (src/config/lanTransport.ts).
 *  - Warehouse network address: the server's own (`urls.lan`), or one typed here when the saved one is
 *    stale (a DHCP change moved the server inside its network). Typing is offered only while the server
 *    sends an address, and only the last number of it can change; the typed one is dropped when the server
 *    sends a different one or none (src/config/operatorServer.ts).
 *  - Check now, and the last check, daily on the warehouse Wi-Fi (src/config/lanCheck.ts).
 *
 * Built from the style guide's grouped list (§14.12): `HelpSection`, cells on `surface.card`, `StatusTag` for
 * every status (§3.5), `ui/Input` and `ui/Button`. A label with its value reads as one element (§11.3).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui';
import { StatusTag, STATUS_ICONS, type StatusKind } from '@/components/ui/StatusTag';
import { HelpSection } from '@/components/HelpSection';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { useLanStatus } from '@/hooks/useLanStatus';
import { getActiveOperatorServer, setTypedLanAddress } from '@/config/operatorServer';
import { LAN_ADDRESS_EXAMPLE } from '@/config/lanAddress';
import {
  checkLanNow,
  readLastLanCheck,
  subscribeLanCheck,
  type LanCheckAnswer,
  type LanCheckRecord,
} from '@/config/lanCheck';
import { formatDateTime } from '@/utils/formatters';
import { formatIdentifier, t } from '@/i18n';
import { showToast } from '@/utils/toast';
import { fontWeight, iconSize, space, typography, type ThemeTokens } from '@/theme/tokens';

export { LAN_ADDRESS_EXAMPLE };

/** How an outcome of a check is shown: a status (§3.5) with its word, and the sentence under it for a problem. */
export type CheckPresentation = {
  /** Null for "No address to check", which is not a status. */
  status: StatusKind | null;
  word: string;
  detail: string | null;
};

/** The status word and sentence for the outcome of a check. */
export function checkPresentation(answer: LanCheckAnswer): CheckPresentation {
  switch (answer.outcome) {
    case 'reachable':
      return { status: 'positive', word: t('settings.connection.statusReachable'), detail: null };
    case 'refused':
      return { status: 'negative', word: t('settings.connection.statusUnreachable'), detail: t('settings.connection.detailRefused') };
    case 'wrong-server':
      return { status: 'negative', word: t('settings.connection.statusUnreachable'), detail: t('settings.connection.detailWrongServer') };
    case 'other-network':
      return { status: 'neutral', word: t('settings.connection.statusOtherNetwork'), detail: t('settings.connection.detailOtherNetwork') };
    case 'network-unknown':
      return { status: 'neutral', word: t('settings.connection.statusNetworkUnknown'), detail: t('settings.connection.detailNetworkUnknown') };
    case 'not-set':
      return { status: null, word: t('settings.connection.resultNotSet'), detail: null };
    default: {
      // On iPhone a refused Local Network permission looks exactly like an address nobody answers.
      const hint = Platform.OS === 'ios' ? ` ${t('settings.connection.detailUnreachableIos')}` : '';
      return {
        status: 'negative',
        word: t('settings.connection.statusUnreachable'),
        detail: `${t('settings.connection.detailUnreachable')}${hint}`,
      };
    }
  }
}

function CheckResult({ answer, styles }: { answer: LanCheckAnswer; styles: ReturnType<typeof makeStyles> }) {
  const shown = checkPresentation(answer);
  return (
    <View
      style={styles.result}
      accessible
      accessibilityLabel={shown.detail ? `${shown.word}. ${shown.detail}` : shown.word}
      accessibilityLiveRegion="polite"
    >
      {shown.status ? <StatusTag status={shown.status} label={shown.word} /> : <Text style={styles.value}>{shown.word}</Text>}
      {shown.detail ? <Text style={styles.secondary}>{shown.detail}</Text> : null}
    </View>
  );
}

export function ConnectionSection() {
  const styles = useThemedStyles(makeStyles);
  const tokens = useTokens();
  const lan = useLanStatus();
  // The server read from the saved copy each time the address changes or is saved here.
  const [saves, setSaves] = useState(0);
  const server = getActiveOperatorServer();
  const typed = Boolean(server?.lanTyped);
  // Typing is possible only while the server sends an address: the person corrects its host part.
  const offered = server?.lan ?? null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<LanCheckAnswer | null>(null);
  const [last, setLast] = useState<LanCheckRecord | null>(null);

  const refreshLast = useCallback(() => {
    void readLastLanCheck().then(setLast);
  }, []);
  useEffect(() => {
    refreshLast();
    return subscribeLanCheck(refreshLast);
    // The address in use decides which record is shown.
  }, [refreshLast, lan.lan, saves]);

  const address = lan.lan;
  const openEditor = () => {
    setDraft(address ?? '');
    setProblem(null);
    setEditing(true);
  };
  const save = async () => {
    const saved = await setTypedLanAddress(draft);
    if (!saved) {
      setProblem(
        t('settings.connection.addressInvalid', {
          server: formatIdentifier(offered ?? LAN_ADDRESS_EXAMPLE),
          example: formatIdentifier(LAN_ADDRESS_EXAMPLE),
        })
      );
      return;
    }
    setEditing(false);
    setProblem(null);
    setResult(null);
    setSaves(count => count + 1);
    showToast(t('settings.connection.addressSaved'));
  };
  const useServerAddress = async () => {
    if (await setTypedLanAddress('')) {
      setEditing(false);
      setProblem(null);
      setResult(null);
      setSaves(count => count + 1);
    }
  };
  const check = async () => {
    setChecking(true);
    setResult(null);
    try {
      setResult(await checkLanNow('manual'));
    } finally {
      setChecking(false);
    }
  };

  const viaWord = t(lan.path === 'lan' ? 'settings.connection.viaWarehouseNetwork' : 'settings.connection.viaInternet');
  const sourceWord = t(typed ? 'settings.connection.addressTyped' : 'settings.connection.addressFromServer');
  const addressText = address ? formatIdentifier(address) : t('common.notSet');
  const problemText = lan.failure === 'old-configuration' ? t('settings.connection.oldConfiguration') : null;

  return (
    <HelpSection title={t('settings.connection.title')}>
      <View style={[styles.cell, styles.divided]}>
        <View
          style={styles.group}
          accessible
          accessibilityLabel={`${t('settings.connection.connectedVia')}, ${viaWord}. ${t('settings.connection.viaHelp')}`}
        >
          <Text style={styles.label}>{t('settings.connection.connectedVia')}</Text>
          <StatusTag status={lan.path === 'lan' ? 'informative' : 'neutral'} label={viaWord} />
          <Text style={styles.secondary}>{t('settings.connection.viaHelp')}</Text>
        </View>
        {problemText ? (
          <View style={styles.problem} accessible accessibilityLabel={problemText} accessibilityLiveRegion="polite">
            <Icon name={STATUS_ICONS.negative} size={iconSize.sm} color={tokens.status.negative.text} />
            <Text style={styles.warning}>{problemText}</Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.cell, styles.divided]}>
        <View
          style={styles.group}
          accessible
          accessibilityLabel={
            address
              ? `${t('settings.connection.addressTitle')}, ${addressText}. ${sourceWord}`
              : `${t('settings.connection.addressTitle')}, ${addressText}. ${t('settings.connection.addressNone')}`
          }
        >
          <Text style={styles.label}>{t('settings.connection.addressTitle')}</Text>
          <Text style={styles.value} selectable>
            {addressText}
          </Text>
          <Text style={styles.secondary}>{address ? sourceWord : t('settings.connection.addressNone')}</Text>
        </View>
        {editing ? (
          <View style={styles.form}>
            <Input
              label={t('settings.connection.addressFieldLabel')}
              value={draft}
              onChangeText={text => {
                setDraft(text);
                if (problem) setProblem(null);
              }}
              placeholder={LAN_ADDRESS_EXAMPLE}
              helperText={t('settings.connection.addressHelp')}
              error={problem ?? undefined}
              identifier
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={() => void save()}
              showClearButton
            />
            <View style={styles.buttons}>
              <Button type="primary" size="auto" onPress={() => void save()}>
                {t('settings.connection.addressSave')}
              </Button>
              <Button
                type="secondary"
                variant="normal"
                size="auto"
                onPress={() => {
                  setEditing(false);
                  setProblem(null);
                }}
              >
                {t('common.cancel')}
              </Button>
            </View>
          </View>
        ) : (
          <View style={styles.buttons}>
            {offered ? (
              <Button type="tertiary" size="auto" onPress={openEditor}>
                {t('settings.connection.addressChange')}
              </Button>
            ) : null}
            {typed ? (
              <Button type="tertiary" size="auto" onPress={() => void useServerAddress()}>
                {t('settings.connection.addressUseServer')}
              </Button>
            ) : null}
          </View>
        )}
      </View>

      <View style={styles.cell}>
        <View style={styles.buttons}>
          <Button
            type="secondary"
            size="auto"
            onPress={() => void check()}
            loading={checking}
            loadingText={t('settings.connection.checking')}
            disabled={!address || checking}
          >
            {t('settings.connection.checkNow')}
          </Button>
        </View>
        {result ? <CheckResult answer={result} styles={styles} /> : null}
        <Text style={styles.secondary}>
          {last
            ? t('settings.connection.lastChecked', {
                when: formatDateTime(new Date(last.at)),
                result: checkPresentation(last).word,
              })
            : t('settings.connection.neverChecked')}
        </Text>
        <Text style={styles.secondary}>{t('settings.connection.dailyNote')}</Text>
      </View>
    </HelpSection>
  );
}

const makeStyles = (t: ThemeTokens) => ({
  cell: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.xs,
  },
  divided: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  group: {
    gap: space.xs,
  },
  form: {
    gap: space.sm,
    marginTop: space.sm,
  },
  buttons: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
    alignItems: 'center' as const,
  },
  result: {
    gap: space.xs,
  },
  problem: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.xs,
    marginTop: space.xs,
  },
  label: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  value: {
    ...typography.body,
    color: t.text.primary,
  },
  secondary: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  warning: {
    ...typography.body,
    flex: 1,
    fontWeight: fontWeight.semibold,
    color: t.status.negative.text,
  },
});

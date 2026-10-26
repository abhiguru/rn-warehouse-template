/**
 * Help, "Connection" (WS-L): which path the phone reaches the server over, the server's address on the
 * warehouse network, and whether that address works, so a broken fallback shows before an outage.
 *
 *  - Connected via: Internet, or Warehouse network while the internet is not working
 *    (src/config/lanTransport.ts).
 *  - Warehouse network address: the server's own (`urls.lan`), or one typed here when the saved one is
 *    stale (a DHCP change). A typed address is kept until the server sends a different one.
 *  - Check now, and the last check, daily on Wi-Fi (src/config/lanCheck.ts).
 *
 * Built from the style guide's grouped list (§14.12): cells on `surface.card`, `ui/Input` and `ui/Button`.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { useThemedStyles } from '@/hooks/useTheme';
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
import { formatIdentifier, localizeDigits, t } from '@/i18n';
import { showToast } from '@/utils/toast';
import { fontWeight, layout, radius, space, typography, type ThemeTokens } from '@/theme/tokens';

export { LAN_ADDRESS_EXAMPLE };

/** The sentence for the outcome of a check. */
export function checkResultText(answer: LanCheckAnswer): string {
  switch (answer.outcome) {
    case 'reachable':
      return t('settings.connection.resultReachable', {
        ms: localizeDigits(String(Math.max(1, Math.round((answer as LanCheckRecord).ms ?? 0)))),
      });
    case 'refused':
      return t('settings.connection.resultRefused');
    case 'wrong-server':
      return t('settings.connection.resultWrongServer');
    case 'not-set':
      return t('settings.connection.resultNotSet');
    default:
      return t('settings.connection.resultUnreachable');
  }
}

export function ConnectionSection() {
  const styles = useThemedStyles(makeStyles);
  const lan = useLanStatus();
  // The server read from the saved copy each time the address changes or is saved here.
  const [saves, setSaves] = useState(0);
  const server = getActiveOperatorServer();
  const typed = Boolean(server?.lanTyped);
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
      setProblem(t('settings.connection.addressInvalid', { example: formatIdentifier(LAN_ADDRESS_EXAMPLE) }));
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

  return (
    <View style={styles.section}>
      <SectionHeader title={t('settings.connection.title')} style={styles.sectionHeader} />
      <View style={styles.sectionContent}>
        <View style={[styles.cell, styles.divided]}>
          <Text style={styles.label}>{t('settings.connection.connectedVia')}</Text>
          <Text style={styles.value}>
            {t(lan.path === 'lan' ? 'settings.connection.viaWarehouseNetwork' : 'settings.connection.viaInternet')}
          </Text>
          <Text style={styles.secondary}>{t('settings.connection.viaHelp')}</Text>
          {lan.failure === 'old-configuration' ? (
            <Text style={styles.warning} accessibilityLiveRegion="polite">
              {t('settings.connection.oldConfiguration')}
            </Text>
          ) : null}
        </View>

        <View style={[styles.cell, styles.divided]}>
          <Text style={styles.label}>{t('settings.connection.addressTitle')}</Text>
          <Text style={styles.value} selectable>
            {address ? formatIdentifier(address) : t('common.notSet')}
          </Text>
          {address ? (
            <Text style={styles.secondary}>
              {t(typed ? 'settings.connection.addressTyped' : 'settings.connection.addressFromServer')}
            </Text>
          ) : null}
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
              <Button type="tertiary" size="auto" onPress={openEditor}>
                {t('settings.connection.addressChange')}
              </Button>
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
          {result ? (
            <Text
              style={result.outcome === 'reachable' ? styles.value : styles.warning}
              accessibilityLiveRegion="polite"
            >
              {checkResultText(result)}
            </Text>
          ) : null}
          <Text style={styles.secondary}>
            {last
              ? t('settings.connection.lastChecked', { when: formatDateTime(new Date(last.at)), result: checkResultText(last) })
              : t('settings.connection.neverChecked')}
          </Text>
          <Text style={styles.secondary}>{t('settings.connection.dailyNote')}</Text>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (t: ThemeTokens) => ({
  section: {
    marginBottom: space.xxl,
  },
  // SectionHeader brings its own top padding; the section's bottom margin already spaces it.
  sectionHeader: {
    marginHorizontal: layout.marginCompact,
    paddingTop: 0,
  },
  sectionContent: {
    marginHorizontal: layout.marginCompact,
    borderRadius: radius.card,
    overflow: 'hidden' as const,
    backgroundColor: t.surface.card,
  },
  cell: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.xs,
  },
  divided: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
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
    fontWeight: fontWeight.semibold,
    color: t.status.negative.text,
  },
});

/**
 * The app's name and installed version at the foot of Settings and Profile, and
 * the "Details for support" block of Help (SR-12).
 *
 * The version and build are the installed binary's own (expo-application:
 * `nativeApplicationVersion`, `nativeBuildVersion` = Android versionName and
 * versionCode, iOS CFBundleShortVersionString and CFBundleVersion), which an EAS
 * build with `appVersionSource: "remote"` sets even when the embedded config still
 * says app.json's build 1. So a new release needs no change here. Where the native
 * values are missing, and in Expo Go (whose native values are Expo Go's own), the
 * iOS `Constants.platform.ios.buildNumber` and then the embedded config
 * (`Constants.expoConfig`: app.json's `version`, `android.versionCode`,
 * `ios.buildNumber`) are used. Both are identifiers: their digits stay 0-9 in
 * Gujarati (`formatIdentifier`).
 *
 * The support details name the app, version, build, the phone's system, the
 * facility and its server address. They never carry a token, a phone number or
 * anything from the profile. They are shared with React Native's `Share` (a long
 * press on the version, or the button under the block).
 */
import React, { useCallback } from 'react';
import { Platform, Pressable, Share, Text, View } from 'react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography, trackedText, type ThemeTokens } from '@/theme/tokens';
import { formatIdentifier, t as tr } from '@/i18n';
import { getActiveOperatorServer } from '@/config/operatorServer';
import { createLogger, loggableError } from '@/utils/logger';

const log = createLogger('appVersion');

export interface AppVersionInfo {
  /** app.json `version`, e.g. "0.1.0" */
  version: string;
  /** Android versionCode or iOS buildNumber; null when the metadata has none */
  build: string | null;
}

/** The installed app's version and build: the binary's own, else its embedded metadata. */
export function getAppVersionInfo(): AppVersionInfo {
  const config = Constants.expoConfig;
  // In Expo Go the native values are Expo Go's, not this app's.
  // (Compared as text so that a test's stand-in for expo-constants needs no enum.)
  const binary = String(Constants.executionEnvironment) !== 'storeClient';
  const version = (binary ? present(Application.nativeApplicationVersion) : null) ?? present(config?.version) ?? '0.1.0';
  const build =
    (binary ? present(Application.nativeBuildVersion) : null) ??
    (Platform.OS === 'ios' ? present(Constants.platform?.ios?.buildNumber) : null) ??
    present(Platform.OS === 'ios' ? config?.ios?.buildNumber : config?.android?.versionCode);
  return { version, build };
}

/** The value as text, or null when it is missing or blank. */
function present(raw: string | number | null | undefined): string | null {
  return raw === undefined || raw === null || String(raw).trim() === '' ? null : String(raw);
}

const appName = (): string => process.env.EXPO_PUBLIC_APP_NAME || 'Warehouse Manager';

/** Proper names of the phone systems; never translated. */
const SYSTEM_NAMES: Record<string, string> = { android: 'Android', ios: 'iOS' };

function systemVersion(): string {
  // Android reports its API level as Platform.Version; the release ("14") is what people know.
  const release = Platform.OS === 'android' ? (Platform.constants as { Release?: string } | undefined)?.Release : undefined;
  return formatIdentifier(release || Platform.Version);
}

/** The support details, one per line, in the app's language. */
export function buildDiagnostics(): string {
  const { version, build } = getAppVersionInfo();
  const server = getActiveOperatorServer();
  const lines = [
    tr('settings.diagnostics.app', { name: appName() }),
    build
      ? tr('settings.diagnostics.version', { version: formatIdentifier(version), build: formatIdentifier(build) })
      : tr('settings.diagnostics.versionNoBuild', { version: formatIdentifier(version) }),
    tr('settings.diagnostics.device', {
      system: SYSTEM_NAMES[Platform.OS] ?? Platform.OS,
      systemVersion: systemVersion(),
    }),
  ];
  if (server) {
    lines.push(
      tr('settings.diagnostics.facility', { facility: server.companyName || server.displayName }),
      tr('settings.diagnostics.server', { origin: formatIdentifier(server.origin) })
    );
  } else {
    lines.push(tr('settings.diagnostics.notConnected'));
  }
  return lines.join('\n');
}

/** "Management System v0.1.0 (build 1)", or without the build when there is none. */
function versionLine(): string {
  const { version, build } = getAppVersionInfo();
  return build
    ? tr('settings.footer.versionBuild', { version: formatIdentifier(version), build: formatIdentifier(build) })
    : tr('settings.footer.version', { version: formatIdentifier(version) });
}

function shareDiagnostics(): void {
  Share.share({ message: buildDiagnostics(), title: tr('settings.diagnostics.title') }).catch((error: unknown) => {
    log.warn('Share failed', loggableError(error));
  });
}

export interface AppVersionFooterProps {
  /** Also list the support details with a share button (Help). */
  diagnostics?: boolean;
}

export function AppVersionFooter({ diagnostics = false }: AppVersionFooterProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const onAccessibilityAction = useCallback((event: { nativeEvent: { actionName: string } }) => {
    if (event.nativeEvent.actionName === 'longpress') shareDiagnostics();
  }, []);

  const line = versionLine();
  return (
    <View>
      {diagnostics && (
        <View style={styles.block} testID="app-diagnostics">
          <Text style={styles.blockTitle} accessibilityRole="header">
            {tr('settings.diagnostics.title')}
          </Text>
          <View style={styles.card}>
            {buildDiagnostics()
              .split('\n')
              .map((text) => (
                <Text key={text} style={styles.detail} selectable>
                  {text}
                </Text>
              ))}
          </View>
          <Pressable
            testID="app-diagnostics-share"
            onPress={shareDiagnostics}
            style={({ pressed }) => [styles.shareButton, pressed && styles.shareButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel={tr('settings.diagnostics.share')}
            accessibilityHint={tr('settings.diagnostics.shareHint')}
          >
            <Icon name="share-variant-outline" size={iconSize.md} color={t.brand.tint} />
            <Text style={styles.shareText}>{tr('settings.diagnostics.share')}</Text>
          </Pressable>
        </View>
      )}
      <Pressable
        testID="app-version-footer"
        style={styles.footer}
        onLongPress={shareDiagnostics}
        accessible
        accessibilityLabel={`${appName()}, ${line}`}
        accessibilityHint={tr('settings.diagnostics.shareHint')}
        accessibilityActions={[{ name: 'longpress', label: tr('settings.diagnostics.share') }]}
        onAccessibilityAction={onAccessibilityAction}
      >
        <Icon name="snowflake" size={iconSize.lg} color={t.icon.secondary} />
        <Text style={styles.footerTitle}>{appName()}</Text>
        <Text style={styles.footerSubtitle} selectable>
          {line}
        </Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (t: ThemeTokens) => ({
  footer: {
    alignItems: 'center' as const,
    gap: space.xs,
    paddingVertical: space.xxxl,
    paddingHorizontal: layout.marginCompact,
  },
  footerTitle: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.text.secondary,
    textAlign: 'center' as const,
  },
  footerSubtitle: {
    ...typography.footnote,
    color: t.text.secondary,
    textAlign: 'center' as const,
  },
  block: {
    marginTop: space.xxl,
  },
  blockTitle: {
    ...typography.footnote,
    textTransform: 'uppercase' as const,
    letterSpacing: trackedText(0.5),
    color: t.text.secondary,
    marginHorizontal: layout.marginCompact,
    marginBottom: space.sm,
    paddingHorizontal: space.lg,
  },
  card: {
    marginHorizontal: layout.marginCompact,
    borderRadius: radius.card,
    backgroundColor: t.surface.card,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.xs,
  },
  detail: {
    ...typography.footnote,
    color: t.text.primary,
  },
  shareButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.sm,
    minHeight: touchTarget,
    marginHorizontal: layout.marginCompact,
    marginTop: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: t.border.button,
  },
  shareButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  shareText: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
  },
});

export default AppVersionFooter;

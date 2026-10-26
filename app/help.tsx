/**
 * Help (review 2026-10-13, O07): a grouped list on background.grouped, opened
 * from Settings.
 *
 * Sections: the facility and its server address; the connection (which path
 * reaches the server, the warehouse network address and its check); who to ask (the app's
 * configuration holds no support contact, so Help says so rather than inventing
 * one, and the legal pages are not offered as help); the four roles, with the
 * person's own marked; what to do when the phone, the number or the role
 * changes; and the support details that can be shared (AppVersionFooter).
 *
 * Signed-in only: routeAccess sends a signed-out visitor to sign-in.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { HelpSection as Section } from '@/components/HelpSection';
import { AppVersionFooter } from '@/components/AppVersionFooter';
import { ConnectionSection } from '@/features/connection/ConnectionSection';
import { getActiveOperatorServer } from '@/config/operatorServer';
import { isCentralLoginConfigured } from '@/config/envConfig';
import { useAppSelector } from '@/store/hooks';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { formatIdentifier, t, type TranslationKey } from '@/i18n';
import { roleLabel } from '@/utils/roleLabel';
import {
  fontWeight,
  iconSize,
  space,
  touchTarget,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';

const ROLES: { role: string; description: TranslationKey }[] = [
  { role: 'admin', description: 'users.roleDescription.admin' },
  { role: 'supervisor', description: 'users.roleDescription.supervisor' },
  { role: 'staff', description: 'users.roleDescription.staff' },
  { role: 'customer', description: 'users.roleDescription.customer' },
];

export default function HelpScreen() {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const tokens = useTokens();
  const ownRole = useAppSelector((state) => state.auth.userProfile?.role);
  const server = getActiveOperatorServer();
  const facility = server ? server.companyName || server.displayName : '';
  const changes = [
    t(isCentralLoginConfigured() ? 'settings.help.newPhoneCentral' : 'settings.help.newPhone'),
    t('settings.help.newNumber'),
    t('settings.help.newRole'),
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <EdgeToEdgeStatusBar barStyle={tokens.statusBarStyle} />
      <View style={styles.navigationBar}>
        <HeaderBackButton style={styles.navBackButton} />
        <Text style={styles.navTitle} accessibilityRole="header">
          {t('settings.help.title')}
        </Text>
        <View style={styles.navPlaceholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingTop: space.lg, paddingBottom: insets.bottom + space.xxxl }}
        showsVerticalScrollIndicator={false}
      >
        <Section title={t('settings.help.facilityTitle')}>
          {server ? (
            <View style={styles.cell}>
              <Text style={styles.facilityName}>{facility}</Text>
              <Text style={styles.label}>{t('settings.help.serverLabel')}</Text>
              <Text style={styles.value} selectable>
                {formatIdentifier(server.origin)}
              </Text>
            </View>
          ) : (
            <View style={styles.cell}>
              <Text style={styles.body}>{t('settings.diagnostics.notConnected')}</Text>
            </View>
          )}
        </Section>

        {server ? <ConnectionSection /> : null}

        <Section title={t('settings.help.askTitle')}>
          <View style={styles.cell}>
            {ownRole === 'admin' ? (
              // An administrator has no administrator to ask: the details below go to whoever set up the server.
              <Text style={styles.body}>{t('settings.help.askAdminSelf')}</Text>
            ) : (
              <>
                <Text style={styles.body}>{t('settings.help.askAdmin')}</Text>
                <Text style={styles.secondary}>{t('settings.help.noContact')}</Text>
              </>
            )}
          </View>
        </Section>

        <Section title={t('settings.help.rolesTitle')}>
          <View style={[styles.cell, styles.divided]}>
            <Text style={styles.bodyStrong}>{t('settings.help.yourRole', { role: roleLabel(ownRole) })}</Text>
          </View>
          {ROLES.map(({ role, description }, index) => {
            const own = role === ownRole;
            const name = roleLabel(role);
            const text = t(description);
            return (
              <View
                key={role}
                style={[styles.roleRow, index < ROLES.length - 1 && styles.divided]}
                accessible
                accessibilityLabel={`${name}, ${text}`}
                accessibilityState={{ selected: own }}
              >
                <Icon
                  name={own ? 'account-check' : 'account-outline'}
                  size={iconSize.md}
                  color={own ? tokens.brand.tint : tokens.icon.secondary}
                />
                <View style={styles.roleText}>
                  <Text style={own ? styles.bodyStrong : styles.body}>{name}</Text>
                  <Text style={styles.secondary}>{text}</Text>
                </View>
              </View>
            );
          })}
        </Section>

        <Section title={t('settings.help.changesTitle')}>
          {changes.map((text, index) => (
            <View key={text} style={[styles.cell, index < changes.length - 1 && styles.divided]}>
              <Text style={styles.body}>{text}</Text>
            </View>
          ))}
        </Section>

        <AppVersionFooter diagnostics />
      </ScrollView>
    </View>
  );
}

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.grouped,
  },
  navigationBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    minHeight: touchTarget,
    paddingHorizontal: space.sm,
    backgroundColor: t.surface.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  navBackButton: {
    minWidth: 80,
  },
  navTitle: {
    ...typography.headline,
    color: t.text.primary,
    flexShrink: 1,
  },
  navPlaceholder: {
    width: 80,
  },
  scrollView: {
    flex: 1,
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
  roleRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  roleText: {
    flex: 1,
    gap: space.xxs,
  },
  facilityName: {
    ...typography.headline,
    color: t.text.primary,
  },
  label: {
    ...typography.footnote,
    color: t.text.secondary,
    marginTop: space.xs,
  },
  value: {
    ...typography.body,
    color: t.text.primary,
  },
  body: {
    ...typography.body,
    color: t.text.primary,
  },
  bodyStrong: {
    ...typography.body,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
  },
  secondary: {
    ...typography.footnote,
    color: t.text.secondary,
  },
});

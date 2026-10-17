/**
 * Privacy policy screen: reading text (style guide §4, §12).
 *
 * The full privacy policy: data collection, use and user rights.
 * Section titles are headers for screen readers; body text uses
 * typography.body in text.primary on a surface.card column.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { ASSOCIATION_NAME, LEGAL_UPDATED, legalParty } from '@/constants/legal';
import {
  fontWeight,
  layout,
  radius,
  space,
  touchTarget,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

function Paragraph({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return <Text style={styles.paragraph}>{children}</Text>;
}

function Subheading({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Text style={styles.subheading} accessibilityRole="header">
      {children}
    </Text>
  );
}

function BulletList({ items }: { items: string[] }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.bulletList}>
      {items.map(item => (
        <View
          key={item}
          style={styles.bulletItem}
          accessible
          accessibilityLabel={item}
        >
          <Text style={styles.bullet}>•</Text>
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

export default function PrivacyPolicyScreen() {
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const party = legalParty();
  const ownServer = party.name
    ? `${party.name}'s own server`
    : 'the server of the cold storage you connected to';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />

      {/* Navigation Bar */}
      <View style={styles.navigationBar}>
        <HeaderBackButton style={styles.navBackButton} />
        <Text
          style={styles.navTitle}
          accessibilityRole="header"
          numberOfLines={1}
        >
          Privacy policy
        </Text>
        <View style={styles.navPlaceholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + space.xxxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          {/* Header */}
          <Text style={styles.lastUpdated}>Last updated: {LEGAL_UPDATED}</Text>

          <Paragraph>
            {party.leading} ("we", "us", or "our") is responsible for the
            records you enter in this mobile application (the "App"). The{' '}
            {ASSOCIATION_NAME} (the "Association") provides the App to its
            member cold storages; each member keeps its own records on its own
            server. This Privacy Policy explains what we collect, where it is
            kept, how we use it and who can see it.
          </Paragraph>

          {/* Section 1 */}
          <Section title="1. Information we collect">
            <Paragraph>
              We collect information that you provide directly to us:
            </Paragraph>

            <Subheading>Personal information</Subheading>
            <BulletList
              items={[
                'Mobile number (required to sign in with a one-time code)',
                'Name (as given by you or by your cold storage)',
                'Your role and the customers you can see, as set by your cold storage',
              ]}
            />

            <Subheading>Content you provide</Subheading>
            <BulletList
              items={[
                'Records you enter: customers, items, GRNs, dispatches, invoices and stock',
                'Photos of goods and documents for GRNs and dispatches, taken with the camera or chosen from your phone',
                'Notes and comments on records',
              ]}
            />

            <Subheading>On your phone</Subheading>
            <BulletList
              items={[
                'Your choices (language, light or dark, colours) and the address of your cold storage, kept on your phone only',
                'Your signed-in session, kept in the phone\'s secure storage',
                'Crash reports, if the organisation that distributes your copy of the App has switched them on: the App version, the phone model, your role, the text of the error and a short trail of what the App did just before it (such as requests made); phone numbers, codes and tokens are filtered out, but names and other words from your records may remain',
              ]}
            />
          </Section>

          {/* Section 2 */}
          <Section title="2. How we use your information">
            <Paragraph>We use the information we collect to:</Paragraph>
            <BulletList
              items={[
                'Provide, maintain, and improve the App and our services',
                'Process and manage your orders, GRNs, dispatches and invoices',
                'Check who you are with a one-time code and secure your account',
                'Show you only what your role and customers allow',
                'Respond to your inquiries and provide support',
                'Detect, prevent, and address technical issues and security threats',
                'Comply with legal obligations and enforce our terms',
              ]}
            />
          </Section>

          {/* Section 3 */}
          <Section title="3. Information sharing and disclosure">
            <Paragraph>
              We do not sell your information. We may share it in the following
              circumstances:
            </Paragraph>

            <Subheading>Within the cold storage</Subheading>
            <Paragraph>
              Staff of the cold storage see records according to their role.
              Customers see only their own records.
            </Paragraph>

            <Subheading>Service providers</Subheading>
            <Paragraph>
              We use service providers who perform services on our behalf,
              including:
            </Paragraph>
            <BulletList
              items={[
                'The server software your cold storage runs (Supabase, open source)',
                'An SMS provider that delivers your one-time code (your mobile number and the code)',
                'Crash reports (Sentry/GlitchTip), only if the organisation that distributes your copy of the App switches them on: the app version, the phone model, your role, the error text and a short trail of recent activity, which may contain names from your records',
              ]}
            />
            <Paragraph>
              Where your copy of the App uses the Association's sign-in, the
              Association's sign-in keeps your mobile number and, if you enter
              it, your name. A cold storage sees that name when you ask it for
              access.
            </Paragraph>

            <Subheading>Business transfers</Subheading>
            <Paragraph>
              If the cold storage is involved in a merger, acquisition, or sale
              of assets, your information may be transferred as part of that
              transaction.
            </Paragraph>

            <Subheading>Legal requirements</Subheading>
            <Paragraph>
              We may disclose your information if required by law, regulation,
              legal process, or governmental request.
            </Paragraph>

            <Subheading>With your consent</Subheading>
            <Paragraph>
              We may share your information with your consent or at your
              direction.
            </Paragraph>
          </Section>

          {/* Section 4 */}
          <Section title="4. Data storage and security">
            <Paragraph>
              Your records (customers, GRNs, dispatches, invoices and stock) are
              stored on {ownServer}. They are not kept on a shared server of the
              Association.
            </Paragraph>
            <Paragraph>
              We use appropriate technical and organizational measures to
              protect your personal information against unauthorized access,
              alteration, disclosure, or destruction. These measures include:
            </Paragraph>
            <BulletList
              items={[
                'Encrypted connections (https) between the App and the server',
                'Sign-in with a one-time code sent to your mobile number',
                'Access limited by role and customers, which the cold storage can remove at any time',
                'Nothing the App stores on your phone is copied to your Google account by Android backup',
              ]}
            />
            <Paragraph>
              While we strive to protect your information, no method of
              transmission over the Internet or electronic storage is 100%
              secure.
            </Paragraph>
          </Section>

          {/* Section 5 */}
          <Section title="5. Data retention">
            <Paragraph>
              We retain your personal information for as long as necessary to
              fulfill the purposes for which it was collected, including to
              satisfy legal, accounting, or reporting requirements. The
              retention period may vary depending on the context and our legal
              obligations.
            </Paragraph>
            <Paragraph>
              You can delete your account in the App under Settings. When your
              account is deleted, we will delete or anonymize your personal
              information within a reasonable timeframe, unless retention is
              required by law.
            </Paragraph>
          </Section>

          {/* Section 6 */}
          <Section title="6. Your rights and choices">
            <Paragraph>
              You have the following rights regarding your personal information:
            </Paragraph>
            <BulletList
              items={[
                'Access: Request access to the personal information we hold about you',
                'Correction: Request correction of inaccurate or incomplete information',
                'Deletion: Request deletion of your personal information, subject to legal requirements',
                'Portability: Request a copy of your data in a portable format',
                'Withdraw consent: Ask the organisation that distributes your copy of the App to switch crash reports off; the App has no switch of its own',
              ]}
            />
            <Paragraph>
              To exercise these rights, please contact us using the information
              provided below.
            </Paragraph>
          </Section>

          {/* Section 7 */}
          <Section title="7. Device permissions">
            <Paragraph>
              The App may ask for the following device permissions:
            </Paragraph>
            <BulletList
              items={[
                'Camera: To scan QR codes and to photograph goods and documents',
                'Photos: You can choose a photo from your phone to attach to a record; the App only receives the photos you choose',
              ]}
            />
            <Paragraph>
              You can manage these permissions at any time through your device
              settings. Denying a permission may limit App functionality.
            </Paragraph>
          </Section>

          {/* Section 8 */}
          <Section title="8. Children's privacy">
            <Paragraph>
              Our App is not intended for use by children under the age of 18.
              We do not knowingly collect personal information from children. If
              you believe we have collected information from a child, please
              contact us immediately, and we will take steps to delete such
              information.
            </Paragraph>
          </Section>

          {/* Section 9 */}
          <Section title="9. Third-party services">
            <Paragraph>
              This Privacy Policy does not apply to third-party services, and we
              are not responsible for their privacy practices. We encourage you
              to review the privacy policies of any third-party services you
              access.
            </Paragraph>
            <Paragraph>Third-party services we use include:</Paragraph>
            <BulletList
              items={[
                'The server software your cold storage runs (Supabase, open source)',
                'Expo (app development platform)',
                'Crash reports (Sentry/GlitchTip), only if the organisation that distributes your copy of the App switches them on: the app version, the phone model, your role, the error text and a short trail of recent activity, which may contain names from your records',
              ]}
            />
          </Section>

          {/* Section 10 */}
          <Section title="10. Changes to this Privacy Policy">
            <Paragraph>
              We may update this Privacy Policy from time to time. We will
              notify you of any material changes by posting the new Privacy
              Policy in the App with a new "Last updated" date. Your continued
              use of the App after such changes constitutes acceptance of the
              updated Privacy Policy.
            </Paragraph>
          </Section>

          {/* Section 11 */}
          <Section title="11. Contact us">
            <Paragraph>
              If you have any questions, concerns, or requests regarding this
              Privacy Policy or our data practices, please contact{' '}
              {party.inline}.
            </Paragraph>
            {party.email ? <Paragraph>Email: {party.email}</Paragraph> : null}
          </Section>

          {/* Section 12 */}
          <Section title="12. Governing law">
            <Paragraph>
              This Privacy Policy is governed by the laws of India, including
              the Information Technology Act, 2000, and the Information
              Technology (Reasonable Security Practices and Procedures and
              Sensitive Personal Data or Information) Rules, 2011.
            </Paragraph>
          </Section>

          {/* Acknowledgment */}
          <View style={styles.acknowledgment}>
            <Text style={styles.acknowledgmentText}>
              By using the app, you acknowledge that you have read and
              understood this privacy policy and agree to the collection and use
              of your information as described herein.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
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
    textAlign: 'center' as const,
    flex: 1,
  },
  navPlaceholder: {
    minWidth: 80,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: layout.marginCompact,
  },
  content: {
    width: '100%' as const,
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center' as const,
    borderRadius: radius.card,
    padding: space.xl,
    backgroundColor: t.surface.card,
    ...t.shadow[2],
  },
  lastUpdated: {
    ...typography.footnote,
    color: t.text.secondary,
    marginBottom: space.lg,
  },
  section: {
    marginTop: space.xxl,
  },
  sectionTitle: {
    ...typography.title3,
    color: t.text.primary,
    marginBottom: space.sm,
  },
  subheading: {
    ...typography.headline,
    color: t.text.primary,
    marginTop: space.lg,
    marginBottom: space.xs,
  },
  paragraph: {
    ...typography.body,
    color: t.text.primary,
    marginBottom: space.md,
  },
  bulletList: {
    marginLeft: space.xs,
    marginBottom: space.md,
  },
  bulletItem: {
    flexDirection: 'row' as const,
    marginBottom: space.xs,
  },
  bullet: {
    ...typography.body,
    color: t.text.secondary,
    marginRight: space.sm,
  },
  bulletText: {
    ...typography.body,
    color: t.text.primary,
    flex: 1,
  },
  acknowledgment: {
    marginTop: space.xxxl,
    paddingTop: space.xxl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
  },
  acknowledgmentText: {
    ...typography.body,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
  },
});

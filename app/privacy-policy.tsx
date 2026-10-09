/**
 * Privacy policy screen: reading text (style guide §4, §12).
 *
 * The full privacy policy: data collection, use and user rights.
 * Section titles are headers for screen readers; body text uses
 * typography.body in text.primary on a surface.card column.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  touchTarget,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';

// Company information
const COMPANY = {
  name: process.env.EXPO_PUBLIC_COMPANY_NAME || 'Your Company Name',
  email: process.env.EXPO_PUBLIC_LEGAL_EMAIL || 'legal@example.com',
};

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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />

      {/* Navigation Bar */}
      <View style={styles.navigationBar}>
        <Pressable
          style={styles.navBackButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Icon name="chevron-left" size={iconSize.xl} color={t.brand.tint} />
          <Text style={styles.navBackText}>Back</Text>
        </Pressable>
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
          <Text style={styles.lastUpdated}>Last updated: December 2025</Text>

          <Paragraph>
            {COMPANY.name} ("Company", "we", "us", or "our") operates this
            mobile application (the "App"). This Privacy Policy explains how we
            collect, use, disclose, and safeguard your information when you use
            our App.
          </Paragraph>

          {/* Section 1 */}
          <Section title="1. Information we collect">
            <Paragraph>
              We collect information that you provide directly to us:
            </Paragraph>

            <Subheading>Personal information</Subheading>
            <BulletList
              items={[
                'Phone number (required for account creation and authentication)',
                'Name (as provided during registration or by your organization)',
                'Role/Position within your organization',
                'Profile information you choose to provide',
              ]}
            />

            <Subheading>Usage information</Subheading>
            <BulletList
              items={[
                'App usage data and interaction patterns',
                'Features accessed and actions taken within the App',
                'Date and time of access',
                'Session duration',
              ]}
            />

            <Subheading>Device information</Subheading>
            <BulletList
              items={[
                'Device type and model',
                'Operating system and version',
                'App version',
                'Unique device identifiers',
                'Network information',
              ]}
            />

            <Subheading>Content you provide</Subheading>
            <BulletList
              items={[
                'Images uploaded for GRN documentation',
                'Notes and comments on orders and dispatches',
                'Any other content you submit through the App',
              ]}
            />
          </Section>

          {/* Section 2 */}
          <Section title="2. How we use your information">
            <Paragraph>We use the information we collect to:</Paragraph>
            <BulletList
              items={[
                'Provide, maintain, and improve our App and services',
                'Process and manage your cold storage bookings and orders',
                'Authenticate your identity and secure your account',
                'Send you service-related notifications and updates',
                'Respond to your inquiries and provide customer support',
                'Monitor and analyze usage patterns to improve user experience',
                'Detect, prevent, and address technical issues and security threats',
                'Comply with legal obligations and enforce our terms',
              ]}
            />
          </Section>

          {/* Section 3 */}
          <Section title="3. Information sharing and disclosure">
            <Paragraph>
              We may share your information in the following circumstances:
            </Paragraph>

            <Subheading>Service providers</Subheading>
            <Paragraph>
              We share information with third-party service providers who
              perform services on our behalf, including:
            </Paragraph>
            <BulletList
              items={[
                'Cloud hosting and database services (Supabase)',
                'Authentication services',
                'Analytics services',
                'Crash reporting and error monitoring',
              ]}
            />

            <Subheading>Business transfers</Subheading>
            <Paragraph>
              If we are involved in a merger, acquisition, or sale of assets,
              your information may be transferred as part of that transaction.
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
              We implement appropriate technical and organizational measures to
              protect your personal information against unauthorized access,
              alteration, disclosure, or destruction. These measures include:
            </Paragraph>
            <BulletList
              items={[
                'Encryption of data in transit and at rest',
                'Secure authentication using OTP verification',
                'Optional biometric authentication for enhanced security',
                'Regular security assessments and updates',
                'Access controls limiting who can view your information',
              ]}
            />
            <Paragraph>
              Your data is stored on secure cloud servers. While we strive to
              protect your information, no method of transmission over the
              Internet or electronic storage is 100% secure.
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
              When your account is deleted, we will delete or anonymize your
              personal information within a reasonable timeframe, unless
              retention is required by law.
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
                'Opt-out: Disable push notifications through your device settings',
                'Withdraw Consent: Withdraw consent for optional data processing',
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
              The App may request the following device permissions:
            </Paragraph>
            <BulletList
              items={[
                'Camera: To capture images for GRN documentation',
                'Photo Library: To select and upload images from your device',
                'Push Notifications: To send you important updates about your orders',
                'Biometric Sensors: For optional biometric authentication (Face ID/Touch ID)',
              ]}
            />
            <Paragraph>
              You can manage these permissions at any time through your device
              settings. Denying certain permissions may limit App functionality.
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
              Our App may contain links to or integrate with third-party
              services. This Privacy Policy does not apply to third-party
              services, and we are not responsible for their privacy practices.
              We encourage you to review the privacy policies of any third-party
              services you access.
            </Paragraph>
            <Paragraph>Third-party services we use include:</Paragraph>
            <BulletList
              items={[
                'Supabase (database and authentication)',
                'Expo (app development platform)',
                'Sentry/GlitchTip (error monitoring)',
              ]}
            />
          </Section>

          {/* Section 10 */}
          <Section title="10. Changes to this Privacy Policy">
            <Paragraph>
              We may update this Privacy Policy from time to time. We will
              notify you of any material changes by posting the new Privacy
              Policy in the App with a new "Last Updated" date. Your continued
              use of the App after such changes constitutes acceptance of the
              updated Privacy Policy.
            </Paragraph>
          </Section>

          {/* Section 11 */}
          <Section title="11. Contact us">
            <Paragraph>
              If you have any questions, concerns, or requests regarding this
              Privacy Policy or our data practices, please contact us:
            </Paragraph>
            <Paragraph>{COMPANY.name}</Paragraph>
            <Paragraph>Email: {COMPANY.email}</Paragraph>
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
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: touchTarget,
    minWidth: 80,
  },
  navBackText: {
    ...typography.body,
    color: t.brand.tint,
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

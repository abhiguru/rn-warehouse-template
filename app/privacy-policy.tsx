/**
 * Privacy Policy Screen - SAP Fiori for iOS Design
 *
 * Displays the full Privacy Policy for the App
 * Covers data collection, usage, and user rights
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  StatusBar,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useFioriColors } from '@/theme/fioriColors';

// Static design tokens
const FIORI_STATIC = {
  typography: {
    title1: {
      fontSize: 28,
      lineHeight: 34,
      fontWeight: '700' as const,
      letterSpacing: 0.36,
    },
    headline: {
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '600' as const,
      letterSpacing: -0.41,
    },
    body: {
      fontSize: 17,
      lineHeight: 24,
      fontWeight: '400' as const,
      letterSpacing: -0.41,
    },
    subhead: {
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '400' as const,
      letterSpacing: -0.24,
    },
    footnote: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '400' as const,
      letterSpacing: -0.08,
    },
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
};

// Company information
const COMPANY = {
  name: process.env.EXPO_PUBLIC_COMPANY_NAME || 'Your Company Name',
  email: process.env.EXPO_PUBLIC_LEGAL_EMAIL || 'legal@example.com',
};

export default function PrivacyPolicyScreen() {
  const insets = useSafeAreaInsets();
  const { isDarkMode } = useTheme();
  const FIORI = useFioriColors();

  const Section = ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) => (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: FIORI.colors.textPrimary }]}>
        {title}
      </Text>
      {children}
    </View>
  );

  const Paragraph = ({ children }: { children: React.ReactNode }) => (
    <Text style={[styles.paragraph, { color: FIORI.colors.textSecondary }]}>
      {children}
    </Text>
  );

  const BulletList = ({ items }: { items: string[] }) => (
    <View style={styles.bulletList}>
      {items.map((item, index) => (
        <View key={index} style={styles.bulletItem}>
          <Text style={[styles.bullet, { color: FIORI.colors.textSecondary }]}>
            •
          </Text>
          <Text
            style={[styles.bulletText, { color: FIORI.colors.textSecondary }]}
          >
            {item}
          </Text>
        </View>
      ))}
    </View>
  );

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top,
          backgroundColor: FIORI.colors.backgroundGrouped,
        },
      ]}
    >
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={FIORI.colors.background}
      />

      {/* Navigation Bar */}
      <View
        style={[
          styles.navigationBar,
          {
            backgroundColor: FIORI.colors.background,
            borderBottomColor: FIORI.colors.divider,
          },
        ]}
      >
        <Pressable
          style={styles.navBackButton}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={28} color={FIORI.colors.tint} />
          <Text style={[styles.navBackText, { color: FIORI.colors.tint }]}>
            Back
          </Text>
        </Pressable>
        <Text style={[styles.navTitle, { color: FIORI.colors.textPrimary }]}>
          Privacy Policy
        </Text>
        <View style={styles.navPlaceholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{
          paddingBottom: insets.bottom + FIORI_STATIC.spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[styles.content, { backgroundColor: FIORI.colors.background }]}
        >
          {/* Header */}
          <Text
            style={[styles.lastUpdated, { color: FIORI.colors.textTertiary }]}
          >
            Last Updated: December 2025
          </Text>

          <Paragraph>
            {COMPANY.name} ("Company", "we", "us", or "our") operates this
            mobile application (the "App"). This Privacy Policy explains how we
            collect, use, disclose, and safeguard your information when you use
            our App.
          </Paragraph>

          {/* Section 1 */}
          <Section title="1. Information We Collect">
            <Paragraph>
              We collect information that you provide directly to us:
            </Paragraph>

            <Text
              style={[styles.subheading, { color: FIORI.colors.textPrimary }]}
            >
              Personal Information
            </Text>
            <BulletList
              items={[
                'Phone number (required for account creation and authentication)',
                'Name (as provided during registration or by your organization)',
                'Role/Position within your organization',
                'Profile information you choose to provide',
              ]}
            />

            <Text
              style={[styles.subheading, { color: FIORI.colors.textPrimary }]}
            >
              Usage Information
            </Text>
            <BulletList
              items={[
                'App usage data and interaction patterns',
                'Features accessed and actions taken within the App',
                'Date and time of access',
                'Session duration',
              ]}
            />

            <Text
              style={[styles.subheading, { color: FIORI.colors.textPrimary }]}
            >
              Device Information
            </Text>
            <BulletList
              items={[
                'Device type and model',
                'Operating system and version',
                'App version',
                'Unique device identifiers',
                'Network information',
              ]}
            />

            <Text
              style={[styles.subheading, { color: FIORI.colors.textPrimary }]}
            >
              Content You Provide
            </Text>
            <BulletList
              items={[
                'Images uploaded for GRN documentation',
                'Notes and comments on orders and dispatches',
                'Any other content you submit through the App',
              ]}
            />
          </Section>

          {/* Section 2 */}
          <Section title="2. How We Use Your Information">
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
          <Section title="3. Information Sharing and Disclosure">
            <Paragraph>
              We may share your information in the following circumstances:
            </Paragraph>

            <Text
              style={[styles.subheading, { color: FIORI.colors.textPrimary }]}
            >
              Service Providers
            </Text>
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

            <Text
              style={[styles.subheading, { color: FIORI.colors.textPrimary }]}
            >
              Business Transfers
            </Text>
            <Paragraph>
              If we are involved in a merger, acquisition, or sale of assets,
              your information may be transferred as part of that transaction.
            </Paragraph>

            <Text
              style={[styles.subheading, { color: FIORI.colors.textPrimary }]}
            >
              Legal Requirements
            </Text>
            <Paragraph>
              We may disclose your information if required by law, regulation,
              legal process, or governmental request.
            </Paragraph>

            <Text
              style={[styles.subheading, { color: FIORI.colors.textPrimary }]}
            >
              With Your Consent
            </Text>
            <Paragraph>
              We may share your information with your consent or at your
              direction.
            </Paragraph>
          </Section>

          {/* Section 4 */}
          <Section title="4. Data Storage and Security">
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
          <Section title="5. Data Retention">
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
          <Section title="6. Your Rights and Choices">
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
          <Section title="7. Device Permissions">
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
          <Section title="8. Children's Privacy">
            <Paragraph>
              Our App is not intended for use by children under the age of 18.
              We do not knowingly collect personal information from children. If
              you believe we have collected information from a child, please
              contact us immediately, and we will take steps to delete such
              information.
            </Paragraph>
          </Section>

          {/* Section 9 */}
          <Section title="9. Third-Party Services">
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
          <Section title="10. Changes to This Privacy Policy">
            <Paragraph>
              We may update this Privacy Policy from time to time. We will
              notify you of any material changes by posting the new Privacy
              Policy in the App with a new "Last Updated" date. Your continued
              use of the App after such changes constitutes acceptance of the
              updated Privacy Policy.
            </Paragraph>
          </Section>

          {/* Section 11 */}
          <Section title="11. Contact Us">
            <Paragraph>
              If you have any questions, concerns, or requests regarding this
              Privacy Policy or our data practices, please contact us:
            </Paragraph>
            <Paragraph>{COMPANY.name}</Paragraph>
            <Paragraph>Email: {COMPANY.email}</Paragraph>
          </Section>

          {/* Section 12 */}
          <Section title="12. Governing Law">
            <Paragraph>
              This Privacy Policy is governed by the laws of India, including
              the Information Technology Act, 2000, and the Information
              Technology (Reasonable Security Practices and Procedures and
              Sensitive Personal Data or Information) Rules, 2011.
            </Paragraph>
          </Section>

          {/* Acknowledgment */}
          <View
            style={[
              styles.acknowledgment,
              { borderTopColor: FIORI.colors.divider },
            ]}
          >
            <Text
              style={[
                styles.acknowledgmentText,
                { color: FIORI.colors.textSecondary },
              ]}
            >
              BY USING THE APP, YOU ACKNOWLEDGE THAT YOU HAVE READ AND
              UNDERSTOOD THIS PRIVACY POLICY AND AGREE TO THE COLLECTION AND USE
              OF YOUR INFORMATION AS DESCRIBED HEREIN.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  navigationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: FIORI_STATIC.spacing.md,
    paddingVertical: FIORI_STATIC.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 80,
  },
  navBackText: {
    ...FIORI_STATIC.typography.body,
    marginLeft: FIORI_STATIC.spacing.xs,
  },
  navTitle: {
    ...FIORI_STATIC.typography.headline,
    textAlign: 'center',
    flex: 1,
  },
  navPlaceholder: {
    minWidth: 80,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    margin: FIORI_STATIC.spacing.md,
    borderRadius: 12,
    padding: FIORI_STATIC.spacing.lg,
  },
  lastUpdated: {
    ...FIORI_STATIC.typography.footnote,
    marginBottom: FIORI_STATIC.spacing.md,
  },
  section: {
    marginTop: FIORI_STATIC.spacing.lg,
  },
  sectionTitle: {
    ...FIORI_STATIC.typography.headline,
    marginBottom: FIORI_STATIC.spacing.sm,
  },
  subheading: {
    ...FIORI_STATIC.typography.subhead,
    fontWeight: '600',
    marginTop: FIORI_STATIC.spacing.md,
    marginBottom: FIORI_STATIC.spacing.xs,
  },
  paragraph: {
    ...FIORI_STATIC.typography.body,
    marginBottom: FIORI_STATIC.spacing.sm,
  },
  bulletList: {
    marginLeft: FIORI_STATIC.spacing.sm,
    marginBottom: FIORI_STATIC.spacing.sm,
  },
  bulletItem: {
    flexDirection: 'row',
    marginBottom: FIORI_STATIC.spacing.xs,
  },
  bullet: {
    ...FIORI_STATIC.typography.body,
    marginRight: FIORI_STATIC.spacing.sm,
  },
  bulletText: {
    ...FIORI_STATIC.typography.body,
    flex: 1,
  },
  acknowledgment: {
    marginTop: FIORI_STATIC.spacing.xl,
    paddingTop: FIORI_STATIC.spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  acknowledgmentText: {
    ...FIORI_STATIC.typography.subhead,
    fontWeight: '600',
    textAlign: 'center',
  },
});

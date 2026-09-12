/**
 * Terms of Service Screen - SAP Fiori for iOS Design
 *
 * Displays the full Terms of Service for the App
 * Adapted from website terms for mobile app context
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

export default function TermsOfServiceScreen() {
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
          Terms of Service
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
            Welcome to the App. These Terms and Conditions constitute a legal
            agreement between you and {COMPANY.name}. By accessing or using our
            App and services, you agree to be bound by these Terms.
          </Paragraph>

          {/* Section 1 */}
          <Section title="1. Company Information">
            <Paragraph>Company Name: {COMPANY.name}</Paragraph>
            <Paragraph>Email: {COMPANY.email}</Paragraph>
          </Section>

          {/* Section 2 */}
          <Section title="2. Definitions">
            <BulletList
              items={[
                '"Services" means cold storage rental, leasing, booking system, customer account management, and related services offered through the App',
                '"User Account" means the customer dashboard accessible through phone number authentication',
                '"Agreement" means the formal service agreement or contract executed between you and the Company for cold storage services',
                '"Content" means all information, text, graphics, images, and other material available on the App',
              ]}
            />
          </Section>

          {/* Section 3 */}
          <Section title="3. Acceptance of Terms">
            <Paragraph>
              By accessing and using our App, you acknowledge that you have
              read, understood, and agree to be bound by these Terms and our
              Privacy Policy. These Terms apply to all visitors, users, and
              others who access or use the App.
            </Paragraph>
          </Section>

          {/* Section 4 */}
          <Section title="4. Services Offered">
            <Paragraph>
              The Company provides the following services through the App:
            </Paragraph>
            <BulletList
              items={[
                'Cold Storage Rental and Leasing: Provision of cold storage facilities for preservation of goods',
                'Booking System: Platform for requesting and managing cold storage bookings',
                'Customer Account Management: Access to customer dashboard for viewing records and managing services',
                'GRN Management: Goods Receipt Note creation and tracking',
                'Dispatch Management: Track and manage dispatch operations',
                'Inventory Management: View and manage stock levels',
              ]}
            />
          </Section>

          {/* Section 5 */}
          <Section title="5. User Account and Registration">
            <Paragraph>
              To access the App features, you need to create a User Account by
              providing your phone number. You agree to:
            </Paragraph>
            <BulletList
              items={[
                'Provide accurate and complete information during registration',
                'Maintain the confidentiality of your account credentials',
                'Notify us immediately of any unauthorized use of your account',
                'Be responsible for all activities that occur under your account',
              ]}
            />
            <Paragraph>
              We reserve the right to suspend or terminate your User Account at
              any time if we believe you have violated these Terms or engaged in
              fraudulent, illegal, or harmful activities.
            </Paragraph>
          </Section>

          {/* Section 6 */}
          <Section title="6. Use of App">
            <Paragraph>
              You may use the App for lawful purposes only. You agree NOT to:
            </Paragraph>
            <BulletList
              items={[
                'Use the App for any unlawful purpose or in violation of any applicable laws',
                'Attempt to gain unauthorized access to any portion of the App',
                'Interfere with or disrupt the App or servers',
                'Transmit any viruses, malware, or harmful code',
                'Use automated systems to extract data from the App',
                'Impersonate any person or entity',
                'Reproduce, duplicate, copy, sell, or exploit any portion of the App without permission',
              ]}
            />
          </Section>

          {/* Section 7 */}
          <Section title="7. Mobile Device Permissions">
            <Paragraph>
              The App may request access to certain features on your device:
            </Paragraph>
            <BulletList
              items={[
                'Camera: For capturing images of goods and documents',
                'Photo Library: For uploading images from your device',
                'Notifications: For receiving updates about your orders and services',
                'Biometric Authentication: For secure app access (optional)',
              ]}
            />
            <Paragraph>
              You can manage these permissions through your device settings at
              any time.
            </Paragraph>
          </Section>

          {/* Section 8 */}
          <Section title="8. Payment Terms">
            <Paragraph>
              Payment terms, including the amount, due dates, advance payment
              requirements, and billing cycles, shall be as specified in your
              written Agreement with the Company. All prices are exclusive of
              applicable taxes, including GST, unless otherwise stated.
            </Paragraph>
          </Section>

          {/* Section 9 */}
          <Section title="9. Cancellation and Refund Policy">
            <Paragraph>
              Cancellation terms, refund eligibility, notice periods, and refund
              processing timelines shall be governed by the specific terms
              outlined in your written Agreement with the Company. Any
              cancellation request must be submitted in writing to{' '}
              {COMPANY.email}.
            </Paragraph>
          </Section>

          {/* Section 10 */}
          <Section title="10. Intellectual Property Rights">
            <Paragraph>
              All Content on the App, including but not limited to text,
              graphics, logos, images, software, and other material, is the
              property of {COMPANY.name} or its licensors and is protected by
              Indian and international intellectual property laws.
            </Paragraph>
          </Section>

          {/* Section 11 */}
          <Section title="11. Privacy and Data Protection">
            <Paragraph>
              Your use of the App is also governed by our Privacy Policy, which
              is incorporated into these Terms by reference. Please review our
              Privacy Policy to understand our practices regarding the
              collection, use, and disclosure of your personal information.
            </Paragraph>
          </Section>

          {/* Section 12 */}
          <Section title="12. Third-Party Services">
            <Paragraph>
              The App may use third-party services for functionality such as
              authentication, analytics, and cloud storage. We have no control
              over and assume no responsibility for the privacy policies or
              practices of any third-party services.
            </Paragraph>
          </Section>

          {/* Section 13 */}
          <Section title="13. Disclaimer of Warranties">
            <Paragraph>
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW: The App and all
              Content are provided on an "AS IS" and "AS AVAILABLE" basis
              without warranties of any kind, either express or implied. We do
              not warrant that the App will be uninterrupted, error-free, or
              free of viruses or other harmful components.
            </Paragraph>
          </Section>

          {/* Section 14 */}
          <Section title="14. Limitation of Liability">
            <Paragraph>
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW: The Company,
              its directors, officers, employees, agents, and affiliates shall
              not be liable for any indirect, incidental, special,
              consequential, or punitive damages arising out of or related to
              your use of the App or services.
            </Paragraph>
          </Section>

          {/* Section 15 */}
          <Section title="15. Indemnification">
            <Paragraph>
              You agree to indemnify, defend, and hold harmless {COMPANY.name},
              its directors, officers, employees, agents, affiliates, and
              licensors from any claims, liabilities, damages, losses, costs, or
              expenses arising out of your use of the App or violation of these
              Terms.
            </Paragraph>
          </Section>

          {/* Section 16 */}
          <Section title="16. Force Majeure">
            <Paragraph>
              The Company shall not be liable for any failure or delay in
              performance due to circumstances beyond its reasonable control,
              including acts of God, natural disasters, war, terrorism,
              pandemics, or government actions.
            </Paragraph>
          </Section>

          {/* Section 17 */}
          <Section title="17. Dispute Resolution">
            <Paragraph>
              Any dispute arising out of these Terms shall first be attempted to
              be resolved through good faith negotiations. If unresolved within
              thirty (30) days, the dispute shall be referred to arbitration in
              accordance with the Arbitration and Conciliation Act, 1996. The
              seat of arbitration shall be Ahmedabad, Gujarat, India.
            </Paragraph>
          </Section>

          {/* Section 18 */}
          <Section title="18. Governing Law">
            <Paragraph>
              These Terms shall be governed by and construed in accordance with
              the laws of India, including the Indian Contract Act, 1872, the
              Information Technology Act, 2000, and the Consumer Protection Act,
              2019.
            </Paragraph>
          </Section>

          {/* Section 19 */}
          <Section title="19. Modifications to Terms">
            <Paragraph>
              We reserve the right to modify these Terms at any time. Changes
              will be effective immediately upon posting the updated Terms in
              the App. Your continued use of the App after such changes
              constitutes acceptance of the modified Terms.
            </Paragraph>
          </Section>

          {/* Section 20 */}
          <Section title="20. Contact Information">
            <Paragraph>
              If you have any questions about these Terms, please contact us:
            </Paragraph>
            <Paragraph>{COMPANY.name}</Paragraph>
            <Paragraph>Email: {COMPANY.email}</Paragraph>
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
              BY USING THE APP, YOU ACKNOWLEDGE THAT YOU HAVE READ THESE TERMS
              AND CONDITIONS, UNDERSTAND THEM, AND AGREE TO BE BOUND BY THEM.
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

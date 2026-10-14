/**
 * Terms of service screen: reading text (style guide §4, §12).
 *
 * The full terms of service, adapted from the website terms for the app.
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

export default function TermsOfServiceScreen() {
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const party = legalParty();

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
          Terms of service
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
            Welcome to the App. These Terms of service are an agreement
            between you and {party.inline}. The {ASSOCIATION_NAME} (the
            "Association") provides this App to its member cold storages. Each
            member cold storage runs its own server and is the party you deal
            with. By using the App you agree to be bound by these Terms.
          </Paragraph>

          {/* Section 1 */}
          <Section title="1. Who provides what">
            <Paragraph>
              {party.leading} keeps your records on its own server and decides
              who may use them. The Association provides the App and does not
              hold the cold storage's records.
            </Paragraph>
            {party.email ? <Paragraph>Email: {party.email}</Paragraph> : null}
          </Section>

          {/* Section 2 */}
          <Section title="2. Definitions">
            <BulletList
              items={[
                '"Services" means cold storage rental and leasing, customer records, GRNs, dispatches, invoices, stock records and related services offered through the App',
                '"User Account" means your sign-in with your mobile number and a one-time code, together with the role and customers your cold storage gives you',
                '"Agreement" means the formal service agreement or contract executed between you and the cold storage for cold storage services',
                '"Content" means all information, text, graphics, images, and other material available on the App',
              ]}
            />
          </Section>

          {/* Section 3 */}
          <Section title="3. Acceptance of terms">
            <Paragraph>
              By accessing and using our App, you acknowledge that you have
              read, understood, and agree to be bound by these Terms and our
              Privacy Policy. These Terms apply to all visitors, users, and
              others who access or use the App.
            </Paragraph>
          </Section>

          {/* Section 4 */}
          <Section title="4. Services offered">
            <Paragraph>
              The cold storage provides the following services through the App:
            </Paragraph>
            <BulletList
              items={[
                'Cold Storage Rental and Leasing: Provision of cold storage facilities for preservation of goods',
                'Customer Records: Access for customers to view their own records and for staff to manage them',
                'GRN Management: Goods Receipt Note creation and tracking',
                'Dispatch Management: Track and manage dispatch operations',
                'Invoices: Create and view invoices',
                'Inventory Management: View and manage stock levels',
              ]}
            />
          </Section>

          {/* Section 5 */}
          <Section title="5. User account and sign-in">
            <Paragraph>
              You sign in to the App with your mobile number. The cold storage
              sends a one-time code by SMS, and you enter it in the App. The
              cold storage decides your role and which customers you can see,
              and may change or remove your access at any time. You agree to:
            </Paragraph>
            <BulletList
              items={[
                'Provide an accurate mobile number and name',
                'Keep your one-time codes private and not share them with anyone',
                'Tell the cold storage immediately if someone else uses your account',
                'Be responsible for all activities that occur under your account',
              ]}
            />
            <Paragraph>
              The cold storage may suspend or end your access at any time if it
              believes you have violated these Terms or engaged in fraudulent,
              illegal, or harmful activities.
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
          <Section title="7. Mobile device permissions">
            <Paragraph>
              The App may ask for access to certain features on your device:
            </Paragraph>
            <BulletList
              items={[
                'Camera: To scan QR codes and to photograph goods and documents',
                'Photos: You can choose a photo from your phone to attach to a record; the App only receives the photos you choose',
              ]}
            />
            <Paragraph>
              You can manage these permissions through your device settings at
              any time.
            </Paragraph>
          </Section>

          {/* Section 8 */}
          <Section title="8. Payment terms">
            <Paragraph>
              Payment terms, including the amount, due dates, advance payment
              requirements, and billing cycles, are as specified in your
              written Agreement with the cold storage. All prices are exclusive
              of applicable taxes, including GST, unless otherwise stated.
            </Paragraph>
          </Section>

          {/* Section 9 */}
          <Section title="9. Cancellation and refund policy">
            <Paragraph>
              Cancellation terms, refund eligibility, notice periods, and refund
              processing timelines are governed by the specific terms outlined
              in your written Agreement with the cold storage. Any cancellation
              request must be submitted in writing to {party.inline}
              {party.email ? ` at ${party.email}` : ''}.
            </Paragraph>
          </Section>

          {/* Section 10 */}
          <Section title="10. Intellectual property rights">
            <Paragraph>
              All Content on the App, including but not limited to text,
              graphics, logos, images, software, and other material, is the
              property of the Association, {party.inline} or their licensors and
              is protected by Indian and international intellectual property
              laws.
            </Paragraph>
          </Section>

          {/* Section 11 */}
          <Section title="11. Privacy and data protection">
            <Paragraph>
              Your use of the App is also governed by our Privacy Policy, which
              is incorporated into these Terms by reference. Please review our
              Privacy Policy to understand how your records are stored on the
              cold storage's own server and who can see them.
            </Paragraph>
          </Section>

          {/* Section 12 */}
          <Section title="12. Third-party services">
            <Paragraph>
              The App may use third-party services for functionality such as
              sending one-time codes by SMS and reporting crashes. We have no
              control over and assume no responsibility for the privacy policies
              or practices of any third-party services.
            </Paragraph>
          </Section>

          {/* Section 13 */}
          <Section title="13. Disclaimer of warranties">
            <Paragraph>
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW: The App and all
              Content are provided on an "AS IS" and "AS AVAILABLE" basis
              without warranties of any kind, either express or implied. We do
              not warrant that the App will be uninterrupted, error-free, or
              free of viruses or other harmful components.
            </Paragraph>
          </Section>

          {/* Section 14 */}
          <Section title="14. Limitation of liability">
            <Paragraph>
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW: The
              Association, {party.inline}, and their directors, officers,
              employees, agents, and affiliates shall not be liable for any
              indirect, incidental, special, consequential, or punitive damages
              arising out of or related to your use of the App or services.
            </Paragraph>
          </Section>

          {/* Section 15 */}
          <Section title="15. Indemnification">
            <Paragraph>
              You agree to indemnify, defend, and hold harmless the Association
              and {party.inline}, their directors, officers, employees, agents,
              affiliates, and licensors from any claims, liabilities, damages,
              losses, costs, or expenses arising out of your use of the App or
              violation of these Terms.
            </Paragraph>
          </Section>

          {/* Section 16 */}
          <Section title="16. Force majeure">
            <Paragraph>
              Neither the Association nor the cold storage shall be liable for
              any failure or delay in performance due to circumstances beyond
              its reasonable control, including acts of God, natural disasters,
              war, terrorism, pandemics, or government actions.
            </Paragraph>
          </Section>

          {/* Section 17 */}
          <Section title="17. Dispute resolution">
            <Paragraph>
              Any dispute arising out of these Terms shall first be attempted to
              be resolved through good faith negotiations. If unresolved within
              thirty (30) days, the dispute shall be referred to arbitration in
              accordance with the Arbitration and Conciliation Act, 1996. The
              seat of arbitration shall be Ahmedabad, Gujarat, India.
            </Paragraph>
          </Section>

          {/* Section 18 */}
          <Section title="18. Governing law">
            <Paragraph>
              These Terms shall be governed by and construed in accordance with
              the laws of India, including the Indian Contract Act, 1872, the
              Information Technology Act, 2000, and the Consumer Protection Act,
              2019.
            </Paragraph>
          </Section>

          {/* Section 19 */}
          <Section title="19. Modifications to terms">
            <Paragraph>
              We reserve the right to modify these Terms at any time. Changes
              will be effective immediately upon posting the updated Terms in
              the App. Your continued use of the App after such changes
              constitutes acceptance of the modified Terms.
            </Paragraph>
          </Section>

          {/* Section 20 */}
          <Section title="20. Contact information">
            <Paragraph>
              If you have any questions about these Terms, please contact{' '}
              {party.inline}.
            </Paragraph>
            {party.email ? <Paragraph>Email: {party.email}</Paragraph> : null}
          </Section>

          {/* Acknowledgment */}
          <View style={styles.acknowledgment}>
            <Text style={styles.acknowledgmentText}>
              By using the app, you acknowledge that you have read these Terms of
              service, understand them, and agree to be bound by them.
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

/**
 * ContactCard Component
 *
 * Contact card for overview tabs (customer, supervisor, etc.): an object cell
 * header plus call and email actions in brand.tint (docs/STYLE_GUIDE.md §13.6).
 */

import React from 'react';
import { View, Text, Pressable, Linking } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { iconSize } from '@/theme/tokens';
import { useOverviewStyles, useOverviewColors } from './FioriStyles';
import { t } from '@/i18n';

export interface ContactDetails {
  name: string;
  phone?: string;
  email?: string;
}

interface ContactCardProps {
  type: string;
  name: string;
  phone?: string;
  email?: string;
  iconName: string;
  iconColor: string;
  iconBgColor: string;
}

/** Show an Indian mobile number as "+91 98765 43210" (§12.3); other values unchanged. */
export function formatContactPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  if (local.length === 10) {
    return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
  }
  return phone;
}

export const ContactCard: React.FC<ContactCardProps> = ({
  type,
  name,
  phone,
  email,
  iconName,
  iconColor,
  iconBgColor,
}) => {
  const colorStyles = useOverviewColors();
  const overviewStyles = useOverviewStyles();

  const handlePhonePress = (phoneNumber: string) => {
    Linking.openURL(`tel:${phoneNumber}`);
  };

  const handleEmailPress = (emailAddress: string) => {
    Linking.openURL(`mailto:${emailAddress}`);
  };

  const displayPhone = phone ? formatContactPhone(phone) : undefined;

  return (
    <View style={[overviewStyles.card, colorStyles.card]}>
      <View style={overviewStyles.cardClip}>
        {/* Object cell header */}
        <View style={overviewStyles.objectCellHeader} accessible accessibilityLabel={`${type}, ${name}`}>
          <View style={[overviewStyles.avatar, { backgroundColor: iconBgColor }]}>
            <Icon name={iconName} size={iconSize.lg} color={iconColor} />
          </View>

          <View style={overviewStyles.objectCellContent}>
            <Text style={[overviewStyles.objectCellLabel, colorStyles.objectCellLabel]}>{type}</Text>
            <Text
              style={[overviewStyles.objectCellHeadline, colorStyles.objectCellHeadline]}
              numberOfLines={2}
            >
              {name}
            </Text>
          </View>
        </View>

        {/* Contact actions */}
        {(phone || email) && (
          <View style={[overviewStyles.contactActionsContainer, colorStyles.contactActionsContainer]}>
            {phone && (
              <Pressable
                style={({ pressed }) => [
                  overviewStyles.contactAction,
                  pressed && colorStyles.contactActionPressed,
                ]}
                onPress={() => handlePhonePress(phone)}
                accessibilityRole="button"
                accessibilityLabel={t('components.contact.call', { name, phone: displayPhone })}
              >
                <View style={[overviewStyles.contactActionIcon, colorStyles.contactActionIcon]}>
                  <Icon name="phone-outline" size={iconSize.md} color={colorStyles.iconBrand} />
                </View>
                <Text style={[overviewStyles.contactActionText, colorStyles.contactActionText]}>
                  {displayPhone}
                </Text>
                <Icon name="chevron-right" size={iconSize.md} color={colorStyles.iconTertiary} />
              </Pressable>
            )}

            {email && (
              <Pressable
                style={({ pressed }) => [
                  overviewStyles.contactAction,
                  phone && overviewStyles.contactActionBorder,
                  phone && colorStyles.contactActionBorder,
                  pressed && colorStyles.contactActionPressed,
                ]}
                onPress={() => handleEmailPress(email)}
                accessibilityRole="button"
                accessibilityLabel={t('components.contact.email', { name, email })}
              >
                <View style={[overviewStyles.contactActionIcon, colorStyles.contactActionIcon]}>
                  <Icon name="email-outline" size={iconSize.md} color={colorStyles.iconBrand} />
                </View>
                <Text style={[overviewStyles.contactActionText, colorStyles.contactActionText]}>{email}</Text>
                <Icon name="chevron-right" size={iconSize.md} color={colorStyles.iconTertiary} />
              </Pressable>
            )}
          </View>
        )}
      </View>
    </View>
  );
};

/**
 * ContactCard Component
 *
 * Reusable contact card for overview tabs (customer, supervisor, etc.)
 * Based on SAP Fiori for iOS Object Cell Pattern
 */

import React from 'react';
import { View, Text, Pressable, Linking } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { overviewStyles, useOverviewColors } from './FioriStyles';

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

  const handlePhonePress = (phoneNumber: string) => {
    Linking.openURL(`tel:${phoneNumber}`);
  };

  const handleEmailPress = (emailAddress: string) => {
    Linking.openURL(`mailto:${emailAddress}`);
  };

  return (
    <View style={[overviewStyles.card, colorStyles.card]}>
      {/* Object Cell Header */}
      <View style={overviewStyles.objectCellHeader}>
        {/* Avatar */}
        <View style={[overviewStyles.avatar, { backgroundColor: iconBgColor }]}>
          <Icon name={iconName} size={24} color={iconColor} />
        </View>

        {/* Content */}
        <View style={overviewStyles.objectCellContent}>
          <Text style={[overviewStyles.objectCellLabel, colorStyles.objectCellLabel]}>{type}</Text>
          <Text style={[overviewStyles.objectCellHeadline, colorStyles.objectCellHeadline]}>{name}</Text>
        </View>
      </View>

      {/* Contact Actions */}
      {(phone || email) && (
        <View style={[overviewStyles.contactActionsContainer, colorStyles.contactActionsContainer]}>
          {phone && (
            <Pressable
              style={({ pressed }) => [
                overviewStyles.contactAction,
                overviewStyles.contactActionIcon,
                colorStyles.contactActionIcon,
                pressed && colorStyles.contactActionPressed,
              ]}
              onPress={() => handlePhonePress(phone)}
              accessibilityRole="button"
              accessibilityLabel={`Call ${name}`}
            >
              <View style={[overviewStyles.contactActionIcon, colorStyles.contactActionIcon]}>
                <Icon name="phone" size={18} color={colorStyles.iconSuccess} />
              </View>
              <Text style={[overviewStyles.contactActionText, colorStyles.contactActionText]}>{phone}</Text>
              <Icon
                name="chevron-right"
                size={20}
                color={colorStyles.iconTertiary}
              />
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
              accessibilityLabel={`Email ${name}`}
            >
              <View style={[overviewStyles.contactActionIcon, colorStyles.contactActionIcon]}>
                <Icon name="email" size={18} color={colorStyles.iconInfo} />
              </View>
              <Text style={[overviewStyles.contactActionText, colorStyles.contactActionText]}>{email}</Text>
              <Icon
                name="chevron-right"
                size={20}
                color={colorStyles.iconTertiary}
              />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
};

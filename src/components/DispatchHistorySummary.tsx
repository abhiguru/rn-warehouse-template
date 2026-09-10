import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import theme from '@/theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface DispatchHistorySummaryProps {
  totalDispatches: number;
  totalQuantity: number;
  totalWeight: number;
  initialQuantity: number;
  isLoading?: boolean;
}

const DispatchHistorySummary: React.FC<DispatchHistorySummaryProps> = ({
  totalDispatches,
  totalQuantity,
  totalWeight,
  initialQuantity,
  isLoading = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const toggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded(!isExpanded);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        onPress={toggleExpand}
        activeOpacity={0.7}
        accessibilityLabel={`Summary Statistics, ${isExpanded ? 'collapse' : 'expand'}`}
        accessibilityRole="button"
      >
        <View style={styles.headerLeft}>
          <Icon name="chart-bar" size={20} color={theme.colors.primary} />
          <Text style={styles.headerTitle}>Summary Statistics</Text>
        </View>
        <View style={styles.headerRight}>
          <Icon name={isExpanded ? 'chevron-down' : 'chevron-right'} size={20} color={theme.colors.gray[600]} />
        </View>
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.content}>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>Loading summary...</Text>
            </View>
          ) : (
            <View style={styles.metricsGrid}>
              {/* First Row */}
              <View style={styles.metricRow}>
                <View style={[styles.metricCard, styles.metricCardPrimary]}>
                  <Icon name="package-variant" size={24} color={theme.colors.blue[600]} />
                  <Text style={styles.metricValue}>{totalDispatches}</Text>
                  <Text style={styles.metricLabel}>Dispatches</Text>
                </View>
                <View style={[styles.metricCard, styles.metricCardSecondary]}>
                  <Icon name="chart-bar" size={24} color={theme.colors.green[600]} />
                  <Text style={styles.metricValue}>{totalQuantity.toLocaleString()}</Text>
                  <Text style={styles.metricLabel}>Units</Text>
                </View>
              </View>

              {/* Second Row */}
              <View style={styles.metricRow}>
                <View style={[styles.metricCard, styles.metricCardAccent]}>
                  <Icon name="scale-balance" size={24} color={theme.colors.orange[600]} />
                  <Text style={styles.metricValue}>{totalWeight.toLocaleString()}</Text>
                  <Text style={styles.metricLabel}>kg</Text>
                </View>
                <View style={[styles.metricCard, styles.metricCardNeutral]}>
                  <Icon name="package-down" size={24} color={theme.colors.purple[600]} />
                  <Text style={styles.metricValue}>{initialQuantity.toLocaleString()}</Text>
                  <Text style={styles.metricLabel}>Initial Qty</Text>
                </View>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.white,
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderRadius: theme.borderRadius.xl,
    ...theme.shadows.md,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.blue[50],
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.gray[900],
  },
  headerRight: {
    padding: theme.spacing.xs,
  },
  content: {
    padding: theme.spacing.lg,
  },
  loadingContainer: {
    paddingVertical: theme.spacing.xl,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.gray[500],
  },
  metricsGrid: {
    gap: 12,
  },
  metricRow: {
    flexDirection: 'row',
    gap: 12,
  },
  metricCard: {
    flex: 1,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center',
    gap: 6,
  },
  metricCardPrimary: {
    backgroundColor: theme.colors.blue[50],
  },
  metricCardSecondary: {
    backgroundColor: theme.colors.green[50],
  },
  metricCardAccent: {
    backgroundColor: theme.colors.orange[50],
  },
  metricCardNeutral: {
    backgroundColor: theme.colors.purple[50],
  },
  metricValue: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.gray[900],
  },
  metricLabel: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.gray[600],
    textAlign: 'center',
    fontWeight: theme.fontWeight.medium,
  },
});

export default DispatchHistorySummary;

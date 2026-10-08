/**
 * Update Prompt Component
 *
 * Displays a modal when an OTA update is available.
 * Allows users to download and apply updates.
 */

import React, { useEffect } from 'react';
import { View, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { Text, Button, Surface, Portal, useTheme } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useOTAUpdates } from '@/hooks/useOTAUpdates';

interface UpdatePromptProps {
  /** Whether to show the prompt as a modal (true) or inline banner (false) */
  asModal?: boolean;
}

export function UpdatePrompt({ asModal = true }: UpdatePromptProps) {
  const theme = useTheme();
  const {
    isUpdateAvailable,
    isUpdatePending,
    isDownloading,
    isChecking,
    error,
    downloadProgress,
    downloadUpdate,
    applyUpdate,
    dismissUpdate,
    isEnabled,
  } = useOTAUpdates();

  // Auto-download when update is available
  useEffect(() => {
    if (isUpdateAvailable && !isDownloading && !isUpdatePending) {
      downloadUpdate();
    }
  }, [isUpdateAvailable, isDownloading, isUpdatePending, downloadUpdate]);

  // Auto-apply when update is pending (downloaded)
  // Uncomment this for automatic updates without user prompt:
  // useEffect(() => {
  //   if (isUpdatePending) {
  //     applyUpdate();
  //   }
  // }, [isUpdatePending, applyUpdate]);

  // Don't show anything if no update or updates disabled
  if (!isEnabled || (!isUpdateAvailable && !isUpdatePending)) {
    return null;
  }

  const content = (
    <Surface style={[styles.container, { backgroundColor: theme.colors.surface }]} elevation={4}>
      {/* Icon */}
      <View style={[styles.iconContainer, { backgroundColor: theme.colors.primaryContainer }]}>
        <Ionicons
          name={isUpdatePending ? 'checkmark-circle' : 'cloud-download'}
          size={32}
          color={theme.colors.primary}
        />
      </View>

      {/* Title */}
      <Text variant="titleMedium" style={[styles.title, { color: theme.colors.onSurface }]}>
        {isUpdatePending ? 'Update Ready' : 'Update Available'}
      </Text>

      {/* Description */}
      <Text variant="bodyMedium" style={[styles.description, { color: theme.colors.onSurfaceVariant }]}>
        {isDownloading
          ? 'Downloading update...'
          : isUpdatePending
            ? 'A new version has been downloaded. Restart to apply the update.'
            : 'A new version of the app is available.'}
      </Text>

      {/* Progress indicator */}
      {isDownloading && (
        <View style={styles.progressContainer}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text variant="bodySmall" style={[styles.progressText, { color: theme.colors.onSurfaceVariant }]}>
            {downloadProgress > 0 ? `${Math.round(downloadProgress * 100)}%` : 'Downloading...'}
          </Text>
        </View>
      )}

      {/* Error message */}
      {error && (
        <Text variant="bodySmall" style={[styles.error, { color: theme.colors.error }]}>
          {error.message}
        </Text>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        {isUpdatePending ? (
          <>
            <Button
              mode="outlined"
              onPress={dismissUpdate}
              style={styles.button}
              textColor={theme.colors.onSurfaceVariant}
            >
              Later
            </Button>
            <Button
              mode="contained"
              onPress={applyUpdate}
              style={styles.button}
              buttonColor={theme.colors.primary}
            >
              Restart Now
            </Button>
          </>
        ) : (
          !isDownloading && (
            <>
              <Button
                mode="outlined"
                onPress={dismissUpdate}
                style={styles.button}
                textColor={theme.colors.onSurfaceVariant}
              >
                Not Now
              </Button>
              <Button
                mode="contained"
                onPress={downloadUpdate}
                style={styles.button}
                buttonColor={theme.colors.primary}
              >
                Download
              </Button>
            </>
          )
        )}
      </View>
    </Surface>
  );

  if (asModal) {
    return (
      <Portal>
        <Modal
          visible={isUpdateAvailable || isUpdatePending}
          transparent
          animationType="fade"
          onRequestClose={dismissUpdate}
        >
          <View style={styles.modalOverlay}>
            {content}
          </View>
        </Modal>
      </Portal>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    borderRadius: 16,
    padding: 24,
    maxWidth: 340,
    width: '100%',
    alignItems: 'center',
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  description: {
    textAlign: 'center',
    marginBottom: 16,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  progressText: {
    marginLeft: 8,
  },
  error: {
    marginBottom: 16,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    width: '100%',
  },
  button: {
    flex: 1,
    minWidth: 100,
  },
});

export default UpdatePrompt;

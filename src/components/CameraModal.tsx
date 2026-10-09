/**
 * CameraModal - Full-screen camera component with flash control
 *
 * Uses expo-camera for native camera access with programmable flash control.
 * Flash defaults to ON for better warehouse/document photography.
 *
 * Camera and preview draw on overlay.imageBackdrop with overlay.onImage
 * controls on overlay.scrim circles (docs/STYLE_GUIDE.md §13.3, §13.10). The
 * permission request is a full-screen state on background.base (§13.9). The
 * Android back button closes the camera (or returns from the preview).
 */

import React, { useState, useRef, useCallback } from 'react';
import {
    View,
    Text,
    Pressable,
    Modal,
    ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { CameraView, useCameraPermissions, FlashMode } from 'expo-camera';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, motion, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { createLogger } from '@/utils/logger';

const logger = createLogger('CameraModal');

/** Photo and camera views always use light status bar icons (§5.2). */
const PHOTO_STATUS_BAR = 'light-content' as const;

const CAPTURE_OUTER = 80;
const CAPTURE_INNER = 64;

interface CameraModalProps {
    visible: boolean;
    onClose: () => void;
    onCapture: (uri: string) => void;
}

export const CameraModal: React.FC<CameraModalProps> = ({
    visible,
    onClose,
    onCapture,
}) => {
    const styles = useThemedStyles(makeStyles);
    const t = useTokens();
    const insets = useSafeAreaInsets();
    const [flashMode, setFlashMode] = useState<FlashMode>('on'); // Default flash ON
    const [isCapturing, setIsCapturing] = useState(false);
    const [facing, setFacing] = useState<'front' | 'back'>('back');
    const [previewUri, setPreviewUri] = useState<string | null>(null); // Photo preview state
    const cameraRef = useRef<CameraView>(null);
    const [permission, requestPermission] = useCameraPermissions();

    const toggleFlash = useCallback(() => {
        setFlashMode((current) => {
            if (current === 'on') return 'off';
            if (current === 'off') return 'auto';
            return 'on';
        });
    }, []);

    const toggleCameraFacing = useCallback(() => {
        setFacing((current) => (current === 'back' ? 'front' : 'back'));
    }, []);

    const handleCapture = useCallback(async () => {
        if (!cameraRef.current || isCapturing) return;

        try {
            setIsCapturing(true);
            const photo = await cameraRef.current.takePictureAsync({
                quality: 0.8,
                skipProcessing: false,
            });

            if (photo?.uri) {
                // Show preview instead of immediately closing
                setPreviewUri(photo.uri);
            }
        } catch (error) {
            logger.error('Error capturing photo', error);
        } finally {
            setIsCapturing(false);
        }
    }, [isCapturing]);

    const handleRetake = useCallback(() => {
        setPreviewUri(null);
    }, []);

    const handleUsePhoto = useCallback(() => {
        if (previewUri) {
            onCapture(previewUri);
            setPreviewUri(null);
            onClose();
        }
    }, [previewUri, onCapture, onClose]);

    const handleClose = useCallback(() => {
        setPreviewUri(null);
        onClose();
    }, [onClose]);

    const getFlashIcon = () => {
        switch (flashMode) {
            case 'on': return 'flash';
            case 'off': return 'flash-off';
            case 'auto': return 'flash-auto';
            default: return 'flash';
        }
    };

    const getFlashLabel = () => {
        switch (flashMode) {
            case 'on': return 'On';
            case 'off': return 'Off';
            case 'auto': return 'Auto';
            default: return 'On';
        }
    };

    // Handle permission not granted yet
    if (!permission) {
        return (
            <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={handleClose}>
                <View
                    style={styles.loadingContainer}
                    accessible
                    accessibilityLabel="Opening camera"
                    accessibilityState={{ busy: true }}
                >
                    <ActivityIndicator size="large" color={t.overlay.onImage} />
                </View>
            </Modal>
        );
    }

    // Handle permission not granted
    if (!permission.granted) {
        return (
            <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={handleClose}>
                <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} active={visible} />
                <SafeAreaView style={styles.permissionContainer}>
                    <Icon name="camera-off-outline" size={iconSize.hero} color={t.icon.secondary} />
                    <Text style={styles.permissionTitle} accessibilityRole="header">
                        Allow camera access
                    </Text>
                    <Text style={styles.permissionText}>
                        The app uses the camera to take photos of goods and documents for your records.
                    </Text>
                    <Pressable
                        style={({ pressed }) => [styles.permissionButton, pressed && styles.permissionButtonPressed]}
                        onPress={requestPermission}
                        accessibilityRole="button"
                        accessibilityLabel="Allow camera"
                    >
                        <Text style={styles.permissionButtonText}>Allow camera</Text>
                    </Pressable>
                    <Pressable
                        style={({ pressed }) => [styles.cancelButton, pressed && styles.cancelButtonPressed]}
                        onPress={handleClose}
                        accessibilityRole="button"
                        accessibilityLabel="Cancel"
                    >
                        <Text style={styles.cancelButtonText}>Cancel</Text>
                    </Pressable>
                </SafeAreaView>
            </Modal>
        );
    }

    // Show photo preview with Retake / Use photo options
    if (previewUri) {
        return (
            <Modal visible={visible} animationType="fade" statusBarTranslucent onRequestClose={handleRetake}>
                <EdgeToEdgeStatusBar barStyle={PHOTO_STATUS_BAR} active={visible} />
                <View style={styles.container}>
                    <Image
                        source={{ uri: previewUri }}
                        style={styles.previewImage}
                        contentFit="contain"
                        cachePolicy="memory"
                        transition={motion.fast}
                        accessibilityLabel="Photo preview"
                    />

                    {/* Preview Controls */}
                    <View style={[styles.previewControls, { paddingBottom: insets.bottom + space.xxl }]}>
                        <Pressable
                            style={({ pressed }) => [styles.retakeButton, pressed && styles.overlayButtonPressed]}
                            onPress={handleRetake}
                            accessibilityRole="button"
                            accessibilityLabel="Retake photo"
                        >
                            <Icon name="camera-retake-outline" size={iconSize.lg} color={t.overlay.onImage} />
                            <Text style={styles.retakeButtonText}>Retake</Text>
                        </Pressable>

                        <Pressable
                            style={({ pressed }) => [styles.usePhotoButton, pressed && styles.usePhotoButtonPressed]}
                            onPress={handleUsePhoto}
                            accessibilityRole="button"
                            accessibilityLabel="Use photo"
                        >
                            <Icon name="check" size={iconSize.lg} color={t.brand.onFill} />
                            <Text style={styles.usePhotoButtonText}>Use photo</Text>
                        </Pressable>
                    </View>
                </View>
            </Modal>
        );
    }

    return (
        <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={handleClose}>
            <EdgeToEdgeStatusBar barStyle={PHOTO_STATUS_BAR} active={visible} />
            <View style={styles.container}>
                <CameraView
                    ref={cameraRef}
                    style={styles.camera}
                    facing={facing}
                    flash={flashMode}
                >
                    {/* Top Controls */}
                    <View style={[styles.topControls, { paddingTop: insets.top + space.sm }]}>
                        <Pressable
                            style={({ pressed }) => [styles.roundButton, pressed && styles.overlayButtonPressed]}
                            onPress={handleClose}
                            accessibilityRole="button"
                            accessibilityLabel="Close camera"
                        >
                            <Icon name="close" size={iconSize.lg} color={t.overlay.onImage} />
                        </Pressable>

                        <Pressable
                            style={({ pressed }) => [styles.flashButton, pressed && styles.overlayButtonPressed]}
                            onPress={toggleFlash}
                            accessibilityRole="button"
                            accessibilityLabel={`Flash ${getFlashLabel().toLowerCase()}`}
                            accessibilityHint="Changes the flash mode"
                        >
                            <Icon name={getFlashIcon()} size={iconSize.lg} color={t.overlay.onImage} />
                            <Text style={styles.flashLabel}>{getFlashLabel()}</Text>
                        </Pressable>

                        <Pressable
                            style={({ pressed }) => [styles.roundButton, pressed && styles.overlayButtonPressed]}
                            onPress={toggleCameraFacing}
                            accessibilityRole="button"
                            accessibilityLabel="Switch camera"
                        >
                            <Icon name="camera-flip-outline" size={iconSize.lg} color={t.overlay.onImage} />
                        </Pressable>
                    </View>

                    {/* Bottom Controls */}
                    <View style={[styles.bottomControls, { paddingBottom: insets.bottom + space.xxl }]}>
                        <View style={styles.captureButtonOuter}>
                            <Pressable
                                style={({ pressed }) => [
                                    styles.captureButton,
                                    (pressed || isCapturing) && styles.captureButtonBusy,
                                ]}
                                onPress={handleCapture}
                                disabled={isCapturing}
                                accessibilityRole="button"
                                accessibilityLabel="Take photo"
                                accessibilityState={{ disabled: isCapturing, busy: isCapturing }}
                            >
                                {isCapturing && <ActivityIndicator size="small" color={t.overlay.imageBackdrop} />}
                            </Pressable>
                        </View>
                    </View>
                </CameraView>
            </View>
        </Modal>
    );
};

const makeStyles = (t: ThemeTokens) => ({
    container: {
        flex: 1,
        backgroundColor: t.overlay.imageBackdrop,
    },
    camera: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center' as const,
        alignItems: 'center' as const,
        backgroundColor: t.overlay.imageBackdrop,
    },
    permissionContainer: {
        flex: 1,
        justifyContent: 'center' as const,
        alignItems: 'center' as const,
        backgroundColor: t.background.base,
        padding: space.xxl,
        gap: space.md,
    },
    permissionTitle: {
        ...typography.title2,
        color: t.text.primary,
        textAlign: 'center' as const,
        marginTop: space.sm,
    },
    permissionText: {
        ...typography.body,
        color: t.text.secondary,
        textAlign: 'center' as const,
        maxWidth: layout.maxFormWidth,
    },
    permissionButton: {
        minHeight: touchTarget,
        minWidth: 120,
        justifyContent: 'center' as const,
        alignItems: 'center' as const,
        backgroundColor: t.brand.fill,
        paddingHorizontal: space.xxxl,
        borderRadius: radius.button,
        marginTop: space.md,
    },
    permissionButtonPressed: {
        backgroundColor: t.brand.fillPressed,
    },
    permissionButtonText: {
        ...typography.callout,
        fontWeight: fontWeight.semibold,
        color: t.brand.onFill,
    },
    cancelButton: {
        minHeight: touchTarget,
        justifyContent: 'center' as const,
        alignItems: 'center' as const,
        paddingHorizontal: space.xxxl,
        borderRadius: radius.button,
    },
    cancelButtonPressed: {
        backgroundColor: t.brand.subtle,
    },
    cancelButtonText: {
        ...typography.callout,
        fontWeight: fontWeight.semibold,
        color: t.brand.tint,
    },
    topControls: {
        flexDirection: 'row' as const,
        justifyContent: 'space-between' as const,
        alignItems: 'center' as const,
        paddingHorizontal: layout.marginCompact,
        paddingBottom: space.lg,
        backgroundColor: t.overlay.scrim,
    },
    roundButton: {
        width: touchTarget,
        height: touchTarget,
        borderRadius: radius.pill,
        backgroundColor: t.overlay.scrim,
        justifyContent: 'center' as const,
        alignItems: 'center' as const,
    },
    overlayButtonPressed: {
        backgroundColor: t.interaction.pressedOverlay,
    },
    flashButton: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        minHeight: touchTarget,
        paddingHorizontal: space.lg,
        borderRadius: radius.pill,
        backgroundColor: t.overlay.scrim,
        gap: space.s6,
    },
    flashLabel: {
        ...typography.footnote,
        fontWeight: fontWeight.semibold,
        color: t.overlay.onImage,
    },
    bottomControls: {
        position: 'absolute' as const,
        bottom: 0,
        left: 0,
        right: 0,
        paddingTop: space.xl,
        backgroundColor: t.overlay.scrim,
        alignItems: 'center' as const,
    },
    captureButtonOuter: {
        width: CAPTURE_OUTER,
        height: CAPTURE_OUTER,
        borderRadius: radius.pill,
        borderWidth: space.xs,
        borderColor: t.overlay.onImage,
        justifyContent: 'center' as const,
        alignItems: 'center' as const,
    },
    captureButton: {
        width: CAPTURE_INNER,
        height: CAPTURE_INNER,
        borderRadius: radius.pill,
        backgroundColor: t.overlay.onImage,
        justifyContent: 'center' as const,
        alignItems: 'center' as const,
    },
    captureButtonBusy: {
        opacity: t.interaction.disabledOpacity,
    },
    // Preview screen styles
    previewImage: {
        flex: 1,
        width: '100%' as const,
    },
    previewControls: {
        position: 'absolute' as const,
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'row' as const,
        justifyContent: 'space-around' as const,
        gap: space.md,
        paddingHorizontal: space.xxxl,
        paddingTop: space.xl,
        backgroundColor: t.overlay.scrim,
    },
    retakeButton: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        minHeight: touchTarget,
        paddingHorizontal: space.xxl,
        borderRadius: radius.button,
        borderWidth: 1,
        borderColor: t.overlay.onImage,
        gap: space.sm,
    },
    retakeButtonText: {
        ...typography.callout,
        fontWeight: fontWeight.semibold,
        color: t.overlay.onImage,
    },
    usePhotoButton: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        minHeight: touchTarget,
        paddingHorizontal: space.xxl,
        borderRadius: radius.button,
        backgroundColor: t.brand.fill,
        gap: space.sm,
    },
    usePhotoButtonPressed: {
        backgroundColor: t.brand.fillPressed,
    },
    usePhotoButtonText: {
        ...typography.callout,
        fontWeight: fontWeight.semibold,
        color: t.brand.onFill,
    },
});

export default CameraModal;

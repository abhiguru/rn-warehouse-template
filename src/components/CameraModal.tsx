/**
 * CameraModal - Full-screen camera component with flash control
 * 
 * Uses expo-camera for native camera access with programmable flash control.
 * Flash defaults to ON for better warehouse/document photography.
 */

import React, { useState, useRef, useCallback } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Modal,
    ActivityIndicator,
    Platform,
    StatusBar,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, FlashMode } from 'expo-camera';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import theme from '@/theme';

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
            console.error('[CameraModal] Error capturing photo:', error);
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
            case 'on': return 'ON';
            case 'off': return 'OFF';
            case 'auto': return 'AUTO';
            default: return 'ON';
        }
    };

    // Handle permission not granted yet
    if (!permission) {
        return (
            <Modal visible={visible} animationType="slide" statusBarTranslucent>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                </View>
            </Modal>
        );
    }

    // Handle permission not granted
    if (!permission.granted) {
        return (
            <Modal visible={visible} animationType="slide" statusBarTranslucent>
                <SafeAreaView style={styles.permissionContainer}>
                    <Icon name="camera-off" size={64} color={theme.colors.gray[400]} />
                    <Text style={styles.permissionTitle}>Camera Permission Required</Text>
                    <Text style={styles.permissionText}>
                        We need camera access to take photos for your GRN records.
                    </Text>
                    <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
                        <Text style={styles.permissionButtonText}>Grant Permission</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
                        <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                </SafeAreaView>
            </Modal>
        );
    }

    // Show photo preview with Retake / Use Photo options
    if (previewUri) {
        return (
            <Modal visible={visible} animationType="fade" statusBarTranslucent>
                <StatusBar barStyle="light-content" backgroundColor="black" />
                <View style={styles.container}>
                    <Image
                        source={{ uri: previewUri }}
                        style={styles.previewImage}
                        contentFit="contain"
                        cachePolicy="memory"
                        transition={100}
                    />

                    {/* Preview Controls */}
                    <View style={styles.previewControls}>
                        <TouchableOpacity style={styles.retakeButton} onPress={handleRetake}>
                            <Icon name="camera-retake" size={24} color="white" />
                            <Text style={styles.previewButtonText}>Retake</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.usePhotoButton} onPress={handleUsePhoto}>
                            <Icon name="check" size={24} color="white" />
                            <Text style={styles.previewButtonText}>Use Photo</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        );
    }

    return (
        <Modal visible={visible} animationType="slide" statusBarTranslucent>
            <StatusBar barStyle="light-content" backgroundColor="black" />
            <View style={styles.container}>
                <CameraView
                    ref={cameraRef}
                    style={styles.camera}
                    facing={facing}
                    flash={flashMode}
                >
                    {/* Top Controls */}
                    <SafeAreaView style={styles.topControls}>
                        <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
                            <Icon name="close" size={28} color="white" />
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.flashButton} onPress={toggleFlash}>
                            <Icon name={getFlashIcon()} size={24} color="white" />
                            <Text style={styles.flashLabel}>{getFlashLabel()}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.flipButton} onPress={toggleCameraFacing}>
                            <Icon name="camera-flip" size={24} color="white" />
                        </TouchableOpacity>
                    </SafeAreaView>

                    {/* Bottom Controls */}
                    <View style={styles.bottomControls}>
                        <View style={styles.captureButtonOuter}>
                            <TouchableOpacity
                                style={[styles.captureButton, isCapturing && styles.captureButtonDisabled]}
                                onPress={handleCapture}
                                disabled={isCapturing}
                            >
                                {isCapturing ? (
                                    <ActivityIndicator size="small" color="white" />
                                ) : (
                                    <View style={styles.captureButtonInner} />
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </CameraView>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'black',
    },
    camera: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'black',
    },
    permissionContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: theme.colors.gray[50],
        padding: 24,
        gap: 16,
    },
    permissionTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: theme.colors.gray[900],
        marginTop: 16,
    },
    permissionText: {
        fontSize: 14,
        color: theme.colors.gray[600],
        textAlign: 'center',
        lineHeight: 20,
    },
    permissionButton: {
        backgroundColor: theme.colors.primary,
        paddingHorizontal: 32,
        paddingVertical: 14,
        borderRadius: 12,
        marginTop: 16,
    },
    permissionButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
    },
    cancelButton: {
        paddingHorizontal: 32,
        paddingVertical: 14,
    },
    cancelButtonText: {
        color: theme.colors.gray[600],
        fontSize: 14,
    },
    topControls: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'android' ? 40 : 8,
        paddingBottom: 16,
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    closeButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    flashButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.5)',
        gap: 6,
    },
    flashLabel: {
        color: 'white',
        fontSize: 12,
        fontWeight: '600',
    },
    flipButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    bottomControls: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingBottom: Platform.OS === 'ios' ? 40 : 30,
        paddingTop: 20,
        backgroundColor: 'rgba(0,0,0,0.3)',
        alignItems: 'center',
    },
    captureButtonOuter: {
        width: 80,
        height: 80,
        borderRadius: 40,
        borderWidth: 4,
        borderColor: 'white',
        justifyContent: 'center',
        alignItems: 'center',
    },
    captureButton: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: 'white',
        justifyContent: 'center',
        alignItems: 'center',
    },
    captureButtonDisabled: {
        backgroundColor: theme.colors.gray[300],
    },
    captureButtonInner: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: 'white',
    },
    // Preview screen styles
    previewImage: {
        flex: 1,
        width: '100%',
    },
    previewControls: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingHorizontal: 32,
        paddingBottom: Platform.OS === 'ios' ? 50 : 40,
        paddingTop: 20,
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    retakeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.2)',
        gap: 8,
    },
    usePhotoButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: theme.colors.primary,
        gap: 8,
    },
    previewButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
    },
});

export default CameraModal;

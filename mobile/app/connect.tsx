import React, { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ThemedText } from '../src/components/ui/ThemedText';
import { useConnection } from '../src/context/ConnectionContext';
import { useThemeColor } from '../src/hooks/useThemeColor';
import { wsService } from '../src/services/websocket';
import {
  confirmPairing,
  normalizePairingCode,
  PAIRING_CODE_LENGTH,
  PairingError,
  parsePairingLink,
  sanitizeDeviceName,
  serverBaseUrl,
  startPairing,
  toPairingPlatform,
} from '../src/services/pairing';
import { pairingErrorMessage } from '../src/services/pairingMessages';
import { postPairingHref } from '../src/services/deepLink';

type PendingPairing = {
  host: string;
  port: string;
  secure: boolean;
  pairingId: string;
  expiresAt: number;
};

/** Wait briefly for the socket; a slow socket must not block a successful pairing. */
function waitForSocket(timeoutMs = 5000): Promise<'connected' | 'timeout' | 'auth_failed'> {
  return new Promise((resolve) => {
    if (wsService.state === 'connected') {
      resolve('connected');
      return;
    }
    const timeout = setTimeout(() => {
      unsub();
      resolve('timeout');
    }, timeoutMs);
    const unsub = wsService.onStateChange((state) => {
      if (state === 'connected' || state === 'auth_failed') {
        clearTimeout(timeout);
        unsub();
        resolve(state);
      }
    });
  });
}

export default function ConnectScreen() {
  const { t } = useTranslation();
  const { connect, signOutReason, clearSignOutReason } = useConnection();
  const router = useRouter();
  const tint = useThemeColor({}, 'tint');
  const background = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');

  const [permission, requestPermission] = useCameraPermissions();
  const [isVerifying, setIsVerifying] = useState(false);
  const [mode, setMode] = useState<'scan' | 'paste'>('scan');
  const [pasteUrl, setPasteUrl] = useState('');
  const [pending, setPending] = useState<PendingPairing | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const scannedRef = useRef(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!signOutReason) return;
    const key = signOutReason === 'revoked' ? 'pairing.signedOutRevoked' : 'pairing.signedOutLegacy';
    Alert.alert(t('pairing.signedOutTitle'), t(key), [{ text: t('common.ok') }]);
    clearSignOutReason();
  }, [signOutReason, clearSignOutReason, t]);

  const deviceName = sanitizeDeviceName(Constants.deviceName, t('pairing.defaultDeviceName'));

  // Step 1: scanned/pasted link -> POST /api/auth/devices/pair/start
  const startWithUrl = async (url: string, onInvalid: () => void) => {
    const parsed = parsePairingLink(url);
    if (parsed.kind === 'legacy_qr_login') {
      Alert.alert(t('common.error'), t('pairing.legacyQr'), [{ text: t('common.ok'), onPress: onInvalid }]);
      return;
    }
    if (parsed.kind !== 'pairing') {
      Alert.alert(t('common.error'), t('connect.invalidURL'), [{ text: t('common.ok'), onPress: onInvalid }]);
      return;
    }

    setIsVerifying(true);
    try {
      const base = serverBaseUrl(parsed.host, parsed.port, parsed.secure);
      const started = await startPairing(base, parsed.qrToken, deviceName, toPairingPlatform(Platform.OS));
      setCode('');
      setCodeError(null);
      setPending({ host: parsed.host, port: parsed.port, secure: parsed.secure, ...started });
    } catch (e) {
      const error = e instanceof PairingError ? e : new PairingError('unknown');
      Alert.alert(t('common.error'), pairingErrorMessage(t, error), [{ text: t('common.ok'), onPress: onInvalid }]);
    } finally {
      setIsVerifying(false);
    }
  };

  const cancelPairing = () => {
    setPending(null);
    setCode('');
    setCodeError(null);
    scannedRef.current = false;
  };

  // Step 2: 6-digit code -> POST /api/auth/devices/pair/confirm
  const handleConfirmCode = async () => {
    if (!pending) return;
    const normalized = normalizePairingCode(code);
    if (!normalized) {
      setCodeError(t('pairing.codeFormat', { count: PAIRING_CODE_LENGTH }));
      return;
    }
    setIsVerifying(true);
    setCodeError(null);
    try {
      const base = serverBaseUrl(pending.host, pending.port, pending.secure);
      const device = await confirmPairing(base, pending.pairingId, normalized);
      await connect({
        host: pending.host,
        port: pending.port,
        secure: pending.secure,
        token: device.deviceToken,
        deviceId: device.deviceId,
        authKind: 'device',
      });
      // The token is already saved; if the socket is rejected, the connection
      // layer probes Core and returns to pairing when the token is invalid.
      await waitForSocket();
      setPending(null);
      router.replace(postPairingHref() as never);
    } catch (e) {
      const error = e instanceof PairingError ? e : new PairingError('unknown');
      if (error.kind === 'code_invalid') {
        setCodeError(pairingErrorMessage(t, error));
        setCode('');
      } else {
        Alert.alert(t('common.error'), pairingErrorMessage(t, error), [{ text: t('common.ok'), onPress: cancelPairing }]);
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleBarCodeScanned = async (result: BarcodeScanningResult) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    await startWithUrl(result.data, () => (scannedRef.current = false));
  };

  const handlePasteConnect = () => {
    void startWithUrl(pasteUrl.trim(), () => {});
  };

  // Step 2 UI: enter the code shown on the desktop
  if (pending) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: background }]}>
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.container, styles.center]}>
            <ThemedText type='title' style={styles.permissionTitle}>
              {t('pairing.codeTitle')}
            </ThemedText>
            <ThemedText style={styles.permissionMessage}>
              {t('pairing.codeHint', { count: PAIRING_CODE_LENGTH })}
            </ThemedText>
            <ThemedText type='caption' style={styles.pairingMeta}>
              {t('pairing.pairingWith', { server: `${pending.host}:${pending.port}`, device: deviceName })}
            </ThemedText>
            <TextInput
              testID='pairing-code-input'
              style={[styles.codeInput, { color: textColor, borderColor: tint }]}
              value={code}
              onChangeText={(value) => setCode(value.replace(/[^0-9]/g, '').slice(0, PAIRING_CODE_LENGTH))}
              keyboardType='number-pad'
              textContentType='oneTimeCode'
              autoComplete='one-time-code'
              maxLength={PAIRING_CODE_LENGTH}
              placeholder={'0'.repeat(PAIRING_CODE_LENGTH)}
              placeholderTextColor='#999'
              autoFocus
            />
            {codeError && <ThemedText style={styles.codeError}>{codeError}</ThemedText>}
            <TouchableOpacity
              style={[
                styles.permissionButton,
                { backgroundColor: tint, opacity: code.length === PAIRING_CODE_LENGTH && !isVerifying ? 1 : 0.5 },
              ]}
              onPress={handleConfirmCode}
              disabled={code.length !== PAIRING_CODE_LENGTH || isVerifying}
            >
              {isVerifying ? (
                <ActivityIndicator color='#fff' />
              ) : (
                <ThemedText style={styles.permissionButtonText}>{t('pairing.confirm')}</ThemedText>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.switchModeButton} onPress={cancelPairing} disabled={isVerifying}>
              <ThemedText style={{ color: tint }}>{t('common.cancel')}</ThemedText>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // Paste link mode
  if (mode === 'paste') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: background }]}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
        <View style={[styles.container, styles.center]}>
          <ThemedText type='title' style={styles.permissionTitle}>
            {t('connect.pasteLink')}
          </ThemedText>
          <ThemedText style={styles.permissionMessage}>{t('connect.pasteLinkHint')}</ThemedText>

          <TextInput
            style={[styles.urlInput, { color: textColor, borderColor: tint }]}
            placeholder={t('connect.urlPlaceholder')}
            placeholderTextColor='#999'
            value={pasteUrl}
            onChangeText={setPasteUrl}
            autoCapitalize='none'
            autoCorrect={false}
            selectTextOnFocus
          />

          <TouchableOpacity
            style={[styles.permissionButton, { backgroundColor: tint, opacity: pasteUrl.trim() ? 1 : 0.5 }]}
            onPress={handlePasteConnect}
            disabled={!pasteUrl.trim() || isVerifying}
          >
            {isVerifying ? (
              <ActivityIndicator color='#fff' />
            ) : (
              <ThemedText style={styles.permissionButtonText}>{t('connect.connect')}</ThemedText>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.switchModeButton} onPress={() => setMode('scan')}>
            <ThemedText style={{ color: tint }}>{t('connect.scanTitle')}</ThemedText>
          </TouchableOpacity>
        </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // Still loading permission status
  if (!permission) {
    return (
      <SafeAreaView style={[styles.container, styles.center, { backgroundColor: background }]}>
        <ActivityIndicator size='large' color={tint} />
      </SafeAreaView>
    );
  }

  // Permission not granted — show request UI
  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.container, styles.center, { backgroundColor: background }]}>
        <ThemedText type='title' style={styles.permissionTitle}>
          {t('connect.cameraPermissionTitle')}
        </ThemedText>
        <ThemedText style={styles.permissionMessage}>{t('connect.cameraPermissionMessage')}</ThemedText>
        <TouchableOpacity style={[styles.permissionButton, { backgroundColor: tint }]} onPress={requestPermission}>
          <ThemedText style={styles.permissionButtonText}>{t('connect.requestPermission')}</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.switchModeButton} onPress={() => setMode('paste')}>
          <ThemedText style={{ color: tint }}>{t('connect.pasteLink')}</ThemedText>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // Permission granted — show scanner
  return (
    <View style={[styles.container, { backgroundColor: background }]}>
      <CameraView
        style={styles.camera}
        facing='back'
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={isVerifying ? undefined : handleBarCodeScanned}
      />

      {/* Overlay */}
      <View style={styles.overlay} pointerEvents='none'>
        <View style={styles.overlayTop} />
        <View style={styles.overlayMiddle}>
          <View style={styles.overlaySide} />
          <View style={styles.scanFrame} />
          <View style={styles.overlaySide} />
        </View>
        <View style={styles.overlayBottom}>
          <ThemedText style={styles.scanTitle}>{t('connect.scanTitle')}</ThemedText>
          <ThemedText style={styles.scanHint}>{t('connect.scanHint')}</ThemedText>
        </View>
      </View>

      {/* Switch to paste mode */}
      <View style={[styles.pasteLinkContainer, { bottom: 60 + insets.bottom }]}>
        <TouchableOpacity style={[styles.pasteLinkButton, { backgroundColor: 'rgba(255,255,255,0.9)' }]} onPress={() => setMode('paste')}>
          <ThemedText style={[styles.pasteLinkText, { color: '#333' }]}>{t('connect.pasteLink')}</ThemedText>
        </TouchableOpacity>
      </View>

      {/* Verifying indicator */}
      {isVerifying && (
        <View style={styles.verifyingOverlay}>
          <ActivityIndicator size='large' color='#fff' />
          <ThemedText style={styles.verifyingText}>{t('connect.verifying')}</ThemedText>
        </View>
      )}
    </View>
  );
}

const SCAN_FRAME_SIZE = 250;
const OVERLAY_COLOR = 'rgba(0, 0, 0, 0.6)';

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayTop: {
    flex: 1,
    backgroundColor: OVERLAY_COLOR,
  },
  overlayMiddle: {
    flexDirection: 'row',
    height: SCAN_FRAME_SIZE,
  },
  overlaySide: {
    flex: 1,
    backgroundColor: OVERLAY_COLOR,
  },
  scanFrame: {
    width: SCAN_FRAME_SIZE,
    height: SCAN_FRAME_SIZE,
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: 16,
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: OVERLAY_COLOR,
    alignItems: 'center',
    paddingTop: 32,
  },
  scanTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  scanHint: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  verifyingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  verifyingText: {
    color: '#fff',
    fontSize: 16,
  },
  permissionTitle: {
    marginBottom: 12,
    textAlign: 'center',
  },
  permissionMessage: {
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  permissionButton: {
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  pairingMeta: {
    textAlign: 'center',
    marginBottom: 16,
  },
  codeInput: {
    width: 220,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    fontSize: 28,
    letterSpacing: 8,
    textAlign: 'center',
    marginBottom: 12,
  },
  codeError: {
    color: '#F53F3F',
    textAlign: 'center',
    marginBottom: 12,
  },
  urlInput: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    marginBottom: 20,
  },
  switchModeButton: {
    marginTop: 20,
    padding: 10,
  },
  pasteLinkContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  pasteLinkButton: {
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  pasteLinkText: {
    fontSize: 15,
    fontWeight: '600',
  },
});

import type { TFunction } from 'i18next';
import type { PairingError } from './pairing';

/** Map a pairing failure to a localized, user-facing message. */
export function pairingErrorMessage(t: TFunction, error: PairingError): string {
  switch (error.kind) {
    case 'qr_invalid':
      return t('pairing.errors.qrInvalid');
    case 'code_invalid':
      return typeof error.details.attemptsLeft === 'number'
        ? t('pairing.errors.codeInvalidAttempts', { count: error.details.attemptsLeft })
        : t('pairing.errors.codeInvalid');
    case 'closed':
      return t('pairing.errors.closed');
    case 'device_limit':
      return typeof error.details.maxDevices === 'number'
        ? t('pairing.errors.deviceLimitMax', { count: error.details.maxDevices })
        : t('pairing.errors.deviceLimit');
    case 'invalid_request':
      return t('pairing.errors.invalidRequest');
    case 'network':
      return t('pairing.errors.network');
    default:
      return t('pairing.errors.unknown');
  }
}

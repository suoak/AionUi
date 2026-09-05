/**
 * Shared error formatting for Agent Center + Skill Evolution pages.
 * Keeps toast text diagnosable without coupling modules in the product UX.
 */
import { isBackendHttpError } from '@/common/adapter/httpBridge';

export function formatAgentCenterError(error: unknown, fallback: string): string {
  if (isBackendHttpError(error)) {
    if (error.backendMessage) return `${fallback}：${error.backendMessage}`;
    if (error.status) return `${fallback}（HTTP ${error.status}）`;
  }
  if (error instanceof Error && error.message) {
    // Prefer short messages; BackendHttpError.message is already verbose.
    if (!isBackendHttpError(error)) return `${fallback}：${error.message}`;
  }
  return fallback;
}

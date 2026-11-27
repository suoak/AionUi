/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** 3.0 C5: `GET /api/agents/preflight` readiness per runtime agent. */
export type PreflightLevel = 'pass' | 'warn' | 'fail';

export type PreflightCheckKey = 'enabled' | 'installed' | 'runtime' | 'connection' | 'auth' | 'provider' | 'version';

export type PreflightFixAction =
  | 'enable'
  | 'install'
  | 'health_check'
  | 'login'
  | 'configure_provider'
  | 'prepare_runtime'
  | 'update_cli';

export type PreflightCheck = {
  key: PreflightCheckKey;
  level: PreflightLevel;
  message: string;
  code?: string;
  fix?: { action: PreflightFixAction; target: string };
};

export type AgentPreflight = {
  id: string;
  name: string;
  backend?: string;
  level: PreflightLevel;
  ready: boolean;
  checks: PreflightCheck[];
  checked_at?: number;
};

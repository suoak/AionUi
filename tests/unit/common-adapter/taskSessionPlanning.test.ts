import { canStartAutomaticPlanning, type PlanningIsolation } from '@/common/types/agent/taskSession';
import { describe, expect, it } from 'vitest';

const isolation = (level: PlanningIsolation['level'], automaticPlanningEnabled: boolean): PlanningIsolation => ({
  level,
  integration_mode: 'in_process_tool_registry',
  automatic_planning_enabled: automaticPlanningEnabled,
  reason: 'test evidence',
  evidence: [],
});

describe('automatic planning availability', () => {
  it('enables automatic planning only for a guaranteed runtime that explicitly enables it', () => {
    expect(canStartAutomaticPlanning(isolation('guaranteed', true))).toBe(true);
  });

  it.each(['best_effort', 'unsupported'] as const)(
    'keeps %s isolation disabled even if a malformed response enables it',
    (level) => {
      expect(canStartAutomaticPlanning(isolation(level, true))).toBe(false);
    }
  );

  it('fails closed when isolation evidence is unavailable', () => {
    expect(canStartAutomaticPlanning(undefined)).toBe(false);
    expect(canStartAutomaticPlanning(isolation('guaranteed', false))).toBe(false);
  });
});

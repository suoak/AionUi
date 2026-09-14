import { describe, expect, it } from 'vitest';
import { legacySkillEvolutionPath } from '@/renderer/pages/skill-evolution/routes';

describe('Skill Evolution routing', () => {
  it('redirects legacy Agent Center URLs to the independent list route', () => {
    expect(legacySkillEvolutionPath(false, '?assistant_id=agent-1')).toBe('/skill-evolution?assistant_id=agent-1');
  });

  it('redirects legacy create URLs without losing conversation context', () => {
    expect(legacySkillEvolutionPath(true, '?conversation_id=conversation-1')).toBe(
      '/skill-evolution/new?conversation_id=conversation-1'
    );
  });
});

import { describe, expect, it } from 'vitest';
import { isPrimaryApplicationShortcut } from '@/renderer/utils/ui/keyboardShortcuts';

function makeEvent(partial: Partial<KeyboardEvent> & { key: string }): KeyboardEvent {
  const target = partial.target ?? null;
  return {
    key: partial.key,
    metaKey: partial.metaKey ?? false,
    ctrlKey: partial.ctrlKey ?? false,
    altKey: partial.altKey ?? false,
    shiftKey: partial.shiftKey ?? false,
    repeat: partial.repeat ?? false,
    isComposing: false,
    defaultPrevented: false,
    target,
    composedPath: () => (target ? [target] : []),
  } as unknown as KeyboardEvent;
}

describe('Cmd/Ctrl+K palette shortcut', () => {
  it('matches ctrl+k with embedded-editor guard', () => {
    const event = makeEvent({ key: 'k', ctrlKey: true });
    expect(isPrimaryApplicationShortcut(event, { key: 'k', targetGuard: 'embedded-editor' })).toBe(true);
  });

  it('does not match without primary modifier', () => {
    const event = makeEvent({ key: 'k' });
    expect(isPrimaryApplicationShortcut(event, { key: 'k', targetGuard: 'embedded-editor' })).toBe(false);
  });
});

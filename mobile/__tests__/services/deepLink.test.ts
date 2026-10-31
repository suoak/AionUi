import {
  inboxItemHref,
  isValidInboxId,
  parseInboxDeepLink,
  postPairingHref,
  setPendingInboxId,
  takePendingInboxId,
} from '@/src/services/deepLink';

describe('deep links', () => {
  afterEach(() => {
    setPendingInboxId(null);
  });

  it('parses csbu-workmate://inbox/{id}', () => {
    expect(parseInboxDeepLink('csbu-workmate://inbox/abc_123')).toBe('abc_123');
    expect(parseInboxDeepLink('csbu-workmate://inbox/abc-1/')).toBe('abc-1');
    expect(parseInboxDeepLink('csbu-workmate://inbox/abc?x=1')).toBe('abc');
  });

  it('rejects other links and unsafe ids', () => {
    expect(parseInboxDeepLink('https://example.com/inbox/abc')).toBeNull();
    expect(parseInboxDeepLink('csbu-workmate://chat/abc')).toBeNull();
    expect(parseInboxDeepLink('csbu-workmate://inbox/a%2F..')).toBeNull();
    expect(parseInboxDeepLink('csbu-workmate://inbox/%E0%A4%A')).toBeNull();
    expect(isValidInboxId('x'.repeat(129))).toBe(false);
    expect(isValidInboxId(42)).toBe(false);
  });

  it('builds the expo-router href', () => {
    expect(inboxItemHref('abc')).toBe('/inbox/abc');
  });

  it('parks an id until pairing finishes, once', () => {
    setPendingInboxId('item-1');
    expect(postPairingHref()).toBe('/inbox/item-1');
    expect(postPairingHref()).toBe('/(tabs)/inbox');
  });

  it('ignores invalid parked ids', () => {
    setPendingInboxId('../etc');
    expect(takePendingInboxId()).toBeNull();
  });
});

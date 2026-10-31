import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ThemedText } from '../ui/ThemedText';
import { useThemeColor } from '../../hooks/useThemeColor';
import type { InboxItem } from '../../services/inbox';

export function formatInboxTime(ms: number, locale?: string): string {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const date = new Date(ms);
  const sameDay = new Date().toDateString() === date.toDateString();
  return sameDay
    ? date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

export function InboxItemRow({ item, onPress }: { item: InboxItem; onPress: () => void }) {
  const { t, i18n } = useTranslation();
  const surface = useThemeColor({}, 'surface');
  const tint = useThemeColor({}, 'tint');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const unread = !item.read_at;

  return (
    <TouchableOpacity
      testID={`inbox-item-${item.id}`}
      style={[styles.row, { backgroundColor: surface }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.dot, { backgroundColor: unread ? tint : 'transparent' }]} />
      <View style={styles.body}>
        <View style={styles.header}>
          <ThemedText type='caption' style={{ color: textSecondary }}>
            {t(`inbox.kind.${item.kind}`, { defaultValue: item.kind })}
            {item.resolved_at ? ` · ${t('inbox.resolved')}` : ''}
          </ThemedText>
          <ThemedText type='caption' style={{ color: textSecondary }}>
            {formatInboxTime(item.created_at, i18n.language)}
          </ThemedText>
        </View>
        <ThemedText style={[styles.title, unread && styles.unread]} numberOfLines={2}>
          {item.title}
        </ThemedText>
        {item.summary ? (
          <ThemedText type='caption' numberOfLines={2} style={{ color: textSecondary }}>
            {item.summary}
          </ThemedText>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', borderRadius: 12, padding: 12, gap: 10 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 8 },
  body: { flex: 1, gap: 2 },
  header: { flexDirection: 'row', justifyContent: 'space-between' },
  title: { fontSize: 15, lineHeight: 21 },
  unread: { fontWeight: '600' },
});

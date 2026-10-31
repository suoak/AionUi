import React, { useLayoutEffect } from 'react';
import { FlatList, RefreshControl, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ThemedText } from '../../../src/components/ui/ThemedText';
import { InboxItemRow } from '../../../src/components/inbox/InboxItemRow';
import { AgentApprovalCard } from '../../../src/components/inbox/AgentApprovalCard';
import { useInbox } from '../../../src/context/InboxContext';
import { useThemeColor } from '../../../src/hooks/useThemeColor';
import { inboxItemHref } from '../../../src/services/deepLink';

export default function InboxScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const tint = useThemeColor({}, 'tint');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const { items, unreadCount, agentApprovals, loading, loaded, error, refresh, markAllRead } = useInbox();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        unreadCount > 0 ? (
          <TouchableOpacity onPress={markAllRead} style={styles.headerButton}>
            <ThemedText style={{ color: tint }}>{t('inbox.markAllRead')}</ThemedText>
          </TouchableOpacity>
        ) : null,
    });
  }, [navigation, unreadCount, markAllRead, tint, t]);

  const header =
    agentApprovals.length > 0 ? (
      <View style={styles.section}>
        <ThemedText type='caption' style={styles.sectionTitle}>
          {t('inbox.agentApprovalsSection', { count: agentApprovals.length })}
        </ThemedText>
        {agentApprovals.map((record) => (
          <AgentApprovalCard key={record.id} record={record} onResolved={() => void refresh()} />
        ))}
        <ThemedText type='caption' style={styles.sectionTitle}>
          {t('inbox.itemsSection')}
        </ThemedText>
      </View>
    ) : null;

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.content}
      ListHeaderComponent={header}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      renderItem={({ item }) => (
        <InboxItemRow item={item} onPress={() => router.push(inboxItemHref(item.id) as never)} />
      )}
      refreshControl={<RefreshControl refreshing={loading && loaded} onRefresh={refresh} tintColor={tint} />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <ThemedText style={{ color: textSecondary }}>
            {error ? t('inbox.loadFailed') : loaded ? t('inbox.empty') : t('common.loading')}
          </ThemedText>
          {error && (
            <TouchableOpacity onPress={refresh}>
              <ThemedText style={{ color: tint }}>{t('common.retry')}</ThemedText>
            </TouchableOpacity>
          )}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, flexGrow: 1 },
  section: { gap: 8, marginBottom: 8 },
  sectionTitle: { paddingHorizontal: 4, fontWeight: '600' },
  separator: { height: 8 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 64 },
  headerButton: { paddingHorizontal: 12, paddingVertical: 6 },
});

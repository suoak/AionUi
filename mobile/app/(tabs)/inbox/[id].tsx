import React, { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ThemedText } from '../../../src/components/ui/ThemedText';
import { TaskApprovalCard } from '../../../src/components/inbox/TaskApprovalCard';
import { formatInboxTime } from '../../../src/components/inbox/InboxItemRow';
import { useConnection } from '../../../src/context/ConnectionContext';
import { useInbox } from '../../../src/context/InboxContext';
import { useThemeColor } from '../../../src/hooks/useThemeColor';
import { isValidInboxId, setPendingInboxId } from '../../../src/services/deepLink';
import { taskApprovalRef } from '../../../src/services/inbox';

/** Inbox item detail; also the target of `csbu-workmate://inbox/{id}`. */
export default function InboxItemScreen() {
  const { t, i18n } = useTranslation();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { isConfigured } = useConnection();
  const { items, loaded, loading, refresh, markRead } = useInbox();
  const textSecondary = useThemeColor({}, 'textSecondary');
  const triedRefresh = useRef(false);
  const item = items.find((candidate) => candidate.id === id);

  // Not paired yet: remember the link and open it after pairing.
  useEffect(() => {
    if (!isConfigured && isValidInboxId(id)) setPendingInboxId(id);
  }, [isConfigured, id]);

  // Core has no GET-by-id for inbox items: reload the list once if needed.
  useEffect(() => {
    if (isConfigured && !item && loaded && !loading && !triedRefresh.current) {
      triedRefresh.current = true;
      void refresh();
    }
  }, [isConfigured, item, loaded, loading, refresh]);

  useEffect(() => {
    if (item && !item.read_at) void markRead(item.id);
  }, [item, markRead]);

  if (!isValidInboxId(id)) {
    return <Centered text={t('inbox.notFound')} />;
  }
  if (!item) {
    return <Centered text={loaded && triedRefresh.current && !loading ? t('inbox.notFound') : t('common.loading')} />;
  }

  const approval = taskApprovalRef(item);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <ThemedText type='caption' style={{ color: textSecondary }}>
          {t(`inbox.kind.${item.kind}`, { defaultValue: item.kind })} ·{' '}
          {formatInboxTime(item.created_at, i18n.language)}
        </ThemedText>
        <ThemedText type='subtitle'>{item.title}</ThemedText>
        {item.summary ? <ThemedText style={{ color: textSecondary }}>{item.summary}</ThemedText> : null}
      </View>
      {approval ? (
        <TaskApprovalCard taskSessionId={approval.taskSessionId} approvalId={approval.approvalId} onDecided={refresh} />
      ) : (
        <ThemedText type='caption' style={{ color: textSecondary }}>
          {t('inbox.openOnDesktop')}
        </ThemedText>
      )}
    </ScrollView>
  );
}

function Centered({ text }: { text: string }) {
  return (
    <View style={styles.centered}>
      <ThemedText>{text}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  header: { gap: 6 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
});

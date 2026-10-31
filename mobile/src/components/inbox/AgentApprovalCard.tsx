import React, { useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ThemedText } from '../ui/ThemedText';
import { useThemeColor } from '../../hooks/useThemeColor';
import {
  apiErrorCode,
  canApproveAgentAction,
  canDenyAgentAction,
  isAgentSummaryTruncated,
  resolveAgentApproval,
  type AgentApproval,
} from '../../services/inbox';

type Props = {
  record: AgentApproval;
  onResolved?: (record: AgentApproval) => void;
};

/**
 * An agent asks to change configuration (MCP, provider, settings, …). Per
 * D9-5 the phone shows the full redacted request; when Core had to truncate
 * it, approval moves to the desktop (see config/approvalPolicy.ts).
 */
export function AgentApprovalCard({ record, onResolved }: Props) {
  const { t } = useTranslation();
  const confirmBg = useThemeColor({}, 'confirmBg');
  const confirmBorder = useThemeColor({}, 'confirmBorder');
  const success = useThemeColor({}, 'success');
  const errorColor = useThemeColor({}, 'error');
  const codeBg = useThemeColor({}, 'codeBackground');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const [busy, setBusy] = useState<'approve' | 'deny' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [resolved, setResolved] = useState<AgentApproval | null>(null);

  const current = resolved ?? record;
  const truncated = isAgentSummaryTruncated(current);
  const canApprove = !resolved && canApproveAgentAction(current);
  const canDeny = !resolved && canDenyAgentAction(current);

  const decide = async (approve: boolean) => {
    setBusy(approve ? 'approve' : 'deny');
    setMessage(null);
    try {
      const next = await resolveAgentApproval(current.id, approve);
      setResolved(next);
      onResolved?.(next);
    } catch (e) {
      setMessage(
        apiErrorCode(e) === 'APPROVAL_NOT_PENDING' ? t('approval.alreadyHandled') : t('approval.decisionFailed')
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <View
      testID={`agent-approval-${current.id}`}
      style={[styles.container, { backgroundColor: confirmBg, borderColor: confirmBorder }]}
    >
      <ThemedText style={styles.title}>{t('approval.agentTitle')}</ThemedText>
      <ThemedText type='caption' style={{ color: textSecondary }}>
        {t(`approval.agentKind.${current.kind}`, { defaultValue: current.kind })}
      </ThemedText>
      <ThemedText style={styles.request} selectable>
        {current.method} {current.path}
      </ThemedText>
      {current.summary ? (
        <ScrollView style={[styles.summary, { backgroundColor: codeBg }]} nestedScrollEnabled>
          <ThemedText style={styles.summaryText} selectable>
            {current.summary}
          </ThemedText>
        </ScrollView>
      ) : null}
      {truncated && (
        <ThemedText testID='agent-approval-truncated' style={[styles.notice, { color: errorColor }]}>
          {canDeny && !canApprove ? t('approval.summaryTruncatedDesktop') : t('approval.summaryTruncated')}
        </ThemedText>
      )}
      {resolved && (
        <ThemedText style={styles.notice}>
          {resolved.status === 'approved' ? t('approval.agentApproved') : t('approval.agentDenied')}
        </ThemedText>
      )}
      {message && <ThemedText style={[styles.notice, { color: errorColor }]}>{message}</ThemedText>}
      {(canApprove || canDeny) && (
        <View style={styles.actions}>
          {canDeny && (
            <TouchableOpacity
              testID='agent-approval-deny'
              style={[styles.button, { borderColor: errorColor, borderWidth: 1 }]}
              onPress={() => decide(false)}
              disabled={busy !== null}
            >
              {busy === 'deny' ? (
                <ActivityIndicator size='small' color={errorColor} />
              ) : (
                <ThemedText style={{ color: errorColor, fontWeight: '600' }}>{t('approval.deny')}</ThemedText>
              )}
            </TouchableOpacity>
          )}
          {canApprove && (
            <TouchableOpacity
              testID='agent-approval-approve'
              style={[styles.button, { backgroundColor: success }]}
              onPress={() => decide(true)}
              disabled={busy !== null}
            >
              {busy === 'approve' ? (
                <ActivityIndicator size='small' color='#fff' />
              ) : (
                <ThemedText style={{ color: '#fff', fontWeight: '600' }}>{t('approval.approve')}</ThemedText>
              )}
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 6 },
  title: { fontWeight: '600' },
  request: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 13 },
  summary: { maxHeight: 240, borderRadius: 8, padding: 8 },
  summaryText: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 12, lineHeight: 18 },
  notice: { fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
  button: { borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16, minWidth: 88, alignItems: 'center' },
});

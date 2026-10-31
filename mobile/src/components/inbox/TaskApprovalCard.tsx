import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ThemedText } from '../ui/ThemedText';
import { MarkdownContent } from '../chat/MarkdownContent';
import { useThemeColor } from '../../hooks/useThemeColor';
import {
  decideTaskApproval,
  loadTaskApproval,
  type PlanExecution,
  type TaskApprovalDetail,
} from '../../services/inbox';

type Props = {
  taskSessionId: string;
  approvalId: string;
  onDecided?: () => void;
};

/** Plan / Goal approval card (decides via POST …/approvals/{id}/decision). */
export function TaskApprovalCard({ taskSessionId, approvalId, onDecided }: Props) {
  const { t } = useTranslation();
  const surface = useThemeColor({}, 'surface');
  const border = useThemeColor({}, 'border');
  const success = useThemeColor({}, 'success');
  const errorColor = useThemeColor({}, 'error');
  const tint = useThemeColor({}, 'tint');
  const textColor = useThemeColor({}, 'text');
  const textSecondary = useThemeColor({}, 'textSecondary');

  const [detail, setDetail] = useState<TaskApprovalDetail | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [execution, setExecution] = useState<PlanExecution | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const next = await loadTaskApproval(taskSessionId, approvalId);
      setDetail(next);
      setState(next ? 'ready' : 'missing');
    } catch {
      setState('error');
    }
  }, [taskSessionId, approvalId]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (decision: 'approve' | 'reject') => {
    if (!detail) return;
    setBusy(decision);
    setMessage(null);
    try {
      const result = await decideTaskApproval(detail.approval, decision, comment);
      setDetail({ ...detail, approval: result.approval });
      setExecution(result.execution);
      onDecided?.();
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      setMessage(status === 409 ? t('approval.taskConflict') : t('approval.decisionFailed'));
    } finally {
      setBusy(null);
    }
  };

  if (state === 'loading') {
    return <ActivityIndicator style={styles.loading} color={tint} />;
  }
  if (state !== 'ready' || !detail) {
    return (
      <View style={[styles.container, { backgroundColor: surface }]}>
        <ThemedText>{state === 'missing' ? t('approval.taskMissing') : t('approval.loadFailed')}</ThemedText>
        {state === 'error' && (
          <TouchableOpacity onPress={load}>
            <ThemedText style={{ color: tint }}>{t('common.retry')}</ThemedText>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const { approval, artifact } = detail;
  const isPlan = approval.approval_type === 'plan';
  const pending = approval.status === 'pending';

  return (
    <View testID='task-approval-card' style={[styles.container, { backgroundColor: surface, borderColor: border }]}>
      <ThemedText style={styles.title}>{isPlan ? t('approval.planTitle') : t('approval.goalTitle')}</ThemedText>
      <ThemedText type='caption' style={{ color: textSecondary }}>
        {t(`approval.status.${approval.status}`, { defaultValue: approval.status })}
        {artifact ? ` · v${artifact.version}` : ''}
      </ThemedText>
      {artifact ? (
        <View style={[styles.artifact, { borderColor: border }]}>
          <MarkdownContent content={artifact.content} />
        </View>
      ) : (
        <ThemedText type='caption'>{t('approval.artifactMissing')}</ThemedText>
      )}

      {execution === 'desktop' && (
        <ThemedText testID='plan-execute-on-desktop' style={styles.notice}>
          {t('approval.planApprovedRunOnDesktop')}
        </ThemedText>
      )}
      {execution === 'started' && <ThemedText style={styles.notice}>{t('approval.planExecutionStarted')}</ThemedText>}
      {execution === 'start_failed' && (
        <ThemedText style={[styles.notice, { color: errorColor }]}>{t('approval.planExecutionFailed')}</ThemedText>
      )}
      {execution === 'none' && approval.status !== 'pending' && (
        <ThemedText style={styles.notice}>
          {approval.status === 'approved' ? t('approval.taskApproved') : t('approval.taskRejected')}
        </ThemedText>
      )}
      {message && <ThemedText style={[styles.notice, { color: errorColor }]}>{message}</ThemedText>}

      {pending && artifact && (
        <>
          <TextInput
            testID='task-approval-comment'
            style={[styles.comment, { borderColor: border, color: textColor }]}
            placeholder={t('approval.commentPlaceholder')}
            placeholderTextColor='#999'
            value={comment}
            onChangeText={setComment}
            multiline
          />
          <View style={styles.actions}>
            <TouchableOpacity
              testID='task-approval-reject'
              style={[styles.button, { borderColor: errorColor, borderWidth: 1 }]}
              onPress={() => decide('reject')}
              disabled={busy !== null}
            >
              {busy === 'reject' ? (
                <ActivityIndicator size='small' color={errorColor} />
              ) : (
                <ThemedText style={{ color: errorColor, fontWeight: '600' }}>{t('approval.reject')}</ThemedText>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              testID='task-approval-approve'
              style={[styles.button, { backgroundColor: success }]}
              onPress={() => decide('approve')}
              disabled={busy !== null}
            >
              {busy === 'approve' ? (
                <ActivityIndicator size='small' color='#fff' />
              ) : (
                <ThemedText style={{ color: '#fff', fontWeight: '600' }}>{t('approval.approve')}</ThemedText>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: 24 },
  container: { borderRadius: 12, padding: 12, gap: 8, borderWidth: StyleSheet.hairlineWidth },
  title: { fontWeight: '600', fontSize: 17 },
  artifact: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  notice: { fontSize: 14, lineHeight: 20 },
  comment: { borderWidth: 1, borderRadius: 8, padding: 10, minHeight: 44, fontSize: 15 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  button: { borderRadius: 8, paddingVertical: 10, paddingHorizontal: 18, minWidth: 96, alignItems: 'center' },
});

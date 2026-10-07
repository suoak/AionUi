# Conversation delete hotfix

## Release boundary

This is the final feature admitted to WorkMate 2.4.0. The release remains feature-frozen to M6.1-M6.4 plus restoration of permanent conversation deletion. M7, Agent Router, SIWC, other-agent enhancements, KnowHub expansion, broad upstream synchronization, and UI redesign are out of scope.

## Root cause and upstream audit

The authoritative delete stack was still present:

```text
conversation.remove
  -> DELETE /api/conversations/:id
  -> ConversationService::delete
  -> IConversationRepository::delete
```

The Recent Conversation row stopped exposing it. `useConversationActions` contained an unreturned `removeConversation` helper, while `ConversationRow` had Archive but no Delete menu item, confirmation, or active-task error handling.

Only `upstream/main` was fetched (`6744099b279b991c17e31c243f0920477bd31cb6`). It has the same missing menu entry and unused helper, so there was no focused upstream fix to cherry-pick. No upstream merge or rebase was performed.

The backend also had unsafe semantics for this product action: it marked an active conversation as deleting, invoked the process-kill hook, and then removed the row. In addition, completed M4 runs used `ON DELETE RESTRICT`, so a conversation with retained task data could not be deleted.

## Implementation

- Recent Conversation now keeps Rename, Pin/Unpin, Archive, a separator, and a destructive Delete action.
- Delete uses the existing Arco `Modal.confirm` flow. English confirmation is `Permanently delete this conversation?` followed by `This action cannot be undone.`
- Renderer activity is an immediate advisory guard. Core remains authoritative and returns HTTP 409 with stable code `CONVERSATION_ACTIVE` for runtime starting/running/waiting-approval/cancelling work or an M4 task in `running`/`waiting_approval`.
- Core reserves an idle conversation for deletion under the runtime-state lock. This prevents a new turn from racing the delete. Delete never means stop-and-delete.
- The repository removes the completed WorkMate task aggregate and the conversation in one SQLite transaction. A failed or blocked delete therefore does not leave partial cleanup.
- Success emits the existing `conversation.deleted` event, clears runtime/queue views, and leaves the deleted current route by navigating to `/`. Backend `conversation.listChanged(deleted)` refreshes the Recent list.
- The implementation never accesses `~/.codex`, Codex rollout files, OAuth credentials, or Codex private thread storage.

## Ownership and cleanup

Permanent conversation deletion also permanently removes the WorkMate-owned task/review aggregate tied to that conversation. This matches the destructive action and avoids inventing a new audit-retention mode inside the hotfix.

| Entity                                  | Owner                                                   | FK / link                                                  | Previous delete behavior                            | 2.4.0 behavior                                                                 | Orphan risk           |
| --------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------- |
| Conversation                            | WorkMate user                                           | Root row                                                   | Direct repository delete                            | Deleted after guards and owned cleanup                                         | None                  |
| Message / conversation artifact         | Conversation                                            | `ON DELETE CASCADE`                                        | Cascaded                                            | Cascaded                                                                       | None                  |
| TaskSession                             | WorkMate user + Conversation                            | `conversation_id`, `ON DELETE SET NULL`                    | Would detach if no run blocked deletion             | Explicitly deleted in the same transaction                                     | None                  |
| TaskRun                                 | TaskSession + Conversation                              | session `CASCADE`; conversation `RESTRICT`                 | Blocked completed conversation deletion             | Removed through TaskSession cascade before Conversation                        | None                  |
| RuntimeBinding                          | Computed from TaskSession conversation plus ACP session | No standalone runtime-binding table                        | Could become meaningless after detached TaskSession | TaskSession is removed; ACP session is manually removed by ConversationService | None                  |
| Trace                                   | TaskRun / TaskSession                                   | `ON DELETE CASCADE`                                        | Retained while delete was restricted                | Cascaded                                                                       | None                  |
| Review                                  | Computed aggregate, no standalone table                 | TaskSession/Run/Artifact/Approval/Trace                    | Could not outlive restricted run delete             | Aggregate sources cascade together                                             | None                  |
| Checkpoint                              | TaskRun / TaskSession                                   | `ON DELETE CASCADE`                                        | Retained while delete was restricted                | Cascaded                                                                       | None                  |
| Evidence                                | TaskRun / TaskSession                                   | `ON DELETE CASCADE`; optional trace/criterion `SET NULL`   | Retained while delete was restricted                | Cascaded                                                                       | None                  |
| Approval                                | TaskSession                                             | session/artifact `CASCADE`; run reference is informational | Retained while delete was restricted                | Cascaded                                                                       | None                  |
| Context snapshot                        | TaskRun / TaskSession                                   | `ON DELETE CASCADE`                                        | Retained while delete was restricted                | Cascaded                                                                       | None                  |
| Sidebar order / cron state / skill view | Conversation lifecycle hooks                            | Manual cleanup                                             | Best-effort hooks                                   | Existing hooks retained, after active guard                                    | Self-healing / logged |

## Test contract

Cloud validation covers:

- Delete and Archive remain visible in the row menu; Rename and Pin regressions stay covered.
- Active UI state blocks before confirmation.
- Confirmation cancel performs no request; confirmation performs the existing bridge request.
- Core rejects active runtime and M4 task states without invoking delete hooks or partial cleanup.
- Completed task conversations delete, and TaskSession, Run, Trace, Checkpoint, Evidence, Approval, Artifact, and Context Snapshot rows have no orphan.
- Existing repository persistence, reopen/not-found, unrelated conversation isolation, archive, rename, pin, M4 Review, and M6 auth/session/model/usage suites remain release gates.

## Version impact

Authoritative fail-closed behavior and transactional M4 cleanup require a Core change, so WorkMate 2.4.0 pins AionCore 0.2.17 rather than 0.2.16. Exact release SHAs, the Git tag, bundled Codex version, installer identity, and SHA-256 are recorded in `36-m6-packaged-validation.md` only after official GitHub release workflows complete.

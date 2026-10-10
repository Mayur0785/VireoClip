import React, { useEffect, useState } from 'react';
import {
  Building2,
  UserPlus,
  Copy,
  Check,
  Trash2,
  Plus,
  RefreshCw,
  AlertCircle,
  KeyRound,
} from 'lucide-react';
import { workspaceService, WorkspaceDetailResponse, InviteMemberResponse } from '../services/workspaceService';
import { WorkspaceRecord, WorkspaceMemberRecord, WorkspaceInvitationRecord, WorkspaceRole } from '../types';

const ROLE_BADGES: Record<WorkspaceRole, { label: string; tone: string; desc: string }> = {
  OWNER: { label: 'Owner', tone: 'bg-amber-100 text-amber-800 border-amber-300', desc: 'Full workspace control, billing, role transfer & deletion' },
  ADMIN: { label: 'Admin', tone: 'bg-purple-100 text-purple-800 border-purple-300', desc: 'Manage editors, viewers, invitations & workspace settings' },
  EDITOR: { label: 'Editor', tone: 'bg-blue-100 text-blue-800 border-blue-300', desc: 'Create, edit & manage video content and creative assets' },
  VIEWER: { label: 'Viewer', tone: 'bg-zinc-100 text-zinc-700 border-zinc-300', desc: 'Read-only access to review videos, workflows & reports' },
};

export const WorkspacePage: React.FC = () => {
  const [workspaces, setWorkspaces] = useState<Array<WorkspaceRecord & { role: WorkspaceRole; member_count: number }>>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceDetailResponse | null>(null);
  const [members, setMembers] = useState<WorkspaceMemberRecord[]>([]);
  const [invitations, setInvitations] = useState<WorkspaceInvitationRecord[]>([]);

  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>('EDITOR');
  const [inviteResult, setInviteResult] = useState<InviteMemberResponse | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);

  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [acceptToken, setAcceptToken] = useState('');
  const [acceptLoading, setAcceptLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<'members' | 'invitations' | 'settings'>('members');

  // Load user workspaces list
  const loadWorkspaces = async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await workspaceService.listWorkspaces();
      setWorkspaces(list);

      if (list.length > 0) {
        // Keep active or select first workspace
        const target = activeWorkspaceId && list.some((w) => w.id === activeWorkspaceId)
          ? activeWorkspaceId
          : list[0].id;
        setActiveWorkspaceId(target);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load workspaces.');
    } finally {
      setLoading(false);
    }
  };

  // Load active workspace details & members
  const loadWorkspaceDetails = async (wsId: string) => {
    try {
      setContentLoading(true);
      const [detail, memberList, inviteList] = await Promise.all([
        workspaceService.getWorkspace(wsId),
        workspaceService.listMembers(wsId),
        workspaceService.listInvitations(wsId).catch(() => []),
      ]);
      setActiveWorkspace(detail);
      setMembers(memberList);
      setInvitations(inviteList);
    } catch (err: any) {
      setError(err?.message || 'Failed to load workspace members.');
    } finally {
      setContentLoading(false);
    }
  };

  useEffect(() => {
    loadWorkspaces();
  }, []);

  useEffect(() => {
    if (activeWorkspaceId) {
      loadWorkspaceDetails(activeWorkspaceId);
    }
  }, [activeWorkspaceId]);

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;

    try {
      setCreateLoading(true);
      const created = await workspaceService.createWorkspace({ name: newWorkspaceName.trim() });
      setMessage({ type: 'success', text: `Workspace "${created.workspace.name}" created successfully!` });
      setShowCreateModal(false);
      setNewWorkspaceName('');
      await loadWorkspaces();
      setActiveWorkspaceId(created.workspace.id);
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Failed to create workspace.' });
    } finally {
      setCreateLoading(false);
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspaceId || !inviteEmail.trim()) return;

    try {
      setInviteLoading(true);
      const res = await workspaceService.inviteMember(activeWorkspaceId, {
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      setInviteResult(res);
      setInviteCopied(false);
      setMessage({ type: 'success', text: `Invitation generated for ${inviteEmail.trim()}` });
      // Refresh invitations list
      const updatedInvites = await workspaceService.listInvitations(activeWorkspaceId).catch(() => []);
      setInvitations(updatedInvites);
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Failed to invite member.' });
    } finally {
      setInviteLoading(false);
    }
  };

  const handleAcceptInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!acceptToken.trim()) return;

    try {
      setAcceptLoading(true);
      const res = await workspaceService.acceptInvitation(acceptToken.trim());
      setMessage({ type: 'success', text: `Successfully joined "${res.workspace.name}" as ${res.member.role}!` });
      setShowAcceptModal(false);
      setAcceptToken('');
      await loadWorkspaces();
      setActiveWorkspaceId(res.workspace.id);
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Invalid or expired invitation token.' });
    } finally {
      setAcceptLoading(false);
    }
  };

  const handleUpdateRole = async (memberId: string, newRole: WorkspaceRole) => {
    if (!activeWorkspaceId) return;
    try {
      await workspaceService.updateMemberRole(activeWorkspaceId, memberId, newRole);
      setMessage({ type: 'success', text: `Updated member role to ${newRole}.` });
      await loadWorkspaceDetails(activeWorkspaceId);
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Failed to update member role.' });
    }
  };

  const handleRemoveMember = async (memberId: string, isSelf: boolean) => {
    if (!activeWorkspaceId) return;
    const confirmText = isSelf
      ? 'Are you sure you want to leave this workspace?'
      : 'Are you sure you want to remove this member?';
    if (!window.confirm(confirmText)) return;

    try {
      await workspaceService.removeMember(activeWorkspaceId, memberId);
      setMessage({ type: 'success', text: isSelf ? 'You have left the workspace.' : 'Member removed.' });
      if (isSelf) {
        await loadWorkspaces();
      } else {
        await loadWorkspaceDetails(activeWorkspaceId);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Failed to remove member.' });
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!activeWorkspaceId) return;
    try {
      await workspaceService.revokeInvitation(activeWorkspaceId, inviteId);
      setMessage({ type: 'success', text: 'Invitation revoked.' });
      const updatedInvites = await workspaceService.listInvitations(activeWorkspaceId).catch(() => []);
      setInvitations(updatedInvites);
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Failed to revoke invitation.' });
    }
  };

  const handleDeleteWorkspace = async () => {
    if (!activeWorkspaceId || !activeWorkspace) return;
    if (activeWorkspace.workspace.is_personal) {
      alert('Personal workspace cannot be deleted.');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete "${activeWorkspace.workspace.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await workspaceService.deleteWorkspace(activeWorkspaceId);
      setMessage({ type: 'success', text: 'Workspace deleted.' });
      await loadWorkspaces();
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Failed to delete workspace.' });
    }
  };

  const copyInviteToClipboard = (token: string) => {
    navigator.clipboard.writeText(token);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 3000);
  };

  const userRole = activeWorkspace?.current_user_role;
  const isOwnerOrAdmin = userRole === 'OWNER' || userRole === 'ADMIN';

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Page Title & Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl flex items-center gap-2">
            <Building2 className="size-7 text-forest" />
            Workspaces & Team Permissions
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Collaborate with editors, admins, and reviewers with role-based access control and tenant isolation.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAcceptModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3.5 py-2 text-sm font-medium text-foreground hover:bg-cream transition-colors shadow-2xs"
          >
            <KeyRound className="size-4 text-forest" />
            Join with Token
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-forest px-4 py-2 text-sm font-medium text-white hover:bg-forest/90 transition-colors shadow-2xs"
          >
            <Plus className="size-4" />
            Create Workspace
          </button>
        </div>
      </div>

      {/* Global Toast Message */}
      {message && (
        <div
          className={`mt-4 flex items-center justify-between rounded-lg p-3 text-sm border ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="font-bold ml-2">×</button>
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-800 border border-rose-200">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Workspace Switcher Carousel / Row */}
      <div className="mt-6 border-b border-border pb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Your Workspaces
          </label>
          <button
            onClick={() => {
              loadWorkspaces();
              if (activeWorkspaceId) loadWorkspaceDetails(activeWorkspaceId);
            }}
            disabled={loading || contentLoading}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title="Refresh workspaces"
          >
            <RefreshCw className={`size-3.5 ${loading || contentLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {workspaces.map((ws) => {
            const isActive = ws.id === activeWorkspaceId;
            return (
              <button
                key={ws.id}
                onClick={() => setActiveWorkspaceId(ws.id)}
                className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-all ${
                  isActive
                    ? 'border-forest bg-forest/5 text-forest shadow-2xs ring-1 ring-forest'
                    : 'border-border bg-white text-muted-foreground hover:bg-cream hover:text-foreground'
                }`}
              >
                <span className="font-medium">{ws.name}</span>
                {ws.is_personal && (
                  <span className="rounded bg-zinc-200/80 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600">
                    Personal
                  </span>
                )}
                <span
                  className={`rounded-full px-2 py-0.2 text-[10px] font-semibold border ${
                    ROLE_BADGES[ws.role || 'VIEWER'].tone
                  }`}
                >
                  {ws.role || 'VIEWER'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Workspace Header & Details */}
      {activeWorkspace && (
        <div className="mt-6">
          <div className="rounded-xl border border-border bg-white p-5 shadow-2xs">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-foreground">
                    {activeWorkspace.workspace.name}
                  </h2>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                      ROLE_BADGES[activeWorkspace.current_user_role].tone
                    }`}
                  >
                    {ROLE_BADGES[activeWorkspace.current_user_role].label}
                  </span>
                  {activeWorkspace.workspace.is_personal && (
                    <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                      Default Personal
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Workspace ID: <code className="font-mono text-zinc-600">{activeWorkspace.workspace.id}</code> • {activeWorkspace.member_count} member{activeWorkspace.member_count === 1 ? '' : 's'}
                </p>
              </div>

              {isOwnerOrAdmin && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setInviteEmail('');
                      setInviteResult(null);
                      setShowInviteModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-forest px-3.5 py-2 text-sm font-medium text-white hover:bg-forest/90 transition-colors shadow-2xs"
                  >
                    <UserPlus className="size-4" />
                    Invite Member
                  </button>
                </div>
              )}
            </div>

            {/* Navigation Tabs */}
            <div className="mt-6 flex border-b border-border">
              <button
                onClick={() => setActiveTab('members')}
                className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'members'
                    ? 'border-forest text-forest font-semibold'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Members ({members.length})
              </button>
              {isOwnerOrAdmin && (
                <button
                  onClick={() => setActiveTab('invitations')}
                  className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === 'invitations'
                      ? 'border-forest text-forest font-semibold'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Pending Invitations ({invitations.length})
                </button>
              )}
              {isOwnerOrAdmin && (
                <button
                  onClick={() => setActiveTab('settings')}
                  className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === 'settings'
                      ? 'border-forest text-forest font-semibold'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Settings & Permissions
                </button>
              )}
            </div>

            {/* Content Tab: Members */}
            {activeTab === 'members' && (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground border-y border-border">
                    <tr>
                      <th className="px-4 py-3">Member</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Joined Date</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {members.map((member) => {
                      const isCurrentUser = member.user_id === activeWorkspace.workspace.owner_id && member.role === 'OWNER';
                      const badge = ROLE_BADGES[member.role] || ROLE_BADGES.VIEWER;

                      return (
                        <tr key={member.id} className="hover:bg-cream/20 transition-colors">
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="flex size-8 items-center justify-center rounded-full bg-forest/10 font-bold text-forest text-xs">
                                {(member.user_email || member.user_name || 'U')[0].toUpperCase()}
                              </div>
                              <div>
                                <div className="font-medium text-foreground flex items-center gap-1.5">
                                  <span>{member.user_name || member.user_email || 'Workspace Member'}</span>
                                  {isCurrentUser && (
                                    <span className="rounded bg-zinc-100 px-1.5 py-0.2 text-[10px] font-semibold text-zinc-600">
                                      Owner
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {member.user_email || member.user_id}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3.5">
                            {isOwnerOrAdmin && member.role !== 'OWNER' ? (
                              <select
                                value={member.role}
                                onChange={(e) => handleUpdateRole(member.id, e.target.value as WorkspaceRole)}
                                className="rounded border border-border bg-white px-2 py-1 text-xs font-medium text-foreground shadow-2xs focus:border-forest focus:outline-hidden"
                              >
                                {userRole === 'OWNER' && <option value="ADMIN">ADMIN</option>}
                                <option value="EDITOR">EDITOR</option>
                                <option value="VIEWER">VIEWER</option>
                              </select>
                            ) : (
                              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold border ${badge.tone}`}>
                                {badge.label}
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3.5 text-xs text-muted-foreground">
                            {new Date(member.joined_at).toLocaleDateString()}
                          </td>

                          <td className="px-4 py-3.5 text-right">
                            {/* Member actions */}
                            {member.role !== 'OWNER' && isOwnerOrAdmin && (
                              <button
                                onClick={() => handleRemoveMember(member.id, false)}
                                className="rounded p-1 text-rose-600 hover:bg-rose-50 transition-colors"
                                title="Remove member"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Content Tab: Invitations */}
            {activeTab === 'invitations' && isOwnerOrAdmin && (
              <div className="mt-5">
                {invitations.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No pending invitations for this workspace.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground border-y border-border">
                        <tr>
                          <th className="px-4 py-3">Invitee Email</th>
                          <th className="px-4 py-3">Invited Role</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Expires At</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {invitations.map((invite) => (
                          <tr key={invite.id} className="hover:bg-cream/20">
                            <td className="px-4 py-3 font-medium text-foreground">
                              {invite.invitee_email}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold border ${ROLE_BADGES[invite.role].tone}`}>
                                {invite.role}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 border border-amber-200">
                                {invite.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">
                              {new Date(invite.expires_at).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => handleRevokeInvite(invite.id)}
                                className="text-xs text-rose-600 hover:underline font-medium"
                              >
                                Revoke
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Content Tab: Settings */}
            {activeTab === 'settings' && isOwnerOrAdmin && (
              <div className="mt-5 max-w-xl space-y-6">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Role Permissions Guide</h3>
                  <div className="mt-3 space-y-2">
                    {(Object.keys(ROLE_BADGES) as WorkspaceRole[]).map((role) => (
                      <div key={role} className="flex items-start gap-3 rounded-lg border border-border p-3 bg-cream/30">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold border shrink-0 ${ROLE_BADGES[role].tone}`}>
                          {ROLE_BADGES[role].label}
                        </span>
                        <p className="text-xs text-muted-foreground">{ROLE_BADGES[role].desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {userRole === 'OWNER' && !activeWorkspace.workspace.is_personal && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-4">
                    <h4 className="text-sm font-semibold text-rose-900">Danger Zone</h4>
                    <p className="mt-1 text-xs text-rose-700">
                      Permanently delete this workspace and all associated member links. This action cannot be undone.
                    </p>
                    <button
                      onClick={handleDeleteWorkspace}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-700 transition-colors"
                    >
                      <Trash2 className="size-3.5" />
                      Delete Workspace
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Create Workspace */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl border border-border">
            <h3 className="text-lg font-bold text-foreground">Create New Workspace</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Create a shared workspace to collaborate with your team on video content and campaigns.
            </p>

            <form onSubmit={handleCreateWorkspace} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Workspace Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Media Agency Alpha"
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-forest focus:outline-hidden"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-cream"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-white hover:bg-forest/90 disabled:opacity-50"
                >
                  {createLoading ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Invite Member */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl border border-border">
            <h3 className="text-lg font-bold text-foreground">Invite Workspace Member</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Generate a cryptographically secure, single-use invitation token for team collaboration.
            </p>

            {!inviteResult ? (
              <form onSubmit={handleInviteMember} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Member Email Address
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="colleague@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-forest focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Assign Role
                  </label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as WorkspaceRole)}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-forest focus:outline-hidden"
                  >
                    {userRole === 'OWNER' && <option value="ADMIN">ADMIN — Full management except ownership</option>}
                    <option value="EDITOR">EDITOR — Create and manage content</option>
                    <option value="VIEWER">VIEWER — Read-only review</option>
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-cream"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={inviteLoading}
                    className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-white hover:bg-forest/90 disabled:opacity-50"
                  >
                    {inviteLoading ? 'Generating...' : 'Generate Invitation'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800">
                  <div className="font-semibold mb-1">Invitation Token Generated!</div>
                  Share this single-use secret key with <span className="font-bold">{inviteResult.invitation.invitee_email}</span>. It expires in 7 days.
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Raw Secret Token
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={inviteResult.invitation_token}
                      className="w-full rounded-lg border border-border bg-cream/40 px-3 py-2 font-mono text-xs text-foreground select-all"
                    />
                    <button
                      onClick={() => copyInviteToClipboard(inviteResult.invitation_token)}
                      className="flex items-center gap-1 rounded-lg border border-border bg-white px-3 py-2 text-xs font-medium text-foreground hover:bg-cream"
                    >
                      {inviteCopied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
                      {inviteCopied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => setShowInviteModal(false)}
                    className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-white hover:bg-forest/90"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Accept Invitation */}
      {showAcceptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl border border-border">
            <h3 className="text-lg font-bold text-foreground">Join a Workspace</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Paste the single-use invitation token provided by your workspace admin.
            </p>

            <form onSubmit={handleAcceptInvite} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Invitation Token
                </label>
                <input
                  type="text"
                  required
                  placeholder="Paste 64-character token..."
                  value={acceptToken}
                  onChange={(e) => setAcceptToken(e.target.value)}
                  className="w-full font-mono text-xs rounded-lg border border-border px-3 py-2 focus:border-forest focus:outline-hidden"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAcceptModal(false)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-cream"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={acceptLoading}
                  className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-white hover:bg-forest/90 disabled:opacity-50"
                >
                  {acceptLoading ? 'Verifying...' : 'Join Workspace'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkspacePage;

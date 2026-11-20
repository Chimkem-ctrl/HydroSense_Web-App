import { useState } from 'react';
import { Check, ChevronLeft, ChevronRight, FileDown, Search, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatManilaDateTime, getManilaDateString, hatcheryId, toCsv } from '@hydrosense/shared';
import type { DashboardUser, Role } from '@hydrosense/shared';
import { api } from '../app/api';
import { DATA_MODE, ROLE_LABELS, tierConfig } from '../app/config';
import { useAuth, useRole } from '../app/auth/RoleContext';
import { usePendingRequests, useProfileSite } from '../app/data/hooks';
import { useSelectedTank } from '../app/tank/TankContext';
import { authService, hatcheryLabel } from '../services/authService';
import { downloadCsv } from '../services/downloadCsv';
import type { AuditLog } from '@hydrosense/shared';
import { PageHeading } from '../components/common/PageHeading';
import { Select } from '../components/common/Select';
import { EmptyState, ErrorState, LoadingState, StaleQueryState } from '../components/common/States';
import '../styles/admin-users.css';

function PhoneCell({ phone }: { phone?: string }) {
  return phone?.trim() || '—';
}

type UserConfirmation =
  | { action: 'approve'; userId: string; name: string; role: Role }
  | { action: 'reject' | 'remove'; userId: string; name: string };

export function AdminUsersPage() {
  const { role } = useRole();
  const currentUser = useAuth();
  const isManager = role === 'manager';
  const { hatchery: selectedHatchery } = useSelectedTank();
  const site = useProfileSite();
  const hatchery = site.data?.trim() ? hatcheryLabel(site.data) : undefined;
  const queryClient = useQueryClient();
  const users = useQuery({
    queryKey: ['admin-users', currentUser?.id, role],
    queryFn: async () => {
      const apiUsers = await api.listUsers();
      if (DATA_MODE === 'api') return apiUsers;
      const accountUsers: DashboardUser[] = (isManager ? [] : await authService.listApprovedUsers()).map((user) => ({
        id: user.id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        site: hatcheryLabel(user.hatcheryId),
        active: true,
        lastActive: user.createdAt,
        employeeId: user.employeeId,
        phone: user.phone,
        position: user.position,
        address: user.address,
        emergencyContactName: user.emergencyContactName,
        emergencyContactPhone: user.emergencyContactPhone,
      }));
      const accountEmails = new Set(accountUsers.map((user) => user.email.toLowerCase()));
      return [...apiUsers.filter((user) => !accountEmails.has(user.email.toLowerCase())), ...accountUsers];
    },
    enabled: tierConfig.teamAccounts && (!isManager || Boolean(hatchery)),
  });
  const pendingRequests = usePendingRequests();
  const [requestSearch, setRequestSearch] = useState('');
  const [teamSearch, setTeamSearch] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<Record<string, Role | undefined>>({});
  const [confirmation, setConfirmation] = useState<UserConfirmation | null>(null);
  const approveRequest = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: Role }) => authService.approveRequest(userId, role),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['pending-requests'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });
  const rejectRequest = useMutation({
    mutationFn: async (userId: string) => authService.rejectRequest(userId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['pending-requests'] });
    },
  });
  const removeAccount = useMutation({
    mutationFn: async (userId: string) => authService.removeAccount(userId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      await queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
  function confirmUserAction() {
    if (!confirmation) return;
    const current = confirmation;
    setConfirmation(null);
    if (current.action === 'approve') approveRequest.mutate({ userId: current.userId, role: current.role });
    else if (current.action === 'reject') rejectRequest.mutate(current.userId);
    else removeAccount.mutate(current.userId);
  }
  // The backend must enforce hatchery scope; these filters only limit the display.
  const inSelectedHatchery = (value?: string | null) => selectedHatchery === 'all' || Boolean(value && selectedHatchery && hatcheryId(value) === selectedHatchery);
  const visibleRequests = (pendingRequests.data ?? []).filter((request) => inSelectedHatchery(request.hatcheryId));
  const visibleUsers = (users.data ?? []).filter((user) => user.role !== 'admin' && inSelectedHatchery(user.site));
  const visibleAdminUsers = (users.data ?? []).filter((user) => !isManager && user.role === 'admin' && inSelectedHatchery(user.site));
  const matchesSearch = (query: string, values: Array<string | undefined>) => {
    const needle = query.trim().toLowerCase();
    return !needle || values.some((value) => value?.toLowerCase().includes(needle));
  };
  const filteredRequests = visibleRequests.filter((request) => matchesSearch(requestSearch, [request.firstName, request.lastName, ` ${request.lastName}`, request.email, request.phone, request.requestedRole ? ROLE_LABELS[request.requestedRole] : '', formatManilaDateTime(request.createdAt), hatcheryLabel(request.hatcheryId)]));
  const groupedRequests = new Map<string, typeof visibleRequests>();
  for (const request of visibleRequests) {
    const name = hatcheryLabel(request.hatcheryId);
    groupedRequests.set(name, [...(groupedRequests.get(name) ?? []), request]);
  }
  const groupedUsers = new Map<string, DashboardUser[]>();
  for (const user of visibleUsers) {
    const name = hatcheryLabel(user.site);
    groupedUsers.set(name, [...(groupedUsers.get(name) ?? []), user]);
  }
  const confirmationDetails = confirmation && {
    title: confirmation.action === 'approve' ? 'Approve account request?' : confirmation.action === 'reject' ? 'Reject account request?' : 'Remove account?',
    message: confirmation.action === 'approve'
      ? `Approve ${confirmation.name} as ${ROLE_LABELS[confirmation.role]}?`
      : confirmation.action === 'reject'
        ? `Are you sure you want to reject "${confirmation.name}"?`
        : `Are you sure you want to remove "${confirmation.name}"?`,
    buttonLabel: confirmation.action === 'approve' ? 'Approve request' : confirmation.action === 'reject' ? 'Reject request' : 'Remove account',
  };
  const confirmationBusy = confirmation?.action === 'approve' ? approveRequest.isPending
    : confirmation?.action === 'reject' ? rejectRequest.isPending
      : confirmation?.action === 'remove' ? removeAccount.isPending : false;
  return (
    <div className="stack admin-users-page">
      <PageHeading title="Users & Roles" description={isManager ? 'Review operator accounts for your hatchery.' : 'Review account requests and view accounts by hatchery.'} />
      {isManager && site.isLoading ? <LoadingState label="Loading hatchery assignment" /> : isManager && site.isError ? <ErrorState error={site.error} onRetry={() => void site.refetch()} /> : isManager && !hatchery ? <EmptyState>No hatchery is assigned to your account. Contact an administrator.</EmptyState> : <>
      <StaleQueryState updatedAt={users.dataUpdatedAt} />
      {!isManager && <section className="card admin-users-panel" aria-labelledby="pending-requests-title">
        <div className="admin-users-heading">
          <div><h2 id="pending-requests-title">Pending requests</h2><p>Review new account requests and assign a role.</p></div>
          <div className="admin-users-heading-tools">
            {visibleRequests.length > 0 && <label className="admin-users-search"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Search pending requests" placeholder="Search name, email, phone, role, date or hatchery" value={requestSearch} onChange={(event) => setRequestSearch(event.target.value)} /></label>}
            {!pendingRequests.isLoading && !pendingRequests.isError && pendingRequests.data && <span className="admin-users-count admin-users-count--pending">{visibleRequests.length} pending</span>}
          </div>
        </div>
        {pendingRequests.isLoading ? <LoadingState /> : pendingRequests.isError ? <ErrorState error={pendingRequests.error} onRetry={() => void pendingRequests.refetch()} /> : !visibleRequests.length ? <EmptyState>No account requests are awaiting review.</EmptyState> : (
          <>
          <div role="region" aria-label="Pending requests table">
          {[...groupedRequests].map(([name, allRequests]) => { const requests = allRequests.filter((request) => filteredRequests.includes(request)); return <section className="admin-users-site" key={name}>
          {selectedHatchery === 'all' && <h3>{name}</h3>}
          <div className="table-wrap" role="region" aria-label={`${name} pending requests`} tabIndex={0}><table className="admin-users-table admin-requests-table"><thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Phone</th><th scope="col">Requested role</th><th scope="col">Date</th><th scope="col">Status</th><th scope="col">Review Role</th><th scope="col">Action</th></tr></thead><tbody>
            {!requests.length && <tr><td className="admin-users-search-empty" colSpan={8} role="status">No pending requests match your search.</td></tr>}
            {requests.map((request) => (
              <tr key={request.id}>
                <td>{request.firstName} {request.lastName}</td>
                <td>{request.email}</td>
                <td><PhoneCell phone={request.phone} /></td>
                <td>{request.requestedRole ? ROLE_LABELS[request.requestedRole] : '—'}</td>
                <td>{formatManilaDateTime(request.createdAt)} PHT</td>
                <td><span className="admin-users-status">Pending</span></td>
                <td><label className="field"><span className="sr-only">Review role for {request.firstName} {request.lastName}</span>
                  <Select value={selectedRoles[request.id] ?? request.requestedRole ?? ''} onChange={(event) => {
                    const nextRole = event.target.value;
                    if (nextRole === 'admin' || nextRole === 'operator' || nextRole === 'manager') setSelectedRoles((roles) => ({ ...roles, [request.id]: nextRole }));
                    else setSelectedRoles((roles) => ({ ...roles, [request.id]: undefined }));
                  }}>
                    <option value="">Select role</option><option value="admin">Admin</option><option value="manager">Manager</option><option value="operator">Operator</option>
                  </Select>
                </label></td>
                <td><div className="admin-request-action-buttons">
                  <button type="button" className="admin-request-icon-button admin-request-icon-button--approve" aria-label={`Approve ${request.firstName} ${request.lastName}`} title="Approve request"
                    disabled={approveRequest.isPending || rejectRequest.isPending || !(selectedRoles[request.id] ?? request.requestedRole)}
                    onClick={() => {
                      const reviewRole = selectedRoles[request.id] ?? request.requestedRole;
                      if (reviewRole) setConfirmation({ action: 'approve', userId: request.id, name: `${request.firstName} ${request.lastName}`, role: reviewRole });
                    }}><Check size={18} aria-hidden="true" /></button>
                  <button type="button" className="admin-request-icon-button admin-request-icon-button--reject" aria-label={`Reject ${request.firstName} ${request.lastName}`} title="Reject request"
                    disabled={approveRequest.isPending || rejectRequest.isPending}
                    onClick={() => setConfirmation({ action: 'reject', userId: request.id, name: `${request.firstName} ${request.lastName}` })}><X size={18} aria-hidden="true" /></button>
                </div></td>
              </tr>
            ))}
          </tbody></table></div></section>; })}</div></>
        )}
        {approveRequest.isError && <ErrorState error={approveRequest.error} />}
        {rejectRequest.isError && <ErrorState error={rejectRequest.error} />}
      </section>}
      {!isManager && <section className="card admin-users-panel" aria-labelledby="admin-accounts-title">
        <div className="admin-users-heading">
          <div><h2 id="admin-accounts-title">Admin accounts</h2><p>Administrator accounts with system-wide access.</p></div>
          {tierConfig.teamAccounts && !users.isLoading && !users.isError && <span className="admin-users-count admin-users-count--accounts">{visibleAdminUsers.length} {visibleAdminUsers.length === 1 ? 'account' : 'accounts'}</span>}
        </div>
        {!tierConfig.teamAccounts ? null : users.isLoading ? <LoadingState /> : users.isError ? <ErrorState error={users.error} onRetry={() => void users.refetch()} /> : !visibleAdminUsers.length ? <EmptyState>No administrator accounts are registered.</EmptyState> :
          <div className="table-wrap" role="region" aria-label="Admin accounts table"><table className="admin-users-table"><thead><tr><th scope="col">Name</th><th scope="col">ID</th><th scope="col">Email</th><th scope="col">Phone number</th><th scope="col">Role</th><th scope="col">Hatchery / site</th><th scope="col">Last active</th></tr></thead><tbody>
            {visibleAdminUsers.map((user) => <tr key={user.id}><td>{user.name}</td><td>{user.employeeId || '—'}</td><td>{user.email}</td><td><PhoneCell phone={user.phone} /></td><td>{ROLE_LABELS[user.role]}</td><td>{hatcheryLabel(user.site)}</td><td>{formatManilaDateTime(user.lastActive)} PHT</td></tr>)}
          </tbody></table></div>}
      </section>}
      <section className="card admin-users-panel" aria-labelledby="team-accounts-title">
        <div className="admin-users-heading">
          <div><h2 id="team-accounts-title">Team accounts</h2><p>{selectedHatchery === 'all' ? 'View team members grouped by hatchery.' : 'View team members for the selected hatchery.'}</p></div>
          <div className="admin-users-heading-tools">
            {visibleUsers.length > 0 && <label className="admin-users-search"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Search team accounts" placeholder="Search name, ID, email, role or date" value={teamSearch} onChange={(event) => setTeamSearch(event.target.value)} /></label>}
            {tierConfig.teamAccounts && !users.isLoading && !users.isError && users.data && <span className="admin-users-count admin-users-count--accounts">{visibleUsers.length} {visibleUsers.length === 1 ? 'account' : 'accounts'}</span>}
          </div>
        </div>
        {!tierConfig.teamAccounts ? <p className="muted">Team account management is available on premium and enterprise tiers.</p> : users.isLoading ? <LoadingState /> : users.isError ? <ErrorState error={users.error} onRetry={() => void users.refetch()} /> : !visibleUsers.length ? <EmptyState>No team users are registered.</EmptyState> : (
          <>
          <div role="region" aria-label="Team accounts table">
          {[...groupedUsers].map(([name, allMembers]) => { const members = allMembers.filter((user) => matchesSearch(teamSearch, [user.name, user.email, user.phone, user.employeeId, ROLE_LABELS[user.role], formatManilaDateTime(user.lastActive)])); return <section className="admin-users-site" key={name}>
          {selectedHatchery === 'all' && <h3>{name}</h3>}
          <div className="table-wrap" tabIndex={0} role="region" aria-label={`${name} accounts`}><table className="admin-users-table"><thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Phone</th><th scope="col">Employee ID</th><th scope="col">Role</th><th scope="col">Last active</th>{!isManager && <th scope="col">Actions</th>}</tr></thead><tbody>
            {!members.length && <tr><td className="admin-users-search-empty" colSpan={isManager ? 6 : 7} role="status">No accounts match your search.</td></tr>}
            {members.map((user) => <tr key={user.id}><td>{user.name}</td><td>{user.email}</td><td><PhoneCell phone={user.phone} /></td><td>{user.employeeId || '—'}</td><td><span>{ROLE_LABELS[user.role]}</span></td><td>{formatManilaDateTime(user.lastActive)} PHT</td>{!isManager && <td><button type="button" className="button button-danger" disabled={removeAccount.isPending} onClick={() => setConfirmation({ action: 'remove', userId: user.id, name: user.name })}>Remove account</button></td>}</tr>)}
          </tbody></table></div></section>; })}</div></>
        )}
          {removeAccount.isError && <ErrorState error={removeAccount.error} />}
      </section>
      {confirmation && confirmationDetails && <div className="dialog-backdrop admin-users-confirmation-backdrop" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget && !confirmationBusy) setConfirmation(null);
      }}>
        <section className="dialog card stack admin-users-confirmation" role="dialog" aria-modal="true" aria-labelledby="admin-users-confirmation-title">
          <header className="admin-users-confirmation-heading">
            <h2 id="admin-users-confirmation-title">{confirmationDetails.title}</h2>
            <button type="button" className="icon-button" aria-label="Close confirmation" disabled={confirmationBusy} onClick={() => setConfirmation(null)}><X size={18} /></button>
          </header>
          <p>{confirmationDetails.message}</p>
          <div className="admin-users-confirmation-actions">
            <button type="button" className="button" disabled={confirmationBusy} onClick={() => setConfirmation(null)}>Cancel</button>
            <button type="button" className={`button ${confirmation.action === 'approve' ? 'admin-users-confirm-approve' : 'button-danger'}`} disabled={confirmationBusy} onClick={confirmUserAction}>{confirmationDetails.buttonLabel}</button>
          </div>
        </section>
      </div>}
      </>}
    </div>
  );
}

export function auditLogCsv(logs: AuditLog[]) {
  return toCsv([
    ['Time (PHT)', 'User', 'Action', 'Detail'],
    ...logs.map((log) => [formatManilaDateTime(log.timestamp), log.user, log.action, log.detail]),
  ]);
}

export function AdminLogsPage() {
  const { hatchery } = useSelectedTank();
  const query = useQuery({ queryKey: ['audit-logs'], queryFn: () => api.listAuditLogs() });
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [user, setUser] = useState('');
  const [action, setAction] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const allLogs = query.data ?? [];
  const users = Array.from(new Set(allLogs.map((log) => log.user))).sort();
  const actions = Array.from(new Set(allLogs.map((log) => log.action))).sort();
  const filtered = allLogs.filter((log) => {
    const date = getManilaDateString(new Date(log.timestamp));
    return (!from || date >= from) && (!to || date <= to) && (!user || log.user === user) &&
      (!action || log.action === action) && log.detail.toLowerCase().includes(search.trim().toLowerCase());
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / 25));
  const currentPage = Math.min(page, totalPages);
  function clearFilters() {
    setFrom(''); setTo(''); setUser(''); setAction(''); setSearch(''); setPage(1);
  }
  return (
    <div className="stack">
      <PageHeading title="Audit & System Logs" description="Review admin actions and operational events." />
      <StaleQueryState updatedAt={query.dataUpdatedAt} />
      {hatchery !== 'all' ? <EmptyState>Audit and system logs cannot be filtered by hatchery because their records do not include a hatchery. Select All hatcheries to view them.</EmptyState> : query.isLoading ? <LoadingState /> : query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : !query.data?.length ? <EmptyState>No audit or system logs are available.</EmptyState> : (
        <section className="card stack">
          <div className="form-grid">
            <label className="field">From date (Manila)<input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></label>
            <label className="field">To date (Manila)<input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></label>
            <label className="field">User<Select value={user} clearable placeholder="User" onChange={(event) => { setUser(event.target.value); setPage(1); }}>{users.map((value) => <option key={value} value={value}>{value}</option>)}</Select></label>
            <label className="field">Action<Select value={action} clearable placeholder="Action" onChange={(event) => { setAction(event.target.value); setPage(1); }}>{actions.map((value) => <option key={value} value={value}>{value}</option>)}</Select></label>
            <label className="field">Search detail<input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
          </div>
          <div className="inline"><button className="button" type="button" onClick={clearFilters}>Clear filters</button><button className="button" type="button" disabled={!filtered.length} onClick={() => downloadCsv(auditLogCsv(filtered), 'hydrosense-audit-logs.csv')}><FileDown size={18} aria-hidden="true" />Export CSV</button></div>
          <p className="small muted">{filtered.length} {filtered.length === 1 ? 'result' : 'results'}</p>
          {!filtered.length ? <EmptyState>No audit or system logs match the filters.</EmptyState> : <><div className="table-wrap"><table><thead><tr><th scope="col">Time (PHT)</th><th scope="col">User</th><th scope="col">Action</th><th scope="col">Detail</th></tr></thead><tbody>{filtered.slice((currentPage - 1) * 25, currentPage * 25).map((log) => <tr key={log.id}><td>{formatManilaDateTime(log.timestamp)}</td><td>{log.user}</td><td>{log.action}</td><td>{log.detail}</td></tr>)}</tbody></table></div>
            <nav className="log-pagination" aria-label="Audit log pages"><button type="button" aria-label="Previous" title="Previous page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={18} aria-hidden="true" /></button><span aria-current="page">Page {currentPage} of {totalPages}</span><button type="button" aria-label="Next" title="Next page" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={18} aria-hidden="true" /></button></nav></>}
        </section>
      )}
    </div>
  );
}

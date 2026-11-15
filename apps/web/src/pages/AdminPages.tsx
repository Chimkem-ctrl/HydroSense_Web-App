import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatManilaDateTime, getManilaDateString, toCsv } from '@hydrosense/shared';
import type { DashboardUser, Role } from '@hydrosense/shared';
import { api } from '../app/api';
import { ROLE_LABELS, tierConfig } from '../app/config';
import { useAuth, useRole } from '../app/auth/RoleContext';
import { usePendingRequests } from '../app/data/hooks';
import { authService, SUBSCRIBED_HATCHERIES } from '../services/authService';
import { isValidForSms } from '../services/phone';
import { downloadCsv } from '../services/downloadCsv';
import type { AuditLog } from '@hydrosense/shared';
import { PageHeading } from '../components/common/PageHeading';
import { EmptyState, ErrorState, LoadingState, StaleQueryState } from '../components/common/States';
import '../styles/admin-users.css';

function PhoneCell({ phone }: { phone?: string }) {
  return phone?.trim() ? <>{phone} <span className="admin-users-count">{isValidForSms(phone) ? 'Valid for SMS' : 'Not valid for SMS'}</span></> : <>—</>;
}

export function AdminUsersPage() {
  const { userName, role } = useRole();
  const currentUser = useAuth();
  const isManager = role === 'manager';
  const hatchery = SUBSCRIBED_HATCHERIES.find((item) => item.id === currentUser?.hatcheryId);
  const queryClient = useQueryClient();
  const users = useQuery({
    queryKey: ['admin-users', currentUser?.id, role],
    queryFn: async () => {
      const apiUsers = await api.listUsers();
      const accountUsers: DashboardUser[] = (await authService.listApprovedUsers()).map((user) => ({
        id: user.id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        site: user.hatcheryId
          ? SUBSCRIBED_HATCHERIES.find((hatchery) => hatchery.id === user.hatcheryId)?.name ?? user.hatcheryId
          : 'HydroSense',
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
  const pendingRequests = usePendingRequests(isManager && Boolean(hatchery));
  const [selectedRoles, setSelectedRoles] = useState<Record<string, Role | undefined>>({});
  const mutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: Exclude<Role, 'admin'> }) => {
      if (userId.startsWith('account-')) {
        return authService.updateApprovedUserRole(userId, role);
      }
      return api.updateUserRole(userId, role, userName);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      await queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
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
  // The backend must enforce hatchery scope; these filters only limit the display.
  const visibleRequests = (pendingRequests.data ?? []).filter((request) => !isManager || Boolean(hatchery && request.hatcheryId === hatchery.id));
  const visibleUsers = (users.data ?? []).filter((user) => !isManager || Boolean(hatchery && user.site === hatchery.name && user.role !== 'admin'));
  return (
    <div className="stack admin-users-page">
      <PageHeading title="Users & roles" description={isManager ? 'Review operator accounts for your hatchery.' : `Manage team accounts · node limit ${tierConfig.nodeLimit}.`} />
      {isManager && hatchery && <h2 className="card-title">{hatchery.name}</h2>}
      {isManager && !hatchery ? <EmptyState>No hatchery is assigned to your account. Contact an administrator.</EmptyState> : <>
      <StaleQueryState updatedAt={users.dataUpdatedAt} />
      <section className="card admin-users-panel" aria-labelledby="pending-requests-title">
        <div className="admin-users-heading">
          <div><h2 id="pending-requests-title">Pending requests</h2><p>Review new account requests and assign a role.</p></div>
          {!pendingRequests.isLoading && !pendingRequests.isError && pendingRequests.data && <span className="admin-users-count">{visibleRequests.length} pending</span>}
        </div>
        {pendingRequests.isLoading ? <LoadingState /> : pendingRequests.isError ? <ErrorState error={pendingRequests.error} onRetry={() => void pendingRequests.refetch()} /> : !visibleRequests.length ? <EmptyState>No account requests are awaiting review.</EmptyState> : (
          <><p className="admin-users-scroll-hint">Scroll horizontally to see all request details and actions.</p>
          <div className="table-wrap" role="region" aria-label="Pending requests table" tabIndex={0}><table className="admin-users-table"><thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Phone</th><th scope="col">Employee ID</th><th scope="col">Hatchery</th><th scope="col">Requested role</th><th scope="col">Date</th><th scope="col">Review</th></tr></thead><tbody>
            {visibleRequests.map((request) => (
              <tr key={request.id}>
                <td>{request.firstName} {request.lastName}</td>
                <td>{request.email}</td>
                <td><PhoneCell phone={request.phone} /></td>
                <td>{request.employeeId ?? '—'}</td>
                <td>{SUBSCRIBED_HATCHERIES.find((hatchery) => hatchery.id === request.hatcheryId)?.name ?? '—'}</td>
                <td>{request.requestedRole ? ROLE_LABELS[request.requestedRole] : '—'}</td>
                <td>{formatManilaDateTime(request.createdAt)} PHT</td>
                <td>
                  <div className="admin-review-actions">
                    {isManager ? <><span>Operator</span><span><button type="button" className="button button-primary" disabled>Approve</button> <small>Coming soon</small></span><span><button type="button" className="button" disabled>Reject</button> <small>Coming soon</small></span><p className="small muted">Manager approvals are not connected yet.</p></> : <><label className="field"><span className="sr-only">Approval role for {request.firstName} {request.lastName}</span>
                      <select value={selectedRoles[request.id] ?? ''} onChange={(event) => setSelectedRoles((roles) => ({ ...roles, [request.id]: (event.target.value || undefined) as Role | undefined }))}>
                        <option value="">Select role</option><option value="operator">Operator</option><option value="manager">Manager</option>
                      </select>
                    </label>
                    <button type="button" className="button button-primary" disabled={approveRequest.isPending || rejectRequest.isPending || !selectedRoles[request.id]} onClick={() => { const role = selectedRoles[request.id]; if (role) approveRequest.mutate({ userId: request.id, role }); }}>Approve</button>
                    <button type="button" className="button" disabled={approveRequest.isPending || rejectRequest.isPending} onClick={() => {
                      if (window.confirm(`Reject the account request for ${request.firstName} ${request.lastName}?`)) rejectRequest.mutate(request.id);
                    }}>Reject</button></>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody></table></div></>
        )}
        {approveRequest.isError && <ErrorState error={approveRequest.error} />}
        {rejectRequest.isError && <ErrorState error={rejectRequest.error} />}
      </section>
      <section className="card admin-users-panel" aria-labelledby="team-accounts-title">
        <div className="admin-users-heading">
          <div><h2 id="team-accounts-title">Team accounts</h2><p>View team members and manage their roles.</p></div>
          {tierConfig.teamAccounts && !users.isLoading && !users.isError && users.data && <span className="admin-users-count">{visibleUsers.length} {visibleUsers.length === 1 ? 'account' : 'accounts'}</span>}
        </div>
        {!tierConfig.teamAccounts ? <p className="muted">Team account management is available on premium and enterprise tiers.</p> : users.isLoading ? <LoadingState /> : users.isError ? <ErrorState error={users.error} onRetry={() => void users.refetch()} /> : !visibleUsers.length ? <EmptyState>No team users are registered.</EmptyState> : (
          <><p className="admin-users-scroll-hint">Scroll horizontally to see all account details and actions.</p>
          <div className="table-wrap" role="region" aria-label="Team accounts table" tabIndex={0}><table className="admin-users-table"><thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Phone</th><th scope="col">Site</th><th scope="col">Role</th><th scope="col">Last active</th>{!isManager && <th scope="col">Actions</th>}</tr></thead><tbody>
            {visibleUsers.map((user) => <tr key={user.id}><td>{user.name}</td><td>{user.email}</td><td><PhoneCell phone={user.phone} /></td><td>{user.site}</td><td>{user.role === 'admin' || isManager ? <span>{ROLE_LABELS[user.role]}</span> : <label className="field"><span className="sr-only">Role for {user.name}</span><select value={user.role} onChange={(event) => { const next = event.target.value as Exclude<Role, 'admin'>; if (next !== user.role && window.confirm(`Change ${user.name} from ${ROLE_LABELS[user.role]} to ${ROLE_LABELS[next]}?`)) mutation.mutate({ userId: user.id, role: next }); }}><option value="operator">Operator</option><option value="manager">Manager</option></select></label>}</td><td>{formatManilaDateTime(user.lastActive)} PHT</td>{!isManager && <td>{user.role === 'admin' ? '—' : <button type="button" className="button" disabled={removeAccount.isPending} onClick={() => {
              if (window.confirm(`Remove the account for ${user.name}? This cannot be undone.`)) removeAccount.mutate(user.id);
            }}>Remove account</button>}</td>}</tr>)}
          </tbody></table></div></>
        )}
          {mutation.isError && <ErrorState error={mutation.error} />}
          {removeAccount.isError && <ErrorState error={removeAccount.error} />}
      </section>
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
      <PageHeading title="Audit & system logs" description="Review admin actions and operational events (Asia/Manila)." />
      <StaleQueryState updatedAt={query.dataUpdatedAt} />
      {query.isLoading ? <LoadingState /> : query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : !query.data?.length ? <EmptyState>No audit or system logs are available.</EmptyState> : (
        <section className="card stack">
          <div className="form-grid">
            <label className="field">From date (Manila)<input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></label>
            <label className="field">To date (Manila)<input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></label>
            <label className="field">User<select value={user} onChange={(event) => { setUser(event.target.value); setPage(1); }}><option value="">All users</option>{users.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="field">Action<select value={action} onChange={(event) => { setAction(event.target.value); setPage(1); }}><option value="">All actions</option>{actions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="field">Search detail<input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
          </div>
          <div className="inline"><button className="button" type="button" onClick={clearFilters}>Clear filters</button><button className="button" type="button" disabled={!filtered.length} onClick={() => downloadCsv(auditLogCsv(filtered), 'hydrosense-audit-logs.csv')}>Export CSV</button></div>
          <p className="small muted">{filtered.length} {filtered.length === 1 ? 'result' : 'results'}</p>
          {!filtered.length ? <EmptyState>No audit or system logs match the filters.</EmptyState> : <><div className="table-wrap"><table><thead><tr><th scope="col">Time (PHT)</th><th scope="col">User</th><th scope="col">Action</th><th scope="col">Detail</th></tr></thead><tbody>{filtered.slice((currentPage - 1) * 25, currentPage * 25).map((log) => <tr key={log.id}><td>{formatManilaDateTime(log.timestamp)}</td><td>{log.user}</td><td>{log.action}</td><td>{log.detail}</td></tr>)}</tbody></table></div>
            <div className="inline"><button className="button" type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage} of {totalPages}</span><button className="button" type="button" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>Next</button></div></>}
        </section>
      )}
    </div>
  );
}

export function ComingSoonPage({ feature }: { feature: string }) {
  const available = feature.toLowerCase().includes('fleet') ? tierConfig.fleetView : tierConfig.batchTracking;
  return <div className="stack coming-soon-page">
    <PageHeading title={`${feature} · Coming soon`} description={available ? 'This Enterprise feature is planned but not available in the pilot dashboard.' : 'This feature requires the Enterprise tier.'} />
    <section className="card coming-soon-card">
      <h2 className="card-title">Not available yet</h2>
      <p className="muted">No batch or fleet data is displayed until the feature is implemented.</p>
    </section>
  </div>;
}

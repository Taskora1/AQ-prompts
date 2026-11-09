'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

function linkedAdminLabel(authorization) {
  if (!authorization.adminUserId) return 'Unlinked — blocked';
  return `${authorization.adminEmail || `Admin #${authorization.adminUserId}`} (${authorization.adminRole || 'inactive'})`;
}

export default function McpAccessManager({ users = [] }) {
  const eligibleUsers = useMemo(() => users.filter((user) => (
    user.role === 'admin' || user.role === 'super_admin'
  )), [users]);
  const [authorizations, setAuthorizations] = useState([]);
  const [recentSubjects, setRecentSubjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState('');
  const [adminUserId, setAdminUserId] = useState(String(eligibleUsers[0]?.id || ''));
  const [subject, setSubject] = useState('');
  const [busySubject, setBusySubject] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadAuthorizations = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch('/admin/api/mcp/authorizations', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'MCP authorizations could not be loaded.');
      setAuthorizations(result.authorizations || []);
      setRecentSubjects(result.recentSubjects || []);
      const registeredClients = result.clients || [];
      setClients(registeredClients);
      setClientId((current) => (
        registeredClients.some((client) => client.clientId === current)
          ? current
          : registeredClients[0]?.clientId || ''
      ));
    } catch (loadError) {
      setError(loadError.message || 'MCP authorizations could not be loaded.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAuthorizations();
  }, [loadAuthorizations]);

  useEffect(() => {
    if (!eligibleUsers.some((user) => String(user.id) === adminUserId)) {
      setAdminUserId(String(eligibleUsers[0]?.id || ''));
    }
  }, [adminUserId, eligibleUsers]);

  async function linkSubject(event) {
    event.preventDefault();
    setBusySubject(subject);
    setNotice('');
    setError('');
    try {
      const response = await fetch('/admin/api/mcp/authorizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'authorize',
          clientId,
          subject,
          adminUserId: Number(adminUserId),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'MCP access could not be linked.');
      setSubject('');
      setNotice(`Linked OAuth subject to ${result.authorization.adminEmail || 'the selected admin account'}.`);
      await loadAuthorizations();
    } catch (linkError) {
      setError(linkError.message || 'MCP access could not be linked.');
    } finally {
      setBusySubject('');
    }
  }

  async function revokeAuthorization(authorization) {
    const label = authorization.adminEmail || authorization.subject;
    if (!window.confirm(`Revoke MCP access for ${label}?`)) return;

    setBusySubject(authorization.subject);
    setNotice('');
    setError('');
    try {
      const response = await fetch('/admin/api/mcp/authorizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'revoke',
          clientId: authorization.clientId,
          subject: authorization.subject,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'MCP access could not be revoked.');
      setNotice(`Revoked MCP access for ${label}.`);
      await loadAuthorizations();
    } catch (revokeError) {
      setError(revokeError.message || 'MCP access could not be revoked.');
    } finally {
      setBusySubject('');
    }
  }

  return (
    <section className="mt-6 rounded border border-[#c3c4c7] bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">MCP content access</h2>
      <p className="mt-1 text-sm text-[#50575e]">
        Only OAuth subjects explicitly linked here to an existing Admin or Super Admin account can use MCP.
        Use the exact <code>sub</code> from the verified OAuth token; do not enter an email address.
        Select the OAuth client for each grant. New links do not grant publishing or image-upload permissions.
      </p>

      <form onSubmit={linkSubject} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-end">
        <div>
          <label htmlFor="mcp-oauth-client" className="block text-sm font-semibold">OAuth client</label>
          <select
            id="mcp-oauth-client"
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            required
            disabled={clients.length === 0}
            className="mt-2 h-10 w-full rounded border border-[#8c8f94] bg-white px-3 text-sm"
          >
            {clients.map((client) => (
              <option key={client.clientId} value={client.clientId}>
                {client.clientName || 'Claude MCP client'} — {client.clientId}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="mcp-admin-user" className="block text-sm font-semibold">Admin account</label>
          <select
            id="mcp-admin-user"
            value={adminUserId}
            onChange={(event) => setAdminUserId(event.target.value)}
            required
            disabled={eligibleUsers.length === 0}
            className="mt-2 h-10 w-full rounded border border-[#8c8f94] bg-white px-3 text-sm"
          >
            {eligibleUsers.map((user) => (
              <option key={user.id} value={user.id}>{user.email} — {user.role}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="mcp-oauth-subject" className="block text-sm font-semibold">OAuth subject (`sub`)</label>
          <input
            id="mcp-oauth-subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            required
            maxLength={255}
            autoComplete="off"
            placeholder="Exact subject from the verified OAuth token"
            className="mt-2 h-10 w-full rounded border border-[#8c8f94] bg-white px-3 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={!adminUserId || !clientId || !subject.trim() || Boolean(busySubject)}
          className="h-10 rounded bg-[#2271b1] px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busySubject && busySubject === subject ? 'Linking…' : 'Link MCP access'}
        </button>
      </form>
      <p className="mt-2 text-xs text-[#646970]">
        Re-linking an existing subject resets its optional publish, blog-publish, and image-upload permissions to off.
        Existing unlinked grants remain blocked until linked.
      </p>

      <div className="mt-5 rounded border border-[#c3c4c7] bg-[#f6f7f7] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Recent unlinked OAuth sign-ins</h3>
          <button
            type="button"
            onClick={() => void loadAuthorizations()}
            disabled={isLoading}
            className="rounded border border-[#8c8f94] bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
          >
            {isLoading ? 'Refreshing…' : 'Refresh sign-ins'}
          </button>
        </div>
        <p className="mt-1 text-xs text-[#50575e]">
          Verified OAuth subjects seen by AQ in the last 24 hours that do not have active MCP access.
          Select a subject to fill the grant form; no tokens are shown.
        </p>
        {recentSubjects.length > 0 ? (
          <ul className="mt-3 divide-y divide-[#dcdcde]">
            {recentSubjects.map((recent) => (
              <li
                key={`${recent.clientId}:${recent.subject}`}
                className="flex flex-wrap items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="break-all font-mono text-xs">{recent.subject}</p>
                  <p className="mt-1 text-xs text-[#646970]">
                    {clients.find((client) => client.clientId === recent.clientId)?.clientName
                      || recent.clientName
                      || 'OAuth client'} — {recent.clientId}
                    {' · '}
                    {new Date(recent.lastAuthenticatedAt).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setClientId(recent.clientId);
                    setSubject(recent.subject);
                  }}
                  className="shrink-0 rounded border border-[#2271b1] bg-white px-3 py-1.5 text-xs font-semibold text-[#2271b1]"
                >
                  Use this subject
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-[#646970]">
            No recent unlinked sign-ins found. Have the user reconnect Claude, then refresh this list promptly.
          </p>
        )}
      </div>

      {notice ? <p role="status" className="mt-3 text-sm text-green-800">{notice}</p> : null}
      {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}

      <div className="mt-5 hidden overflow-x-auto md:block">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead className="bg-[#f6f7f7]">
            <tr>
              <th className="border-b border-[#c3c4c7] px-3 py-2">OAuth subject</th>
              <th className="border-b border-[#c3c4c7] px-3 py-2">OAuth client</th>
              <th className="border-b border-[#c3c4c7] px-3 py-2">Linked account</th>
              <th className="border-b border-[#c3c4c7] px-3 py-2">State</th>
              <th className="border-b border-[#c3c4c7] px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {authorizations.map((authorization) => (
              <tr key={`${authorization.subject}:${authorization.clientId}`} className="border-b border-[#dcdcde] last:border-0">
                <td className="max-w-[280px] truncate px-3 py-2 font-mono text-xs" title={authorization.subject}>
                  {authorization.subject}
                </td>
                <td className="max-w-[240px] truncate px-3 py-2 font-mono text-xs" title={authorization.clientId}>
                  {clients.find((client) => client.clientId === authorization.clientId)?.clientName || authorization.clientId}
                </td>
                <td className="px-3 py-2">{linkedAdminLabel(authorization)}</td>
                <td className="px-3 py-2">
                  {authorization.revokedAt ? 'Revoked' : authorization.adminUserId ? 'Active' : 'Blocked — link required'}
                </td>
                <td className="px-3 py-2 text-right">
                  {!authorization.revokedAt ? (
                    <button
                      type="button"
                      onClick={() => revokeAuthorization(authorization)}
                      disabled={Boolean(busySubject)}
                      className="rounded border border-red-300 px-2.5 py-1 text-xs font-semibold text-red-700 disabled:opacity-60"
                    >
                      Revoke
                    </button>
                  ) : '—'}
                </td>
              </tr>
            ))}
            {!isLoading && authorizations.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-4 text-center text-[#646970]">No MCP authorizations found.</td></tr>
            ) : null}
          </tbody>
        </table>
        {isLoading ? <p className="py-3 text-sm text-[#646970]">Loading MCP access…</p> : null}
      </div>
      <div className="mt-5 space-y-3 md:hidden">
        {authorizations.map((authorization) => {
          const linked = Boolean(authorization.adminUserId);
          const status = authorization.revokedAt
            ? 'Revoked'
            : linked
              ? 'Active'
              : 'Blocked — link required';

          return (
            <article
              key={`${authorization.subject}:${authorization.clientId}`}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <p className="break-all font-mono text-xs text-slate-700">{authorization.subject}</p>
              <dl className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-xs">
                <div>
                  <dt className="text-slate-500">OAuth client</dt>
                  <dd className="mt-0.5 break-all font-medium text-slate-700">
                    {clients.find((client) => client.clientId === authorization.clientId)?.clientName
                      || authorization.clientId}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Linked account</dt>
                  <dd className="mt-0.5 font-medium text-slate-700">{linkedAdminLabel(authorization)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">State</dt>
                  <dd className="mt-0.5 font-medium text-slate-700">{status}</dd>
                </div>
              </dl>
              {!authorization.revokedAt ? (
                <button
                  type="button"
                  onClick={() => revokeAuthorization(authorization)}
                  disabled={Boolean(busySubject)}
                  className="mt-3 h-10 w-full rounded-lg border border-red-200 text-sm font-semibold text-red-700 disabled:opacity-60"
                >
                  {busySubject === authorization.subject ? 'Revoking…' : 'Revoke access'}
                </button>
              ) : null}
            </article>
          );
        })}
        {!isLoading && authorizations.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-500">
            No MCP authorizations found.
          </p>
        ) : null}
        {isLoading ? <p className="py-3 text-sm text-slate-500">Loading MCP access…</p> : null}
      </div>
    </section>
  );
}

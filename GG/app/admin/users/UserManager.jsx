'use client';

import { useMemo, useState } from 'react';
import McpAccessManager from './McpAccessManager';

function formatTimestamp(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function UserManager({ initialUsers = [], currentUserId }) {
  const [users, setUsers] = useState(initialUsers);
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    role: 'admin',
  });
  const [roleValues, setRoleValues] = useState(
    Object.fromEntries(initialUsers.map((user) => [user.id, user.role])),
  );
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const superAdminCount = useMemo(
    () => users.filter((user) => user.role === 'super_admin').length,
    [users],
  );

  async function createUser(event) {
    event.preventDefault();
    setBusyId('create');
    setMessage('');
    setError('');

    try {
      const response = await fetch('/admin/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The account could not be created.');

      setUsers((current) => [...current, result.user]);
      setRoleValues((current) => ({ ...current, [result.user.id]: result.user.role }));
      setNewUser({ email: '', password: '', role: 'admin' });
      setMessage(`Created ${result.user.email}.`);
    } catch (createError) {
      setError(createError.message || 'The account could not be created.');
    } finally {
      setBusyId(null);
    }
  }

  async function saveRole(user) {
    const role = roleValues[user.id];
    if (role === user.role) return;

    setBusyId(user.id);
    setMessage('');
    setError('');

    try {
      const response = await fetch(`/admin/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The role could not be updated.');

      setUsers((current) => current.map((item) =>
        item.id === user.id ? result.user : item
      ));
      setMessage(`Updated ${result.user.email}.`);
    } catch (updateError) {
      setRoleValues((current) => ({ ...current, [user.id]: user.role }));
      setError(updateError.message || 'The role could not be updated.');
    } finally {
      setBusyId(null);
    }
  }

  async function removeUser(user) {
    if (!window.confirm(`Remove access for ${user.email}?`)) return;

    setBusyId(user.id);
    setMessage('');
    setError('');

    try {
      const response = await fetch(`/admin/api/users/${user.id}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The account could not be removed.');

      setUsers((current) => current.filter((item) => item.id !== user.id));
      setMessage(`Removed ${user.email}.`);
    } catch (deleteError) {
      setError(deleteError.message || 'The account could not be removed.');
    } finally {
      setBusyId(null);
    }
  }

  const inputClass =
    'h-10 w-full rounded border border-[#8c8f94] bg-white px-3 text-sm text-[#1d2327] outline-none focus:border-[#2271b1] focus:ring-1 focus:ring-[#2271b1]';

  return (
    <>
      <form
        onSubmit={createUser}
        className="rounded border border-[#c3c4c7] bg-white p-5 shadow-sm"
      >
        <h2 className="text-lg font-semibold">Add Administrator</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr_180px_auto] lg:items-end">
          <div>
            <label htmlFor="new-user-email" className="block text-sm font-semibold">Email</label>
            <input
              id="new-user-email"
              type="email"
              autoComplete="off"
              value={newUser.email}
              onChange={(event) => setNewUser((current) => ({
                ...current,
                email: event.target.value,
              }))}
              required
              className={`mt-2 ${inputClass}`}
            />
          </div>
          <div>
            <label htmlFor="new-user-password" className="block text-sm font-semibold">
              Initial password
            </label>
            <input
              id="new-user-password"
              type="password"
              autoComplete="new-password"
              value={newUser.password}
              onChange={(event) => setNewUser((current) => ({
                ...current,
                password: event.target.value,
              }))}
              required
              minLength={12}
              className={`mt-2 ${inputClass}`}
            />
            <p className="mt-1 text-xs text-[#646970]">At least 12 characters.</p>
          </div>
          <div>
            <label htmlFor="new-user-role" className="block text-sm font-semibold">Role</label>
            <select
              id="new-user-role"
              value={newUser.role}
              onChange={(event) => setNewUser((current) => ({
                ...current,
                role: event.target.value,
              }))}
              className={`mt-2 ${inputClass}`}
            >
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={busyId === 'create'}
            className="inline-flex h-10 items-center justify-center rounded bg-[#2271b1] px-5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busyId === 'create' ? 'Creating…' : 'Create Account'}
          </button>
        </div>
      </form>

      {message ? (
        <div role="status" className="mt-5 rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {message}
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="mt-5 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="mt-6 overflow-hidden rounded border border-[#c3c4c7] bg-white shadow-sm">
        <div className="border-b border-[#c3c4c7] px-5 py-4">
          <h2 className="font-semibold">Accounts ({users.length})</h2>
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[820px] border-collapse text-left">
            <thead className="bg-[#f6f7f7] text-sm">
              <tr>
                <th className="border-b border-[#c3c4c7] px-4 py-3">Email</th>
                <th className="w-48 border-b border-[#c3c4c7] px-4 py-3">Role</th>
                <th className="w-56 border-b border-[#c3c4c7] px-4 py-3">Last login</th>
                <th className="w-52 border-b border-[#c3c4c7] px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isCurrent = user.id === currentUserId;
                const isLastSuperAdmin =
                  user.role === 'super_admin' && superAdminCount === 1;

                return (
                  <tr key={user.id} className="border-b border-[#dcdcde] last:border-0">
                    <td className="px-4 py-3">
                      <span className="font-semibold">{user.email}</span>
                      {isCurrent ? (
                        <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-800">
                          You
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={roleValues[user.id]}
                        onChange={(event) => setRoleValues((current) => ({
                          ...current,
                          [user.id]: event.target.value,
                        }))}
                        className={inputClass}
                      >
                        <option value="admin">Admin</option>
                        <option value="super_admin">Super Admin</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#50575e]">
                      {formatTimestamp(user.lastLoginAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-2">
                        <button
                          type="button"
                          onClick={() => saveRole(user)}
                          disabled={busyId === user.id || roleValues[user.id] === user.role}
                          className="rounded border border-[#2271b1] px-3 py-2 text-xs font-semibold text-[#2271b1] disabled:opacity-50"
                        >
                          Save Role
                        </button>
                        {!isLastSuperAdmin ? (
                          <button
                            type="button"
                            onClick={() => removeUser(user)}
                            disabled={busyId === user.id}
                            className="rounded border border-[#d63638] px-3 py-2 text-xs font-semibold text-[#b32d2e] disabled:opacity-50"
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="space-y-3 p-3 md:hidden">
          {users.map((user) => {
            const isCurrent = user.id === currentUserId;
            const isLastSuperAdmin =
              user.role === 'super_admin' && superAdminCount === 1;

            return (
              <article key={user.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-all font-semibold text-slate-900">{user.email}</p>
                    {isCurrent ? (
                      <span className="mt-1 inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-800">
                        You
                      </span>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-right text-xs text-slate-500">
                    Last login
                    <span className="mt-1 block font-medium text-slate-700">{formatTimestamp(user.lastLoginAt)}</span>
                  </span>
                </div>
                <div className="mt-3">
                  <label htmlFor={`mobile-user-role-${user.id}`} className="block text-xs font-semibold text-slate-500">
                    Role
                  </label>
                  <select
                    id={`mobile-user-role-${user.id}`}
                    value={roleValues[user.id]}
                    onChange={(event) => setRoleValues((current) => ({
                      ...current,
                      [user.id]: event.target.value,
                    }))}
                    className={`mt-1 ${inputClass}`}
                  >
                    <option value="admin">Admin</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => saveRole(user)}
                    disabled={busyId === user.id || roleValues[user.id] === user.role}
                    className="h-10 flex-1 rounded-lg border border-blue-200 text-sm font-semibold text-blue-700 disabled:opacity-50"
                  >
                    {busyId === user.id ? 'Saving…' : 'Save role'}
                  </button>
                  {!isLastSuperAdmin ? (
                    <button
                      type="button"
                      onClick={() => removeUser(user)}
                      disabled={busyId === user.id}
                      className="h-10 flex-1 rounded-lg border border-red-200 text-sm font-semibold text-red-700 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <McpAccessManager users={users} />
    </>
  );
}

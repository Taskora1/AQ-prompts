'use client';

import Link from 'next/link';
import { useState } from 'react';

const emptyProfile = {
  name: '',
  slug: '',
  roleTitle: '',
  bio: '',
  avatarUrl: '',
  socialLinks: [],
};

function socialLinksToText(links = []) {
  return links.map((link) => `${link.name} | ${link.href}`).join('\n');
}

function parseSocialLinks(value) {
  return value.split('\n').map((line) => {
    const [name, ...urlParts] = line.split('|');
    return { name: name.trim(), href: urlParts.join('|').trim() };
  }).filter((link) => link.name || link.href);
}

export default function AuthorProfilesManager({ initialAuthors }) {
  const [authors, setAuthors] = useState(initialAuthors);
  const [profile, setProfile] = useState(emptyProfile);
  const [socialText, setSocialText] = useState('');
  const [editingSlug, setEditingSlug] = useState('');
  const [fields, setFields] = useState({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function startEdit(author) {
    setProfile({
      name: author.name,
      slug: author.slug,
      roleTitle: author.roleTitle,
      bio: author.bio,
      avatarUrl: author.avatarUrl,
    });
    setSocialText(socialLinksToText(author.socialLinks));
    setEditingSlug(author.slug);
    setFields({});
    setMessage('');
    setError('');
  }

  function startCreate() {
    setProfile(emptyProfile);
    setSocialText('');
    setEditingSlug('');
    setFields({});
    setMessage('');
    setError('');
  }

  async function saveProfile(event) {
    event.preventDefault();
    setSaving(true);
    setFields({});
    setMessage('');
    setError('');

    try {
      const response = await fetch(
        editingSlug ? `/admin/api/authors/${encodeURIComponent(editingSlug)}` : '/admin/api/authors',
        {
          method: editingSlug ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...profile, socialLinks: parseSocialLinks(socialText) }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        setFields(result.fields || {});
        throw new Error(result.error || 'The author profile could not be saved.');
      }

      setAuthors((current) => {
        const next = current.filter((author) => author.slug !== result.author.slug);
        next.push(result.author);
        return next.sort((left, right) => left.name.localeCompare(right.name));
      });
      setMessage(editingSlug ? 'Author profile updated.' : 'Author profile created.');
      startCreate();
    } catch (saveError) {
      setError(saveError.message || 'The author profile could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  const inputClass = 'mt-1 w-full rounded border border-[#8c8f94] px-3 py-2 text-sm';

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
      <section className="rounded border border-[#c3c4c7] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Author profiles</h2>
          <button type="button" onClick={startCreate} className="rounded border border-[#2271b1] px-3 py-2 text-sm font-semibold text-[#2271b1]">
            Add author
          </button>
        </div>
        {message ? <p role="status" className="mt-4 text-sm text-green-700">{message}</p> : null}
        {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
        <ul className="mt-4 divide-y divide-[#dcdcde]">
          {authors.map((author) => (
            <li key={author.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <p className="font-semibold">{author.name}</p>
                <p className="text-sm text-[#646970]">{author.roleTitle || 'Author'} · /author/{author.slug}</p>
                <Link className="text-sm text-[#2271b1] hover:underline" href={author.url} target="_blank">View public profile</Link>
              </div>
              <button type="button" onClick={() => startEdit(author)} className="rounded border border-[#8c8f94] px-3 py-2 text-sm font-semibold">
                Edit
              </button>
            </li>
          ))}
          {!authors.length ? <li className="py-4 text-sm text-[#646970]">No author profiles yet.</li> : null}
        </ul>
      </section>

      <form onSubmit={saveProfile} className="space-y-4 rounded border border-[#c3c4c7] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">{editingSlug ? 'Edit author' : 'Create author'}</h2>
        <div>
          <label htmlFor="author-name" className="text-sm font-semibold">Name</label>
          <input id="author-name" required maxLength={160} className={inputClass} value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} />
          {fields.name ? <p className="mt-1 text-xs text-red-700">{fields.name}</p> : null}
        </div>
        <div>
          <label htmlFor="author-slug" className="text-sm font-semibold">URL slug</label>
          <input id="author-slug" required maxLength={120} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" className={inputClass} value={profile.slug} disabled={Boolean(editingSlug)} onChange={(event) => setProfile({ ...profile, slug: event.target.value.toLowerCase() })} />
          <p className="mt-1 text-xs text-[#646970]">Public profile URL: /author/{profile.slug || 'your-name'}. Slugs cannot be changed later.</p>
          {fields.slug ? <p className="mt-1 text-xs text-red-700">{fields.slug}</p> : null}
        </div>
        <div>
          <label htmlFor="author-role" className="text-sm font-semibold">Role or title</label>
          <input id="author-role" maxLength={200} className={inputClass} value={profile.roleTitle} onChange={(event) => setProfile({ ...profile, roleTitle: event.target.value })} />
          {fields.roleTitle ? <p className="mt-1 text-xs text-red-700">{fields.roleTitle}</p> : null}
        </div>
        <div>
          <label htmlFor="author-bio" className="text-sm font-semibold">Bio</label>
          <textarea id="author-bio" required maxLength={4000} rows={5} className={inputClass} value={profile.bio} onChange={(event) => setProfile({ ...profile, bio: event.target.value })} />
          {fields.bio ? <p className="mt-1 text-xs text-red-700">{fields.bio}</p> : null}
        </div>
        <div>
          <label htmlFor="author-avatar" className="text-sm font-semibold">Avatar URL</label>
          <input id="author-avatar" type="text" inputMode="url" className={inputClass} placeholder="https://… or /images/…" value={profile.avatarUrl} onChange={(event) => setProfile({ ...profile, avatarUrl: event.target.value })} />
          {fields.avatarUrl ? <p className="mt-1 text-xs text-red-700">{fields.avatarUrl}</p> : null}
        </div>
        <div>
          <label htmlFor="author-socials" className="text-sm font-semibold">Social links</label>
          <textarea id="author-socials" rows={4} className={inputClass} placeholder={'Instagram | https://…\nLinkedIn | https://…'} value={socialText} onChange={(event) => setSocialText(event.target.value)} />
          <p className="mt-1 text-xs text-[#646970]">One per line, formatted as “Name | HTTPS URL”.</p>
          {fields.socialLinks ? <p className="mt-1 text-xs text-red-700">{fields.socialLinks}</p> : null}
        </div>
        <button disabled={saving} type="submit" className="rounded bg-[#2271b1] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
          {saving ? 'Saving…' : editingSlug ? 'Save changes' : 'Create profile'}
        </button>
      </form>
    </div>
  );
}

'use client';

import { useState } from 'react';

const MAX_IMAGE_SIZE = 4 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

async function uploadReviewPhoto(file) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error('Use a JPG, PNG, or WebP image.');
  }
  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error('The photo must be 4 MB or smaller.');
  }

  const formData = new FormData();
  formData.set('file', file);
  const response = await fetch('/admin/api/upload', { method: 'POST', body: formData });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Photo upload failed.');
  return result.url || result.secureUrl;
}

export default function ReviewProfileEditor({ review, onSaved }) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(review.name || '');
  const [profileImageUrl, setProfileImageUrl] = useState(review.profileImageUrl || '');
  const [socialUrl, setSocialUrl] = useState(review.socialUrl || '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function handlePhotoChange(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setError('');
    setMessage('');
    setUploading(true);
    try {
      setProfileImageUrl(await uploadReviewPhoto(file));
      setMessage('Photo uploaded. Save the profile to apply it.');
    } catch (uploadError) {
      setError(uploadError.message || 'Photo upload failed.');
    } finally {
      setUploading(false);
      input.value = '';
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/admin/api/reviews/${review.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, profileImageUrl, socialUrl }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Reviewer profile could not be saved.');
      onSaved(result.review);
      setMessage('Reviewer profile saved.');
    } catch (saveError) {
      setError(saveError.message || 'Reviewer profile could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">Public profile</h3>
          {!isEditing ? (
            <p className="mt-1 text-xs text-slate-500">
              {[profileImageUrl ? 'Photo added' : 'No photo', socialUrl ? 'Social link added' : 'No social link'].join(' · ')}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          aria-expanded={isEditing}
          onClick={() => {
            setIsEditing((current) => !current);
            setError('');
            setMessage('');
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 hover:border-slate-400"
        >
          {isEditing ? 'Cancel' : 'Edit profile details'}
        </button>
      </div>
      {isEditing ? (
        <form onSubmit={saveProfile} className="mt-3 border-t border-slate-200 pt-3">
          <label className="block text-sm font-semibold">
            Display name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              required
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            />
          </label>
          <label className="mt-3 block text-sm font-semibold">
            Social profile URL <span className="font-normal text-slate-500">(shown publicly with approved review)</span>
            <input
              type="url"
              value={socialUrl}
              onChange={(event) => setSocialUrl(event.target.value)}
              maxLength={2048}
              placeholder="https://..."
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            />
          </label>
          <div className="mt-3">
            <label className="block text-sm font-semibold">
              Profile photo
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={uploading || saving}
                onChange={handlePhotoChange}
                className="mt-1 block w-full text-sm"
              />
            </label>
            {profileImageUrl ? (
              <div className="mt-2 flex items-center gap-3">
                <img src={profileImageUrl} alt="" width="56" height="56" className="h-14 w-14 rounded-full object-cover" />
                <button type="button" onClick={() => setProfileImageUrl('')} className="text-sm font-semibold text-red-700 underline">
                  Remove photo
                </button>
              </div>
            ) : (
              <p className="mt-1 text-xs text-slate-500">Upload a photo manually; social profile pages do not provide a reliable public photo API.</p>
            )}
          </div>
          {error ? <p className="mt-3 text-sm font-semibold text-red-700" role="alert">{error}</p> : null}
          {message ? <p className="mt-3 text-sm font-semibold text-green-700" role="status">{message}</p> : null}
          <button
            type="submit"
            disabled={saving || uploading}
            className="mt-4 rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {uploading ? 'Uploading photo...' : saving ? 'Saving...' : 'Save reviewer profile'}
          </button>
        </form>
      ) : null}
    </section>
  );
}

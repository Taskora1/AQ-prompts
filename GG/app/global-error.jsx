'use client';

// Root error boundary — replaces the whole layout (including <html>/<body>),
// so it must render its own minimal branded page and cannot use Header/Footer.
export default function GlobalError({ error, reset }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#fff', color: '#0f172a' }}>
        <main style={{ maxWidth: 640, margin: '0 auto', padding: '96px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#ea580c' }}>
            AQPrompts
          </p>
          <h1 style={{ marginTop: 16, fontSize: 36, fontWeight: 800, lineHeight: 1.1 }}>
            Something went wrong
          </h1>
          <p style={{ marginTop: 16, fontSize: 16, lineHeight: 1.6, color: '#64748b' }}>
            The page ran into a temporary problem. Please try again, or head back to the
            prompt library.
          </p>
          {process.env.NODE_ENV === 'development' && error?.message ? (
            <p style={{ marginTop: 16, padding: 12, background: '#f1f5f9', borderRadius: 8, fontFamily: 'monospace', fontSize: 12, textAlign: 'left', color: '#475569' }}>
              {error.message}
            </p>
          ) : null}
          <div style={{ marginTop: 32, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#ea580c', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
            >
              Try again
            </button>
            <a
              href="/tools/ai-image-prompts"
              style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #cbd5e1', color: '#0f172a', fontWeight: 700, textDecoration: 'none' }}
            >
              Browse prompts
            </a>
            <a
              href="/"
              style={{ padding: '10px 20px', borderRadius: 8, color: '#0f172a', fontWeight: 700, textDecoration: 'none' }}
            >
              Go home
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}

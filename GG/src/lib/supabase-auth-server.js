import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export class SupabaseAuthConfigurationError extends Error {
  constructor() {
    super('Supabase Auth is not configured.');
    this.name = 'SupabaseAuthConfigurationError';
  }
}

export async function createSupabaseAuthServerClient({ readOnlyCookies = false } = {}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) throw new SupabaseAuthConfigurationError();

  const cookieStore = await cookies();
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        if (readOnlyCookies) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // The Next.js Proxy refreshes Supabase cookies for Server Components.
          }
          return;
        }
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });
}

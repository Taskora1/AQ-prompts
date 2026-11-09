import { revalidatePath } from 'next/cache';

export function revalidateAuthorProfiles() {
  revalidatePath('/sitemap.xml');
}

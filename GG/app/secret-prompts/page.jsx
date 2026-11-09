import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SecretPromptVault from '@/components/prompts/SecretPromptVault';
import { getSlimPromptsPayload } from '@/lib/prompts';
import { SECRET_PROMPT_SLUGS } from '@/lib/secret-prompts';
import { buildMetadata } from '@/lib/metadata';

export const dynamic = 'force-static';
export const revalidate = false;

export const metadata = buildMetadata({
  title: 'Secret Prompt Vault | AQPrompts',
  description: 'Unlock 34 exclusive AI image prompts by completing the daily discovery challenge on AQPrompts.',
  path: '/secret-prompts',
});

export default async function SecretPromptsPage() {
  const payload = await getSlimPromptsPayload();
  const promptsBySlug = new Map((payload.prompts || []).map((prompt) => [prompt.slug, prompt]));
  const prompts = SECRET_PROMPT_SLUGS
    .map((slug) => promptsBySlug.get(slug))
    .filter(Boolean);

  return (
    <>
      <Header />
      <main id="main-content" className="min-h-screen bg-[var(--bg-secondary)]">
        <SecretPromptVault prompts={prompts} />
      </main>
      <Footer />
    </>
  );
}

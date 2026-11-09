import { permanentRedirect } from 'next/navigation';

export const dynamic = 'force-static';
export const revalidate = false;

export default function Page() {
  permanentRedirect('/tools/ai-image-prompts/men');
}

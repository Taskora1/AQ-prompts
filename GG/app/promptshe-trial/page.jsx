import Footer from '@/components/Footer';
import Header from '@/components/Header';
import PromptsheTrialForm from '@/components/promptshe/PromptsheTrialForm';
import { isIntegrationEnabled } from '@/lib/deployment-env';
import { buildMetadata } from '@/lib/metadata';

export const dynamic = 'force-static';
export const revalidate = false;

export function generateMetadata() {
  return buildMetadata({
    title: 'Promptshe 3-Day WhatsApp Community Preview',
    description: 'Verify your WhatsApp number for free 3-day Promptshe community access. No payment or paid membership is required.',
    path: '/promptshe-trial',
    noIndex: true,
    keywords: ['Promptshe', 'AI prompts community', 'WhatsApp community', 'community preview'],
  });
}

export default function Page() {
  const trialEnabled = isIntegrationEnabled('promptsheTrial');

  return (
    <>
      <Header />
      <main id="main-content" className="min-h-screen bg-[#f7f7fb] text-[#111118] dark:bg-[#0a0a0f] dark:text-white">
        <section className="mx-auto grid w-full max-w-6xl items-start gap-6 px-4 pb-32 pt-7 sm:px-6 sm:py-10 lg:min-h-[calc(100vh-64px)] lg:grid-cols-[1fr_420px] lg:items-center lg:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#c2410c] sm:text-sm">Promptshe community</p>
            <h1 className="mt-3 text-[32px] font-black leading-[1.08] tracking-tight sm:text-5xl sm:leading-tight">
              Start your free 3-day WhatsApp community preview
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-7 text-[#4b5563] sm:mt-5 sm:text-base sm:leading-8 dark:text-[#9ca3af]">
              Verify your WhatsApp number once, then join the Promptshe community for curated prompts, creator workflows,
              and practical AI content ideas.
            </p>
            <p className="mt-3 max-w-xl rounded-xl border border-[#ff6b35]/20 bg-[#fff4ef] p-4 text-sm font-semibold leading-6 text-[#4b5563] dark:bg-[#1b1514] dark:text-[#d1d5db]">
              This is free community access. No payment is collected, no subscription starts, and VIP membership is currently paused.
            </p>
            <div className="mt-5 grid grid-cols-3 gap-2 text-xs text-[#4b5563] sm:mt-7 sm:gap-3 sm:text-sm dark:text-[#9ca3af]">
              <div className="rounded-lg border border-[#e5e7eb] bg-white p-3 sm:p-4 dark:border-white/10 dark:bg-[#111118]">
                <p className="text-[13px] font-black leading-tight text-[#111118] sm:text-base dark:text-white">3 days</p>
                <p className="mt-1">Free access</p>
              </div>
              <div className="rounded-lg border border-[#e5e7eb] bg-white p-3 sm:p-4 dark:border-white/10 dark:bg-[#111118]">
                <p className="text-[13px] font-black leading-tight text-[#111118] sm:text-base dark:text-white">WhatsApp</p>
                <p className="mt-1">Community link</p>
              </div>
              <div className="rounded-lg border border-[#e5e7eb] bg-white p-3 sm:p-4 dark:border-white/10 dark:bg-[#111118]">
                <p className="text-[13px] font-black leading-tight text-[#111118] sm:text-base dark:text-white">One trial</p>
                <p className="mt-1">Per number</p>
              </div>
            </div>
          </div>

          <PromptsheTrialForm disabled={!trialEnabled} />
        </section>
      </main>
      <Footer />
    </>
  );
}

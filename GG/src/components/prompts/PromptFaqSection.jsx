import { HelpCircle } from 'lucide-react';

export default function PromptFaqSection({ items = [] }) {
  if (!items.length) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 md:py-10 lg:px-8">
      <div className="overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-sm dark:border-white/[0.08] dark:bg-[#111118]">
        <div className="flex items-center gap-3.5 border-b border-[#e5e7eb]/60 px-5 py-5 dark:border-white/[0.08] sm:px-6">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ff6b35]/10 text-[#c2410c]">
            <HelpCircle className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-xl font-black tracking-normal text-[#111118] dark:text-white sm:text-2xl">
              Frequently Asked Questions
            </h2>
            <p className="mt-0.5 text-[13px] text-[#6b7280] dark:text-[#9ca3af]">Quick answers before you copy this prompt</p>
          </div>
        </div>

        <div className="divide-y divide-[#e5e7eb]/60 dark:divide-white/[0.06]">
          {items.map((item) => (
            <details key={item.question} className="group">
              <summary
                className="flex w-full cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-bold leading-6 text-[#111118] transition-all duration-200 hover:bg-[#fff7f2]/80 hover:text-[#c2410c] dark:text-white dark:hover:bg-[#ff6b35]/5 sm:px-6 sm:py-5 sm:text-base"

              >
                <span className="min-w-0" dangerouslySetInnerHTML={{ __html: item.question }} />
                <span
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#e5e7eb] bg-white text-lg font-black leading-none text-[#c2410c] transition-all duration-200 group-open:rotate-45 group-open:border-[#ff6b35] group-open:bg-[#ff6b35] group-open:text-white dark:border-white/[0.12] dark:bg-white/[0.03] dark:group-open:bg-[#ff6b35] dark:group-open:border-[#ff6b35]"
                  aria-hidden="true"
                >
                  +
                </span>
              </summary>
              <div className="px-5 pb-5 sm:px-6">
                <p className="max-w-4xl text-[14px] leading-7 text-[#4b5563] dark:text-[#9ca3af] sm:text-[15px]" dangerouslySetInnerHTML={{ __html: item.answer }} />
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

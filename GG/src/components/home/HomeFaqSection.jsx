'use client';

import { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';

export default function HomeFaqSection({ items = [] }) {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <section className="bg-[#f9fafb] py-10 sm:py-12 dark:bg-[#0a0a0f]">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#ff6b35]/10 text-[#c2410c] ring-1 ring-[#ff6b35]/20">
            <HelpCircle className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-3xl font-black tracking-normal text-[#111118] sm:text-4xl dark:text-white">
            Frequently Asked Questions
          </h2>
          <p className="mt-3 text-base leading-7 text-[#6b7280] sm:text-lg dark:text-[#9ca3af]">
            Everything you need to know about AQPrompts
          </p>
        </div>

        <div className="mt-10 overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-[#111118]">
          {items.map((item, index) => {
            const isOpen = openIndex === index;
            return (
              <article
                key={item.question}
                className={`${index === items.length - 1 ? '' : 'border-b border-[#e5e7eb] dark:border-white/10'} ${
                  isOpen ? 'bg-[#fff7f2] dark:bg-[#1b1514]' : 'bg-white dark:bg-[#111118]'
                } transition-colors`}
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? -1 : index)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left transition hover:bg-[#fff7f2] sm:px-6 dark:hover:bg-[#1b1514]"
                  aria-expanded={isOpen}
                >
                  <span className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#ff6b35]/10 text-xs font-black text-[#c2410c]">
                      {index + 1}
                    </span>
                    <span className="text-base font-black leading-6 text-[#111118] sm:text-lg dark:text-white">
                      {item.question}
                    </span>
                  </span>
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#e5e7eb] bg-white text-[#c2410c] shadow-sm dark:border-white/10 dark:bg-[#0a0a0f]" aria-hidden="true">
                    <ChevronDown className={`h-5 w-5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                  </span>
                </button>
                <div
                  className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                    isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="px-5 pb-6 pl-14 text-sm leading-7 text-[#4b5563] sm:px-6 sm:pl-[4.25rem] sm:text-base dark:text-[#cbd5e1]">
                      {item.answer}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
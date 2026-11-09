import Image from 'next/image';
import Link from 'next/link';

import { SOCIAL_LINK_ITEMS, TRUSTED_AI_TOOLS } from '@/lib/site-social';

export function HomeWorksWithTools() {
  return (
    <section className="border-y border-[#e5e7eb] bg-[#f9fafb] py-10 dark:border-white/10 dark:bg-[#111118]" aria-label="Supported AI tools">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-center text-xs font-black uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
          Works with your favourite AI image tools
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {TRUSTED_AI_TOOLS.map((tool) => (
            <Link
              key={tool.name}
              href={tool.href}
              className={`inline-flex items-center gap-2 rounded-2xl border border-[#e5e7eb] bg-gradient-to-br px-5 py-3 text-sm font-black text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-[#ff6b35] dark:border-white/10 dark:text-white ${tool.accent}`}
            >
              {tool.logo ? <Image src={tool.logo} alt="" width={20} height={20} style={{ width: 'auto', height: 'auto' }} aria-hidden /> : null}
              {tool.name}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export function HomeSocialLinks({ className = '' }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`} aria-label="AQPrompts social links">
      {SOCIAL_LINK_ITEMS.map((social) => (
        <Link
          key={social.name}
          href={social.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Follow AQPrompts on ${social.name}`}
          title={social.name}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#e2e8f0] bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-[#ff6b35] hover:bg-[#fff7f3] focus:outline-none focus:ring-2 focus:ring-[#ff6b35] focus:ring-offset-2 dark:border-white/10 dark:bg-[#111118] dark:hover:bg-[#19191f] dark:focus:ring-offset-[#0a0a0f]"
        >
          {social.logo ? (
            <Image src={social.logo} alt="" width={20} height={20} aria-hidden />
          ) : (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#E60023] text-[11px] font-black text-white" aria-hidden>
              P
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
export function HomeAboutCreator() {
  return (
    <section className="bg-white py-14 dark:bg-[#0a0a0f]">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
        <h2 className="text-2xl font-black tracking-[-0.04em] text-slate-950 sm:text-3xl dark:text-white">
          About AQPrompts
        </h2>
        <details className="group mt-4 text-left sm:hidden">
          <summary className="cursor-pointer list-none text-center [&::-webkit-details-marker]:hidden">
            <span className="line-clamp-3 text-sm leading-6 text-slate-600 group-open:hidden dark:text-slate-300">
              AQPrompts reviews each published prompt for clear subject direction, composition, lighting, and practical
              usage instructions. Results can vary across AI tools, model versions, settings, and reference images, so
              every prompt is presented as a starting point that creators can adapt.
            </span>
            <span className="mt-2 inline-flex text-sm font-black text-[#c2410c] group-open:hidden">Read more</span>
            <span className="hidden text-sm font-black text-[#c2410c] group-open:inline-flex">Show less</span>
          </summary>
          <p className="mt-3 text-center text-sm leading-6 text-slate-600 dark:text-slate-300">
            I started AQPrompts to make practical AI image prompting easier for creators. I use ChatGPT to draft and
            refine prompt structure, inspect the generated image, and revise subject direction, composition, lighting,
            hands, clothing, and text. Prompts are revised or rejected when they contain unclear age or subject
            direction, conflicting lighting instructions, or likely distortions in hands or text. Results vary across
            tools, models, settings, and reference images.
            <br />
            <span className="font-semibold text-slate-700 dark:text-slate-200">Founder: Abdul Qudoos (born 29 October 2006).</span>
          </p>
        </details>
        <p className="mt-4 hidden text-base leading-8 text-slate-600 sm:block dark:text-slate-300">
        I started AQPrompts to make practical AI image prompting easier for creators who want a clear starting point
        instead of trial and error. I personally use ChatGPT to draft and refine prompt structure, then inspect the
        generated image and revise details such as subject direction, composition, lighting, hands, clothing, and
        generated text. A prompt passes review when its instructions are coherent, its subject is clearly defined,
        its intended use is practical, and the result can be checked and adapted rather than presented as guaranteed.
        Prompts are revised or rejected when they contain unclear age or subject direction, conflicting lighting
        instructions, or likely distortions in hands or text. Results still vary across tools, model versions,
        settings, and reference images.
        <br />
        <span className="font-semibold text-slate-700 dark:text-slate-200">Founder: Abdul Qudoos (born 29 October 2006).</span>
        </p>
        <Link
          href="/about"
          className="mt-6 inline-flex items-center gap-2 text-sm font-black text-[#c2410c] hover:underline"
        >
          Meet the founder
          <span aria-hidden="true">&rarr;</span>
        </Link>
      </div>
    </section>
  );
}

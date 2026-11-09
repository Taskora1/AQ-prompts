import TextPromptCopyButton from './TextPromptCopyButton';

export default function TextPromptCard({ prompt, onLoad }) {
  const categoryLabel = prompt.categories.map((category) => category.name).join(', ');

  return (
    <article className="flex min-w-0 flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm transition hover:border-[#ff6b35]/60 hover:shadow-lg sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {categoryLabel ? (
          <span className="rounded-lg bg-[#ff6b35]/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-[#c2410c]">
            {categoryLabel}
          </span>
        ) : <span />}
        {prompt.generationTestedTool ? (
          <span className="rounded-lg bg-[var(--bg-secondary)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]">
            Tested with {prompt.generationTestedTool}
          </span>
        ) : null}
      </div>
      <h2 className="mt-4 break-words text-lg font-bold leading-snug text-[var(--text-primary)] sm:text-xl">
        {prompt.title}
      </h2>
      {prompt.intro ? (
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
          {prompt.intro}
        </p>
      ) : null}
      <p className="mt-4 min-h-24 flex-1 overflow-hidden whitespace-pre-wrap break-words rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-3 text-sm leading-6 text-[var(--text-secondary)] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:4]">
        {prompt.prompt}
      </p>
      <details className="group mt-4 border-t border-[var(--border)] pt-3">
        <summary className="min-h-10 cursor-pointer rounded text-sm font-semibold text-[#c2410c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6b35]">
          <span className="group-open:hidden">Read full prompt</span>
          <span className="hidden group-open:inline">Hide full prompt</span>
        </summary>
        <p className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-[var(--bg-secondary)] p-4 text-sm leading-7 text-[var(--text-primary)]">
          {prompt.prompt}
        </p>
      </details>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <TextPromptCopyButton prompt={prompt.prompt} promptId={prompt.id} />
        <button
          type="button"
          onClick={() => onLoad(prompt)}
          className="inline-flex min-h-10 items-center justify-center rounded-full border border-[var(--border)] px-4 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[#ff6b35] hover:text-[#c2410c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6b35] focus-visible:ring-offset-2"
        >
          Load into workspace
        </button>
      </div>
    </article>
  );
}

export function TestingEvidencePanel({ evidence = null }) {
  if (
    evidence?.reviewStatus !== 'published'
    || evidence?.publicationRightsStatus !== 'verified'
  ) {
    return null;
  }

  return (
    <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-[#111118] sm:p-6">
      <h2 className="text-xl font-black text-slate-950 dark:text-white">Documented generation evidence</h2>
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-bold text-slate-950 dark:text-white">Tool and model</dt>
          <dd className="mt-1 text-slate-600 dark:text-slate-300">{evidence.aiTool} · {evidence.modelVersion}</dd>
        </div>
        <div>
          <dt className="font-bold text-slate-950 dark:text-white">Test date</dt>
          <dd className="mt-1 text-slate-600 dark:text-slate-300">{evidence.testDate}</dd>
        </div>
        <div>
          <dt className="font-bold text-slate-950 dark:text-white">Prompt version</dt>
          <dd className="mt-1 break-words text-slate-600 dark:text-slate-300">{evidence.exactPromptVersion}</dd>
        </div>
        <div>
          <dt className="font-bold text-slate-950 dark:text-white">Recorded generations</dt>
          <dd className="mt-1 text-slate-600 dark:text-slate-300">{evidence.numberOfGenerations}</dd>
        </div>
      </dl>
      {evidence.observedIssues?.length ? (
        <>
          <h3 className="mt-6 font-black text-slate-950 dark:text-white">Observed limitations</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-600 dark:text-slate-300">
            {evidence.observedIssues.map((issue) => <li key={issue}>{issue}</li>)}
          </ul>
        </>
      ) : null}
    </section>
  );
}

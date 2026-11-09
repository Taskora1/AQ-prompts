'use client';

import { useRef, useState } from 'react';

import TextPromptCard from './TextPromptCard';
import { copyText } from './TextPromptCopyButton';

export default function TextPromptLibraryExperience({ prompts }) {
  const [workspace, setWorkspace] = useState('');
  const [feedback, setFeedback] = useState('');
  const editorRef = useRef(null);

  function loadPrompt(prompt) {
    setWorkspace(prompt.prompt);
    setFeedback(`Loaded “${prompt.title}” into the workspace.`);
    editorRef.current?.focus();
  }

  async function handleCopy() {
    if (!workspace) {
      setFeedback('Add or load a prompt before copying.');
      return;
    }

    try {
      await copyText(workspace);
      setFeedback('Customized prompt copied to clipboard.');
    } catch {
      setFeedback('Copy failed. Select the workspace text and copy it manually.');
    }
  }

  async function handlePaste() {
    if (!navigator.clipboard?.readText) {
      setFeedback('Clipboard access is unavailable. Paste with Ctrl+V or Command+V in the editor.');
      editorRef.current?.focus();
      return;
    }

    try {
      const text = await navigator.clipboard.readText();
      setWorkspace(text);
      setFeedback('Clipboard text pasted into the workspace.');
      editorRef.current?.focus();
    } catch {
      setFeedback('Clipboard access was denied. Paste with Ctrl+V or Command+V in the editor.');
      editorRef.current?.focus();
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {prompts.map((prompt) => (
          <TextPromptCard key={prompt.id} prompt={prompt} onLoad={loadPrompt} />
        ))}
      </div>
      <section
        id="text-prompt-workspace"
        aria-labelledby="text-prompt-workspace-heading"
        className="mt-9 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-lg shadow-slate-950/5 sm:p-7"
      >
        <h2 id="text-prompt-workspace-heading" className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
          Prompt workspace
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
          Load a prompt above, edit it for your task, and copy your customized version.
        </p>
        <label htmlFor="text-prompt-workspace-editor" className="sr-only">Customize prompt text</label>
        <textarea
          ref={editorRef}
          id="text-prompt-workspace-editor"
          value={workspace}
          onChange={(event) => {
            setWorkspace(event.target.value);
            setFeedback('');
          }}
          placeholder="Choose “Load into workspace” on a prompt card or write your own..."
          className="mt-5 min-h-40 w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-4 text-sm leading-7 text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6b35]"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#ff6b35] px-5 text-sm font-bold text-[#111118] transition hover:bg-[#e85d28] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c2410c] focus-visible:ring-offset-2"
          >
            Copy from workspace
          </button>
          <button
            type="button"
            onClick={handlePaste}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--border)] px-5 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[#ff6b35] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6b35] focus-visible:ring-offset-2"
          >
            Paste from clipboard
          </button>
          <button
            type="button"
            onClick={() => {
              setWorkspace('');
              setFeedback('Workspace cleared.');
              editorRef.current?.focus();
            }}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--border)] px-5 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[#ff6b35] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6b35] focus-visible:ring-offset-2"
          >
            Clear
          </button>
        </div>
        <p role="status" aria-live="polite" className="mt-3 min-h-5 text-sm text-[var(--text-secondary)]">
          {feedback}
        </p>
      </section>
    </>
  );
}

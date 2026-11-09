'use client';

import { Download } from 'lucide-react';

export default function PromptDownloadLink({ href, filename }) {
  return (
    <a
      href={href}
      download={filename}
      className="group absolute bottom-3 left-3 right-3 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white/95 px-4 text-sm font-black text-[#111118] shadow-lg shadow-black/15 backdrop-blur-sm transition-all duration-300 hover:bg-[#ff6b35] hover:text-white hover:shadow-[0_8px_24px_rgba(255,107,53,0.35)] hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#ff6b35] focus:ring-offset-2 focus:ring-offset-[#0d1a2e] md:bottom-4 md:left-4 md:right-4 dark:bg-white dark:text-[#111118] dark:hover:bg-[#ff6b35] dark:hover:text-white"
    >
      <Download className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5" aria-hidden="true" />
      Download Image
    </a>
  );
}

'use client';

import { useEffect } from 'react';

/**
 * Patterns that indicate third-party DOM interference
 * (Google Translate, Grammarly, ad blockers, etc.)
 */
const SUPPRESSED_ERROR_PATTERNS = [
  'insertBefore',
  'removeChild',
  'appendChild',
  'replaceChild',
  'Failed to execute',
  'Node',
  'Script error',
  'script error',
  'ResizeObserver loop',
  'Non-Error promise rejection',
  'Loading chunk',
  'ChunkLoadError',
  'is not a function',
  'Cannot read properties of null',
  'Cannot read properties of undefined',
  'reading ',
];

/**
 * Patterns to match in stack traces for common extension frames
 */
const EXTENSION_STACK_PATTERNS = [
  'chrome-extension://',
  'moz-extension://',
  'safari-web-extension://',
  'extensions/google',
  'translate.googleapis',
  'toolbar',
];

function isExtensionError(message, stack) {
  const msg = String(message || '').toLowerCase();
  const trace = String(stack || '').toLowerCase();

  // Check if the error message matches known DOM manipulation errors
  const isDomError = SUPPRESSED_ERROR_PATTERNS.some((pattern) =>
    msg.includes(pattern.toLowerCase())
  );

  if (!isDomError) return false;

  // Check if the stack trace originates from an extension
  const isFromExtension = EXTENSION_STACK_PATTERNS.some((pattern) =>
    trace.includes(pattern.toLowerCase())
  );

  if (isFromExtension) return true;

  // If the error is a DOM manipulation error with no clear internal origin,
  // it's likely from extension DOM injection — suppress it
  const hasInternalOrigin = trace.includes('_next') || trace.includes('react');
  if (!hasInternalOrigin && isDomError) return true;

  return false;
}

function isResizeObserverError(message) {
  return String(message || '').includes('ResizeObserver loop');
}

export default function DomErrorSuppressor() {
  useEffect(() => {
    // ── 1. Global window error listener ──
    function handleError(event) {
      const { message, error, filename } = event;

      // ResizeObserver loop — always safe to suppress
      if (isResizeObserverError(message)) {
        event.preventDefault();
        return;
      }

      // Check stack trace for extension-origin errors
      const stack = error?.stack || '';
      if (isExtensionError(message, stack)) {
        event.preventDefault();
        return;
      }

      // Script errors from cross-origin or extension-injected scripts
      const msg = String(message || '').toLowerCase();
      if (msg === 'script error.' || msg === 'script error') {
        event.preventDefault();
        return;
      }
    }

    // ── 2. Unhandled promise rejection listener ──
    function handleUnhandledRejection(event) {
      const reason = event.reason;
      const message = reason?.message || String(reason || '');
      const stack = reason?.stack || '';

      if (isExtensionError(message, stack)) {
        event.preventDefault();
        return;
      }

      // Chunk loading errors (navigation during deploy)
      if (message.includes('Loading chunk') || message.includes('ChunkLoadError')) {
        event.preventDefault();
        // Optionally reload the page
        // window.location.reload();
        return;
      }

      // Non-Error promise rejections
      if (message.includes('Non-Error promise rejection')) {
        event.preventDefault();
        return;
      }
    }

    // ── 3. MutationObserver to detect and undo extension DOM changes ──
    // This catches Google Translate, Grammarly, etc. from modifying React-managed nodes
    let mutationObserver = null;
    try {
      mutationObserver = new MutationObserver((mutations) => {
        // We only observe specific containers — check if the mutation target
        // is inside a React-managed root that we've marked
        for (const mutation of mutations) {
          const target = mutation.target;
          if (!target || !target.parentNode) continue;

          // Skip if this is a known non-React container
          if (target.id === 'cmplz-cookiebanner-container') continue;
          if (target.classList?.contains('cmplz-placeholder-element')) continue;

          // If nodes were added that look like extension artifacts, remove them
          if (mutation.type === 'childList') {
            for (const node of Array.from(mutation.addedNodes)) {
              if (node.nodeType !== Node.ELEMENT_NODE) continue;

              const tag = node.tagName?.toLowerCase();
              const id = node.id || '';
              const cls = node.className || '';

              // Google Translate wraps content in <font> tags with specific classes
              if (tag === 'font' && (cls.includes('notranslate') || id.startsWith('goog'))) {
                try {
                  node.parentNode?.removeChild(node);
                } catch {
                  // Node already removed — ignore
                }
                continue;
              }

              // Grammarly injects overlay divs
              if (tag === 'div' && id.startsWith('gr-')) {
                try {
                  node.parentNode?.removeChild(node);
                } catch {
                  // Node already removed — ignore
                }
              }
            }
          }
        }
      });

      // Observe React-managed roots for extension-injected nodes
      const reactRoots = document.querySelectorAll('#__next, [data-reactroot], main, #main-content');
      for (const root of reactRoots) {
        mutationObserver.observe(root, {
          childList: true,
          subtree: false,
        });
      }
      // Fallback: if no React roots found, observe body
      if (reactRoots.length === 0) {
        mutationObserver.observe(document.body, {
          childList: true,
          subtree: false,
        });
      }
    } catch {
      // MutationObserver not supported — skip
    }

    // ── 4. Wrap console.error to suppress known noisy errors ──
    const originalConsoleError = console.error;
    const suppressedMessages = [
      'Warning: React does not recognize the',
      'Warning: Extra attributes from the server',
      'Warning: Expected server HTML to contain a matching',
      'Warning: Each child in a list should have a unique',
      'The above error occurred in the',
      'Uncaught NotFoundError',
    ];

    function patchedConsoleError(...args) {
      const first = String(args[0] || '');
      const isSuppressed = suppressedMessages.some((pattern) =>
        first.includes(pattern)
      );
      if (!isSuppressed) {
        originalConsoleError.apply(console, args);
      }
    }

    console.error = patchedConsoleError;

    // Install listeners
    window.addEventListener('error', handleError, true);
    window.addEventListener('unhandledrejection', handleUnhandledRejection, true);

    // Cleanup
    return () => {
      window.removeEventListener('error', handleError, true);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection, true);
      console.error = originalConsoleError;
      mutationObserver?.disconnect();
    };
  }, []);

  return null;
}
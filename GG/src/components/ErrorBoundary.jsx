'use client';

import { Component } from 'react';

/**
 * React Error Boundary that catches rendering errors and
 * displays a fallback UI instead of crashing the page.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <RiskyComponent />
 *   </ErrorBoundary>
 *
 *   <ErrorBoundary fallback={<CustomFallback />}>
 *     <RiskyComponent />
 *   </ErrorBoundary>
 */

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log to error reporting service (e.g., Sentry, Vercel Analytics)
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'exception', {
        description: error?.message || 'Unknown error',
        fatal: false,
      });
    }

    // Suppress known extension/DOM errors
    const message = String(error?.message || '');
    const stack = String(error?.stack || '');

    const isExtensionError =
      message.includes('insertBefore') ||
      message.includes('removeChild') ||
      message.includes('appendChild') ||
      message.includes('Failed to execute') ||
      stack.includes('chrome-extension://') ||
      stack.includes('moz-extension://') ||
      stack.includes('translate.googleapis');

    if (isExtensionError) {
      // Don't show error UI for extension-caused errors
      this.setState({ hasError: false, error: null });
      return;
    }

    // Log non-extension errors
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="rounded border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="text-sm font-semibold text-amber-800">
            Something went wrong rendering this section.
          </p>
          <p className="mt-1 text-xs text-amber-700">
            {this.state.error?.message
              ? `Error: ${this.state.error.message.slice(0, 120)}`
              : 'An unexpected error occurred.'}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="mt-3 inline-flex h-8 items-center justify-center rounded border border-amber-300 bg-white px-4 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
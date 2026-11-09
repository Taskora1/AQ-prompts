import React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

/**
 * Breadcrumb component for navigation
 * @param {Array} items - Array of breadcrumb items
 * @param {string} items[].label - Display text for the breadcrumb
 * @param {string} items[].href - URL for the breadcrumb (optional for current page)
 */
const Breadcrumb = ({ items }) => {
  if (!items || items.length === 0) {
    return null;
  }

  const truncateText = (text, maxLength = 40) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength).trim() + '...';
  };

  return (
    <nav className="flex items-center space-x-1 text-sm" aria-label="Breadcrumb">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        const truncatedLabel = truncateText(item.label);
        
        return (
          <React.Fragment key={index}>
            {index > 0 && (
              <ChevronRight className="h-4 w-4 text-[var(--text-secondary)] flex-shrink-0" />
            )}
            
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="text-[var(--text-secondary)] hover:text-[var(--accent-color)] transition-colors duration-200"
              >
                {truncatedLabel}
              </Link>
            ) : (
              <span className="text-[var(--text-secondary)] font-medium">
                {truncatedLabel}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
};

export default Breadcrumb;

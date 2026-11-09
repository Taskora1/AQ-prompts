'use client';

import { useState } from 'react';

export default function StarRatingInput({ legend, name = 'rating' }) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const displayedRating = hoverRating || rating;

  return (
    <fieldset className="mt-4">
      <legend className="text-sm font-semibold text-slate-800 dark:text-slate-200">{legend}</legend>
      <div className="mt-2 flex gap-1" role="radiogroup" aria-label={legend}>
        {[1, 2, 3, 4, 5].map((value) => (
          <label
            key={value}
            className="cursor-pointer rounded-md px-1 py-0.5 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#c2410c]"
            onMouseEnter={() => setHoverRating(value)}
            onMouseLeave={() => setHoverRating(0)}
          >
            <input
              className="sr-only"
              type="radio"
              name={name}
              value={value}
              required
              checked={rating === value}
              aria-label={`${value} ${value === 1 ? 'star' : 'stars'}`}
              onChange={() => setRating(value)}
            />
            <span
              aria-hidden="true"
              className={`text-3xl leading-none transition-colors ${
                value <= displayedRating ? 'text-amber-500' : 'text-slate-300 dark:text-slate-600'
              }`}
            >
              ★
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

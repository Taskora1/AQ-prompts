/** @type {import('tailwindcss').Config} */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const plugin = require('tailwindcss/plugin');
const animate = require('tailwindcss-animate');

let typographyPlugin = null;

try {
  typographyPlugin = require('@tailwindcss/typography');
} catch (error) {
  typographyPlugin = plugin(() => {});
}

export default {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: {
        '2xl': '1280px',
      },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        canvas: {
          DEFAULT: '#ffffff',
          subtle: '#f8fafc',
          dark: '#09090b',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xl: '1rem',
        '2xl': '1.5rem',
      },
      boxShadow: {
        premium: '0 10px 40px rgba(15, 23, 42, 0.08)',
        elevated: '0 22px 60px rgba(15, 23, 42, 0.12)',
      },
      transitionTimingFunction: {
        premium: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Arial', 'Helvetica', 'sans-serif'],
      },
      typography: ({ theme }) => ({
        DEFAULT: {
          css: {
            color: theme('colors.slate.700'),
            maxWidth: '65ch',
            lineHeight: '1.75',
            fontFeatureSettings: '"kern" 1, "liga" 1, "calt" 1',
            '> * + *': {
              marginTop: '1.25em',
            },
            h1: {
              color: theme('colors.slate.950'),
              fontWeight: '700',
              letterSpacing: '-0.02em',
              lineHeight: '1.2',
              textWrap: 'pretty',
            },
            h2: {
              color: theme('colors.slate.950'),
              fontWeight: '700',
              letterSpacing: '-0.02em',
              lineHeight: '1.2',
              textWrap: 'pretty',
            },
            h3: {
              color: theme('colors.slate.950'),
              fontWeight: '700',
              letterSpacing: '-0.02em',
              lineHeight: '1.2',
              textWrap: 'pretty',
            },
            h4: {
              color: theme('colors.slate.900'),
              fontWeight: '700',
              letterSpacing: '-0.02em',
              lineHeight: '1.25',
            },
            a: {
              color: theme('colors.slate.950'),
              textDecoration: 'none',
              fontWeight: '600',
              backgroundImage: `linear-gradient(${theme('colors.slate.950')}, ${theme('colors.slate.950')})`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: '0 100%',
              backgroundSize: '100% 1px',
              transition: 'color 200ms cubic-bezier(0.22, 1, 0.36, 1), background-size 200ms cubic-bezier(0.22, 1, 0.36, 1)',
            },
            'a:hover': {
              color: theme('colors.slate.700'),
              backgroundSize: '100% 2px',
            },
            code: {
              color: theme('colors.slate.900'),
              backgroundColor: theme('colors.slate.100'),
              borderRadius: theme('borderRadius.lg'),
              paddingInline: '0.4rem',
              paddingBlock: '0.18rem',
              fontWeight: '500',
            },
            'code::before': { content: 'none' },
            'code::after': { content: 'none' },
            blockquote: {
              color: theme('colors.slate.700'),
              borderLeftColor: theme('colors.slate.200'),
            },
            img: {
              borderRadius: theme('borderRadius.xl'),
            },
            hr: {
              borderColor: theme('colors.slate.200'),
              marginTop: '3rem',
              marginBottom: '3rem',
            },
          },
        },
        invert: {
          css: {
            color: theme('colors.zinc.300'),
            h1: { color: theme('colors.white') },
            h2: { color: theme('colors.white') },
            h3: { color: theme('colors.white') },
            h4: { color: theme('colors.zinc.100') },
            a: {
              color: theme('colors.white'),
              backgroundImage: `linear-gradient(${theme('colors.zinc.100')}, ${theme('colors.zinc.100')})`,
            },
            'a:hover': {
              color: theme('colors.zinc.300'),
            },
            code: {
              color: theme('colors.zinc.100'),
              backgroundColor: 'rgba(255,255,255,0.08)',
            },
            blockquote: {
              color: theme('colors.zinc.300'),
              borderLeftColor: 'rgba(255,255,255,0.12)',
            },
            hr: {
              borderColor: 'rgba(255,255,255,0.12)',
            },
          },
        },
      }),
      keyframes: {
        'accordion-down': {
          from: { height: 0 },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: 0 },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [animate, typographyPlugin],
};

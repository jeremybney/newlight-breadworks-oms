import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        cream: {
          50: '#fefdfa',
          100: '#f6f3e9',
          200: '#efe9d6',
          300: '#e5dcbc',
        },
        wheat: {
          400: '#edc79a',
          500: '#e5b478',
          600: '#c8944f',
          700: '#a6753a',
        },
        bark: {
          800: '#1f4870',
          900: '#102338',
        },
        sage: {
          400: '#c3dbce',
          500: '#9cc2b0',
          600: '#74a28e',
        },
        ember: {
          400: '#b15048',
          500: '#8f332e',
          600: '#6e2621',
        }
      },
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
        mono: ['var(--font-mono)'],
      },
      backgroundImage: {
        'grain': "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E\")",
      }
    },
  },
  plugins: [],
}
export default config

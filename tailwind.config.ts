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
          50: '#fefdf8',
          100: '#fdf9ed',
          200: '#f9f0d3',
          300: '#f3e4b0',
        },
        wheat: {
          400: '#c8956c',
          500: '#b07848',
          600: '#8a5e38',
          700: '#6b4828',
        },
        bark: {
          800: '#2c1a0e',
          900: '#1a0f08',
        },
        sage: {
          400: '#7a9e7e',
          500: '#5c7f61',
          600: '#456048',
        },
        ember: {
          400: '#e8632a',
          500: '#d4501a',
          600: '#b84315',
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

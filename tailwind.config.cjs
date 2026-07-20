/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './hooks/**/*.{js,ts,jsx,tsx}',
    './pricing-processor/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  safelist: ['text-left', 'text-center', 'text-right'],
  theme: {
    extend: {
      colors: {
        gp: {
          bg: 'var(--color-gp-black)',
          black: 'var(--color-gp-black)',
          dark: 'var(--color-gp-dark)',
          panel: 'var(--color-gp-panel)',
          border: 'var(--color-gp-border)',
          text: {
            main: 'var(--color-gp-text-main)',
            muted: 'var(--color-gp-text-muted)'
          },
          input: 'var(--color-gp-input)',
          overlay: 'var(--color-gp-overlay)',
          silver: '#a0a0a0',
          red: '#e40000',
          redHover: '#bd0000'
        }
      },
      fontFamily: {
        sans: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Oswald', 'Arial Narrow', 'ui-sans-serif', 'sans-serif']
      },
      keyframes: {
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(0.5rem)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        }
      },
      animation: {
        'fade-in-up': 'fade-in-up 220ms cubic-bezier(0.2, 0.8, 0.2, 1)'
      }
    }
  },
  plugins: []
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: {
    relative: true,
    files: [
      './index.html',
      './*.{js,ts,jsx,tsx}',
      './components/**/*.{js,ts,jsx,tsx}',
      '!./**/*.test.{js,ts,jsx,tsx}'
    ]
  },
  // InventoryView builds text-${align}; these are its actual header values.
  safelist: ['text-left', 'text-center', 'text-right'],
  theme: {
    extend: {
      colors: {
        gp: {
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
          silver: '#A0A0A0',
          red: '#FF0000',
          redHover: '#CC0000'
        }
      },
      fontFamily: {
        sans: ['Manrope', 'sans-serif'],
        display: ['Oswald', 'sans-serif']
      }
    }
  }
};

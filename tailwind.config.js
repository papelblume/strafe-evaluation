/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'primary':   'var(--color-primary)',
        'accent':    'var(--color-accent)',
        'secondary': 'var(--color-secondary)',
        'dark':      'var(--color-dark)',
        'bright':    'var(--color-bright)',
      },
    },
  },
  plugins: [],
}

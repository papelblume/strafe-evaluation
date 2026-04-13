/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'primary':   'rgb(var(--color-primary) / <alpha-value>)',
        'accent':    'rgb(var(--color-accent) / <alpha-value>)',
        'secondary': 'rgb(var(--color-secondary) / <alpha-value>)',
        'dark':      'rgb(var(--color-dark) / <alpha-value>)',
        'bright':    'rgb(var(--color-bright) / <alpha-value>)',
      },
    },
  },
  plugins: [],
}

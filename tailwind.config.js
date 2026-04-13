/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'primary':   '#5a7a45',
        'accent':    '#4a7a6e',
        'secondary': '#2a3528',
        'dark':      '#d4d4d4',
        'bright':    '#1a1a1a',
      },
    },
  },
  plugins: [],
}

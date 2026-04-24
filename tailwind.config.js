/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',   // ← Added this line (required for dark/bright toggle)
  theme: {
    extend: {
      colors: {
        'primary': '#6db85c',
        'accent': '#647858',
        'secondary': '#647058',
        'dark': '#4a5240',      // bg in dark mode / text in light mode
        'bright': '#e8ead4',    // text in dark mode / bg in light mode
      },
    },
  },
  plugins: [],
}

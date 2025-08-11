/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        geist: ['Geist', 'sans-serif'],
      },
      colors: {
        black: {
          pure: '#000000',
          90: '#0A0A0A',
        },
        charcoal: {
          dark: '#1C1C1C',
          DEFAULT: '#2A2A2A',
          light: '#383838',
          lighter: '#464646',
        },
        lime: {
          primary: '#84CC16',
          bright: '#A3E635',
          light: '#BEF264',
          dark: '#65A30D',
        },
      },
    },
  },
  plugins: [],
}



/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Dawaa Pharmacy brand colors
        navy: {
          900: '#061827', // Dark navy for headers
          800: '#0A2338',
        },
        teal: {
          50: '#EAF8F8', // Very light teal for backgrounds
          100: '#D3F1F1',
          200: '#A8E3E3',
          300: '#6FD0D0',
          400: '#00B8A9', // Lighter teal
          500: '#008E92', // Main teal/turquoise for buttons
          600: '#05777B', // Darker teal for hover
          700: '#045F63',
          800: '#04494C',
          900: '#033638',
        },
        green: {
          500: '#10B981', // Clear green for success
          600: '#059669',
        },
        red: {
          500: '#EF4444', // Red for warnings
          600: '#DC2626',
        },
      },
    },
  },
  plugins: [],
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,ts}"],
  theme: {
    extend: {
      colors: {
        // Rentify Green Design System
        primary: {
          DEFAULT: '#00A651',
          dark:    '#008C44',
          light:   '#E8F8EF',
          xl:      '#F0FBF5',
        },
        accent: { DEFAULT: '#FF6B35' },
        dark: {
          DEFAULT: '#0D1B2A',
          2:       '#132236',
          3:       '#1A2E42',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        sm:   '8px',
        md:   '12px',
        lg:   '16px',
        xl:   '20px',
        full: '999px',
      },
      boxShadow: {
        green: '0 4px 20px rgba(0, 166, 81, 0.25)',
        card:  '0 2px 8px rgba(0, 0, 0, 0.06)',
        md:    '0 4px 20px rgba(0, 0, 0, 0.09)',
      },
    },
  },
  plugins: [],
};

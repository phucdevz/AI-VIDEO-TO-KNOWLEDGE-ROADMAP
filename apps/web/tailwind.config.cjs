/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('@ether/design-tokens')],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  plugins: [require('@tailwindcss/forms')],
  theme: {
    extend: {
      colors: {
        ds: {
          primary: '#7c4dff',
          secondary: '#00e5ff',
          bg: '#0a192f',
          'text-primary': '#e6f1ff',
          'text-secondary': '#8892b0',
          border: 'rgba(136, 146, 176, 0.2)',
        },
      },
      maxWidth: {
        ds: '1440px',
      },
      borderRadius: {
        'ds-lg': '16px',
        'ds-sm': '8px',
      },
      boxShadow: {
        'ds-soft': '0 4px 30px rgba(0, 0, 0, 0.1)',
      },
      transitionDuration: {
        ds: '200ms',
      },
      transitionTimingFunction: {
        'ds-in-out': 'ease-in-out',
      },
      fontSize: {
        'ds-base': ['16px', { lineHeight: '1.5' }],
      },
    },
  },
};

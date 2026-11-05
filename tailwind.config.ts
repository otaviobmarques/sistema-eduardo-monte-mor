import type { Config } from 'tailwindcss';

// Tokens do Design System Auto Visão v1.1 (seção 10 do briefing)
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { red: '#ED3237', graphite: '#373435' },
        action: { DEFAULT: '#C9232C', hover: '#B51C25', pressed: '#A21B23' },
        impact: '#151415',
        text: { DEFAULT: '#373435', secondary: '#696267' },
        border: '#8C8288',
        divider: '#DED8DC',
        surface: '#F6F4F5',
        ok: { DEFAULT: '#18743B', bg: '#EDF8F0' },
        warn: { DEFAULT: '#805500', bg: '#FFF6DE' },
        error: { DEFAULT: '#B42318', bg: '#FFF0ED' },
        info: { DEFAULT: '#165EA8', bg: '#EFF6FF' },
      },
      fontFamily: {
        display: ['var(--font-nunito)', 'Nunito', 'sans-serif'],
        body: ['var(--font-inter)', 'Inter', 'sans-serif'],
      },
      borderRadius: { campo: '8px', card: '12px', painel: '16px', hero: '24px' },
      height: { btn: '48px', 'btn-sm': '40px', campo: '48px', placa: '64px' },
      minHeight: { toque: '44px' },
    },
  },
  plugins: [],
} satisfies Config;

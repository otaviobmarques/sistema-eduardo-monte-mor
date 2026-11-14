import type { Config } from 'tailwindcss';

// Tokens do Design System Auto Visão v1.1 (seção 10 do briefing)
const v = (nome: string) => `rgb(var(--c-${nome}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Cores neutras e de feedback vêm de variáveis CSS (globals.css) para o modo noturno; marca e ações são fixas
      colors: {
        brand: { red: '#ED3237', graphite: '#373435' },
        action: { DEFAULT: '#C9232C', hover: '#B51C25', pressed: '#A21B23' },
        impact: v('impact'),
        text: { DEFAULT: v('text'), secondary: v('text-secondary') },
        border: v('border'),
        divider: v('divider'),
        surface: v('surface'),
        ok: { DEFAULT: v('ok'), bg: v('ok-bg') },
        warn: { DEFAULT: v('warn'), bg: v('warn-bg') },
        error: { DEFAULT: v('error'), bg: v('error-bg') },
        info: { DEFAULT: v('info'), bg: v('info-bg') },
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

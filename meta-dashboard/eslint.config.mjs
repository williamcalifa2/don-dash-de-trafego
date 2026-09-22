import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', '.vercel/**', 'node_modules/**', 'next-env.d.ts', 'tests/**']),
  {
    rules: {
      // Padrão do projeto: hooks de dados chamam load() no efeito. Regras de hooks que pegam bug de verdade seguem como erro.
      'react-hooks/set-state-in-effect': 'off',
      '@next/next/no-location-assign-relative-destination': 'off', // troca de sessão (admin/cliente) precisa de recarga completa
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@next/next/no-img-element': 'off', // logos são data URLs, next/image não ajuda
    },
  },
])

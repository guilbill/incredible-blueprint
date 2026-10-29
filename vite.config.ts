import { resolve } from 'node:path'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Relative URLs, so the game also works from a sub-path (e.g. GitHub Pages /incredible-machine-tribute/).
  base: './',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'Machine Incroyable Tribute',
        short_name: 'MIT',
        description: 'Un jeu de casse-tête physique, hommage à The Incredible Machine.',
        lang: 'fr',
        theme_color: '#0e2a4a',
        background_color: '#0e2a4a',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Levels are bundled in the JS (eager import.meta.glob); the hash route (#l=...) is served by index.html.
        globPatterns: ['**/*.{js,css,html,svg,json,webmanifest}'],
        globIgnores: ['determinism.html'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/determinism\.html/],
      },
    }),
  ],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        determinism: resolve(import.meta.dirname, 'determinism.html'),
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    // Tests read the French text the game shipped with.
    setupFiles: ['tests/setup.ts'],
  },
})

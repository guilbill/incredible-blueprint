import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  reporter: 'list',
  use: { baseURL: 'http://localhost:4173' },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/determinism.html',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /touch/ },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testIgnore: /touch/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testIgnore: /touch/ },
    // real touch input needs the DevTools protocol, so Chromium only
    { name: 'tablet', use: { ...devices['Galaxy Tab S4 landscape'] }, testMatch: /touch/ },
  ],
})

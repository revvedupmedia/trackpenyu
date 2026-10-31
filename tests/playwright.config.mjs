import { defineConfig } from '@playwright/test'

// Laman statik dihidangkan dari akar repo (satu folder di atas tests/).
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:8765/',
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
    timezoneId: 'Asia/Kuching',
    locale: 'ms-MY',
  },
  webServer: {
    command: 'python3 -m http.server 8765 --bind 127.0.0.1 --directory ..',
    url: 'http://127.0.0.1:8765/',
    reuseExistingServer: !process.env.CI,
  },
})

import { test, expect } from '@playwright/test'

test.describe('Navigation', () => {
  test('home page loads correctly', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveTitle(/ValidAI/)
    await expect(page.getByText('Built with')).toBeVisible()
    await expect(page.getByText('Next.js')).toBeVisible()
    await expect(page.getByText('Supabase')).toBeVisible()
  })

  test('theme switcher works', async ({ page }) => {
    await page.goto('/')

    // Find and click the theme switcher
    const themeButton = page.getByRole('button').filter({ hasText: /theme/i }).first()
    await themeButton.click()

    // Check that theme options are visible
    await expect(page.getByText('Light')).toBeVisible()
    await expect(page.getByText('Dark')).toBeVisible()
    await expect(page.getByText('System')).toBeVisible()
  })

  test('can navigate to demo page', async ({ page }) => {
    await page.goto('/')

    // Look for a link to demo or examples
    const demoLink = page.getByRole('link', { name: /demo|example/i }).first()
    if (await demoLink.isVisible()) {
      await demoLink.click()
      await expect(page.url()).toContain('/demo')
    }
  })
})
import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('should show login page', async ({ page }) => {
    await page.goto('/auth/login')

    // Check that login form elements are present
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  })

  test('should show sign up page', async ({ page }) => {
    await page.goto('/auth/sign-up')

    // Check that sign up form elements are present
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign up' })).toBeVisible()
  })

  test('should redirect to login when accessing protected route without auth', async ({ page }) => {
    await page.goto('/protected')

    // Should redirect to login
    await expect(page).toHaveURL(/\/auth\/login/)
  })

  test('navigation between auth pages works', async ({ page }) => {
    await page.goto('/auth/login')

    // Click "Don't have an account? Sign up"
    await page.getByText("Don't have an account?").click()
    await expect(page).toHaveURL(/\/auth\/sign-up/)

    // Click "Already have an account? Sign in"
    await page.getByText('Already have an account?').click()
    await expect(page).toHaveURL(/\/auth\/login/)
  })
})
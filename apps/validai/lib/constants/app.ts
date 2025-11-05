export const APP_CONFIG = {
  name: process.env.NEXT_PUBLIC_APP_NAME || 'SanityCheck',
  description: process.env.NEXT_PUBLIC_APP_DESCRIPTION || 'AI-powered sanity checking platform',
  tagline: process.env.NEXT_PUBLIC_APP_TAGLINE || 'The fastest way to sanity check with AI',
  url: process.env.NEXT_PUBLIC_APP_URL || 'https://sanitycheck.com',
} as const;

export const { name: APP_NAME, description: APP_DESCRIPTION, tagline: APP_TAGLINE, url: APP_URL } = APP_CONFIG;
export const APP_CONFIG = {
  name: process.env.NEXT_PUBLIC_APP_NAME || 'ValidAI',
  description: process.env.NEXT_PUBLIC_APP_DESCRIPTION || 'AI-powered validation platform',
  tagline: process.env.NEXT_PUBLIC_APP_TAGLINE || 'The fastest way to validate with AI',
  url: process.env.NEXT_PUBLIC_APP_URL || 'https://validai.com',
} as const;

export const { name: APP_NAME, description: APP_DESCRIPTION, tagline: APP_TAGLINE, url: APP_URL } = APP_CONFIG;
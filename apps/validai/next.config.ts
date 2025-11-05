import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  // Transpile workspace packages to fix Radix UI context issues
  // See: Phase 4 Task 4 integration - Dialog, Switch, DropdownMenu rendering issues
  transpilePackages: ['@playze/shared-ui', '@playze/shared-auth', '@playze/shared-types'],

  // Security headers with environment-aware configuration
  // Development: Permissive CSP for HMR, no HTTPS enforcement
  // Production: Strict CSP, HTTPS enforcement, maximum security
  async headers() {
    const isProduction = process.env.NODE_ENV === 'production'
    const isDevelopment = process.env.NODE_ENV === 'development'

    return [
      {
        // Apply to all routes
        source: '/:path*',
        headers: [
          {
            // Prevent clickjacking attacks by disallowing embedding in iframes
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            // Prevent MIME type sniffing
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            // Control referrer information sent to other sites
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          // HSTS: Only in production (requires valid SSL certificate)
          ...(isProduction ? [{
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          }] : []),
          {
            // Restrict browser features (camera, microphone, geolocation, etc.)
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          {
            // Content Security Policy (ENFORCE MODE - Active Protection)
            // Environment-aware: Permissive in dev, strict in production
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Scripts: Always allow unsafe-inline (required for Next.js), unsafe-eval only in dev (for HMR)
              `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
              // Styles: Always allow unsafe-inline (required for Radix UI/shadcn)
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              // Images: Self + data URIs + Supabase Storage
              "img-src 'self' data: https://xczippkxxdqlvaacjexj.supabase.co",
              // Fonts: Self + data URIs + Google Fonts
              "font-src 'self' data: https://fonts.gstatic.com",
              // Connect: Self + Supabase API (database, auth, storage, realtime)
              "connect-src 'self' https://xczippkxxdqlvaacjexj.supabase.co wss://xczippkxxdqlvaacjexj.supabase.co",
              // Frames: None allowed
              "frame-src 'none'",
              // Objects: None allowed
              "object-src 'none'",
              // Base URI: Restrict to same origin
              "base-uri 'self'",
              // Form actions: Only submit to same origin
              "form-action 'self'",
              // Frame ancestors: None (prevent embedding)
              "frame-ancestors 'none'",
              // Upgrade insecure requests: Only in production (forces HTTPS)
              ...(isProduction ? ["upgrade-insecure-requests"] : []),
            ].filter(Boolean).join('; '),
          }
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);

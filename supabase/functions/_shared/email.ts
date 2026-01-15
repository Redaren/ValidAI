/**
 * Email Service for Edge Functions
 * Uses Brevo SMTP API for sending transactional emails
 *
 * Required environment secrets:
 * - BREVO_API_KEY: Brevo API key
 * - EMAIL_FROM: Sender email address (optional, defaults to noreply@playze.com)
 * - EMAIL_FROM_NAME: Sender display name (optional, defaults to Playze)
 */

interface EmailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

interface EmailResult {
  success: boolean
  messageId?: string
  error?: string
}

/**
 * Send email via Brevo SMTP API
 *
 * @param options - Email options (to, subject, html, text)
 * @returns Result with success status and optional error message
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY')
  const FROM_EMAIL = Deno.env.get('EMAIL_FROM') || 'noreply@playze.com'
  const FROM_NAME = Deno.env.get('EMAIL_FROM_NAME') || 'Playze'

  if (!BREVO_API_KEY) {
    console.error('BREVO_API_KEY not configured in environment secrets')
    return { success: false, error: 'Email service not configured' }
  }

  try {
    console.log(`Sending email to ${options.to}: ${options.subject}`)

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        sender: { name: FROM_NAME, email: FROM_EMAIL },
        to: [{ email: options.to }],
        subject: options.subject,
        htmlContent: options.html,
        textContent: options.text || stripHtml(options.html)
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Brevo API error:', response.status, errorText)
      return { success: false, error: `Email API error: ${response.status}` }
    }

    const result = await response.json()
    console.log(`Email sent successfully, messageId: ${result.messageId}`)

    return { success: true, messageId: result.messageId }
  } catch (error) {
    console.error('Email send error:', error)
    return { success: false, error: 'Email service error' }
  }
}

/**
 * Strip HTML tags to create plain text version
 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ============================================
// Email Templates
// ============================================

/**
 * Email template for notifying existing users they've been added to an organization
 */
export function organizationAssignedEmail(params: {
  organizationName: string
  role: string
  appName: string
  appUrl: string
}): { subject: string; html: string } {
  const { organizationName, role, appName, appUrl } = params

  return {
    subject: `You've been added to ${organizationName}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      margin: 0;
      padding: 0;
      background-color: #f3f4f6;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    .card {
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      padding: 40px;
    }
    .header {
      text-align: center;
      margin-bottom: 32px;
    }
    .header h1 {
      font-size: 24px;
      font-weight: 600;
      color: #111827;
      margin: 0;
    }
    .content {
      background: #f9fafb;
      border-radius: 8px;
      padding: 24px;
      margin-bottom: 32px;
    }
    .content p {
      margin: 0 0 12px 0;
    }
    .content p:last-child {
      margin-bottom: 0;
    }
    .role-badge {
      display: inline-block;
      background: #dbeafe;
      color: #1e40af;
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 14px;
      font-weight: 500;
      text-transform: capitalize;
    }
    .button-container {
      text-align: center;
      margin-bottom: 32px;
    }
    .button {
      display: inline-block;
      background: #2563eb;
      color: #ffffff !important;
      padding: 14px 28px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 500;
      font-size: 16px;
    }
    .button:hover {
      background: #1d4ed8;
    }
    .footer {
      text-align: center;
      color: #6b7280;
      font-size: 14px;
    }
    .footer p {
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <h1>You've been added to ${escapeHtml(organizationName)}</h1>
      </div>
      <div class="content">
        <p>An administrator has added you to <strong>${escapeHtml(organizationName)}</strong>.</p>
        <p>Your role: <span class="role-badge">${escapeHtml(role)}</span></p>
        <p>You now have access to ${escapeHtml(appName)} with this organization.</p>
      </div>
      <div class="button-container">
        <a href="${escapeHtml(appUrl)}" class="button">Open ${escapeHtml(appName)}</a>
      </div>
      <div class="footer">
        <p>If you didn't expect this, you can safely ignore this email.</p>
      </div>
    </div>
  </div>
</body>
</html>
    `.trim()
  }
}

/**
 * Email template for inviting new users to sign up and join an organization
 * Note: This is typically handled by Supabase Auth's inviteUserByEmail,
 * but available here for custom flows if needed.
 */
export function newUserInviteEmail(params: {
  organizationName: string
  role: string
  appName: string
  signupUrl: string
  inviterName?: string
}): { subject: string; html: string } {
  const { organizationName, role, appName, signupUrl, inviterName } = params

  return {
    subject: `You're invited to join ${organizationName}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      margin: 0;
      padding: 0;
      background-color: #f3f4f6;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    .card {
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      padding: 40px;
    }
    .header {
      text-align: center;
      margin-bottom: 32px;
    }
    .header h1 {
      font-size: 24px;
      font-weight: 600;
      color: #111827;
      margin: 0;
    }
    .content {
      background: #f9fafb;
      border-radius: 8px;
      padding: 24px;
      margin-bottom: 32px;
    }
    .content p {
      margin: 0 0 12px 0;
    }
    .content p:last-child {
      margin-bottom: 0;
    }
    .role-badge {
      display: inline-block;
      background: #dbeafe;
      color: #1e40af;
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 14px;
      font-weight: 500;
      text-transform: capitalize;
    }
    .button-container {
      text-align: center;
      margin-bottom: 32px;
    }
    .button {
      display: inline-block;
      background: #2563eb;
      color: #ffffff !important;
      padding: 14px 28px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 500;
      font-size: 16px;
    }
    .footer {
      text-align: center;
      color: #6b7280;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <h1>You're invited to join ${escapeHtml(organizationName)}</h1>
      </div>
      <div class="content">
        ${inviterName ? `<p>${escapeHtml(inviterName)} has invited you to join <strong>${escapeHtml(organizationName)}</strong>.</p>` : `<p>You've been invited to join <strong>${escapeHtml(organizationName)}</strong>.</p>`}
        <p>Your role: <span class="role-badge">${escapeHtml(role)}</span></p>
        <p>Click below to create your account and get started with ${escapeHtml(appName)}.</p>
      </div>
      <div class="button-container">
        <a href="${escapeHtml(signupUrl)}" class="button">Accept Invitation</a>
      </div>
      <div class="footer">
        <p>This invitation will expire in 7 days.</p>
        <p>If you didn't expect this, you can safely ignore this email.</p>
      </div>
    </div>
  </div>
</body>
</html>
    `.trim()
  }
}

/**
 * Email template for inviting existing users to join an organization
 * Unlike organizationAssignedEmail (which implies direct assignment),
 * this is for the self-service flow where users need to accept the invitation.
 */
export function existingUserInviteEmail(params: {
  organizationName: string
  role: string
  appName: string
  acceptUrl: string
  inviterName?: string
}): { subject: string; html: string } {
  const { organizationName, role, appName, acceptUrl, inviterName } = params

  return {
    subject: `You've been invited to join ${organizationName}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      margin: 0;
      padding: 0;
      background-color: #f3f4f6;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    .card {
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      padding: 40px;
    }
    .header {
      text-align: center;
      margin-bottom: 32px;
    }
    .header h1 {
      font-size: 24px;
      font-weight: 600;
      color: #111827;
      margin: 0;
    }
    .content {
      background: #f9fafb;
      border-radius: 8px;
      padding: 24px;
      margin-bottom: 32px;
    }
    .content p {
      margin: 0 0 12px 0;
    }
    .content p:last-child {
      margin-bottom: 0;
    }
    .role-badge {
      display: inline-block;
      background: #dbeafe;
      color: #1e40af;
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 14px;
      font-weight: 500;
      text-transform: capitalize;
    }
    .button-container {
      text-align: center;
      margin-bottom: 32px;
    }
    .button {
      display: inline-block;
      background: #2563eb;
      color: #ffffff !important;
      padding: 14px 28px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 500;
      font-size: 16px;
    }
    .footer {
      text-align: center;
      color: #6b7280;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <h1>You've been invited to join ${escapeHtml(organizationName)}</h1>
      </div>
      <div class="content">
        ${inviterName ? `<p>${escapeHtml(inviterName)} has invited you to join <strong>${escapeHtml(organizationName)}</strong>.` : `<p>You've been invited to join <strong>${escapeHtml(organizationName)}</strong>.</p>`}
        <p>Your role: <span class="role-badge">${escapeHtml(role)}</span></p>
        <p>Click below to accept and get started with ${escapeHtml(appName)}.</p>
      </div>
      <div class="button-container">
        <a href="${escapeHtml(acceptUrl)}" class="button">Accept Invitation</a>
      </div>
      <div class="footer">
        <p>This invitation will expire in 7 days.</p>
        <p>If you didn't expect this, you can safely ignore this email.</p>
      </div>
    </div>
  </div>
</body>
</html>
    `.trim()
  }
}

/**
 * Escape HTML special characters to prevent XSS
 */
function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }
  return text.replace(/[&<>"']/g, char => htmlEntities[char])
}

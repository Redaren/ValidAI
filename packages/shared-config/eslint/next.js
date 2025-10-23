const { dirname } = require('path')
const { FlatCompat } = require('@eslint/eslintrc')

const compat = new FlatCompat({
  baseDirectory: __dirname,
})

module.exports = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // Warn when creating API routes (Supabase anti-pattern)
      'no-restricted-syntax': [
        'warn',
        {
          selector: "Program > ExportNamedDeclaration[declaration.type='FunctionDeclaration'][declaration.id.name=/^(GET|POST|PUT|DELETE|PATCH)$/]",
          message: "Avoid creating Next.js API routes. Use PostgREST, database functions, or Edge Functions instead. See @playze/shared-auth decision tree.",
        },
      ],
    },
  },
]

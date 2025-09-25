import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'

const config = buildConfig({
  secret: process.env.PAYLOAD_SECRET!,

  // Use separate schema
  db: postgresAdapter({
    pool: {
      connectionString: process.env.PAYLOAD_DATABASE_URI!,
    },
    schemaName: 'payload',
  }),

  // Collections
  collections: [
    // Users collection for admin authentication
    {
      slug: 'users',
      auth: true,
      fields: [
        {
          name: 'name',
          type: 'text',
          required: true,
        },
      ],
    },
    // Pages collection for content
    {
      slug: 'pages',
      fields: [
        {
          name: 'title',
          type: 'text',
          required: true,
        },
        {
          name: 'slug',
          type: 'text',
          required: true,
          unique: true,
        },
        {
          name: 'content',
          type: 'richText',
          editor: lexicalEditor(),
        },
      ],
    },
  ],

  // Admin configuration
  admin: {
    user: 'users',
    autoLogin: false,
  },

  telemetry: false,
})

export default Promise.resolve(config)
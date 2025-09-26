import { buildConfig, Block, GlobalConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { seoPlugin } from '@payloadcms/plugin-seo'

// Hero Block configuration (inline for now)
const HeroBlock: Block = {
  slug: 'hero',
  labels: {
    singular: 'Hero',
    plural: 'Heroes',
  },
  fields: [
    {
      name: 'heading',
      type: 'text',
      required: true,
    },
    {
      name: 'subheading',
      type: 'textarea',
    },
  ],
}

// Content Block configuration
const ContentBlock: Block = {
  slug: 'content',
  labels: {
    singular: 'Content',
    plural: 'Content Blocks',
  },
  fields: [
    {
      name: 'content',
      type: 'richText',
      editor: lexicalEditor(),
      required: true,
    },
  ],
}

// Media Block configuration
const MediaBlock: Block = {
  slug: 'mediaBlock',
  labels: {
    singular: 'Media',
    plural: 'Media Blocks',
  },
  fields: [
    {
      name: 'media',
      type: 'upload',
      relationTo: 'media',
      required: true,
    },
    {
      name: 'caption',
      type: 'text',
    },
  ],
}

// Call to Action Block configuration
const CallToActionBlock: Block = {
  slug: 'callToAction',
  labels: {
    singular: 'Call to Action',
    plural: 'Call to Action Blocks',
  },
  fields: [
    {
      name: 'text',
      type: 'text',
      required: true,
    },
    {
      name: 'link',
      type: 'text',
      required: true,
    },
  ],
}

// Header Global configuration
const Header: GlobalConfig = {
  slug: 'header',
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'navigation',
      type: 'array',
      fields: [
        {
          name: 'label',
          type: 'text',
          required: true,
        },
        {
          name: 'link',
          type: 'text',
          required: true,
        },
      ],
    },
  ],
}

// Footer Global configuration
const Footer: GlobalConfig = {
  slug: 'footer',
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'copyrightText',
      type: 'text',
      defaultValue: '© 2024 ValidAI. All rights reserved.',
    },
    {
      name: 'socialLinks',
      type: 'array',
      fields: [
        {
          name: 'platform',
          type: 'select',
          options: [
            { label: 'Twitter', value: 'twitter' },
            { label: 'LinkedIn', value: 'linkedin' },
            { label: 'GitHub', value: 'github' },
            { label: 'Facebook', value: 'facebook' },
          ],
          required: true,
        },
        {
          name: 'url',
          type: 'text',
          required: true,
        },
      ],
    },
  ],
}

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
    // Categories collection for content organization
    {
      slug: 'categories',
      admin: {
        useAsTitle: 'title',
      },
      access: {
        read: () => true,
      },
      fields: [
        {
          name: 'title',
          type: 'text',
          required: true,
        },
        {
          name: 'description',
          type: 'textarea',
        },
      ],
    },
    // Posts collection with draft/publish workflow
    {
      slug: 'posts',
      admin: {
        useAsTitle: 'title',
        defaultColumns: ['title', 'slug', 'publishedAt'],
      },
      versions: {
        drafts: {
          autosave: {
            interval: 2000, // Auto-save every 2 seconds
          },
        },
        maxPerDoc: 10, // Keep 10 versions per document
      },
      access: {
        read: ({ req }) => {
          // If user is logged in, show all
          if (req.user) return true;
          // Otherwise, only show published
          return {
            _status: {
              equals: 'published',
            },
          }
        },
      },
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
          admin: {
            position: 'sidebar',
          },
        },
        {
          name: 'excerpt',
          type: 'textarea',
          admin: {
            description: 'Brief summary of the post',
          },
        },
        {
          name: 'content',
          type: 'richText',
          editor: lexicalEditor(),
        },
        {
          name: 'blocks', // Allow blocks in posts too
          type: 'blocks',
          blocks: [HeroBlock, ContentBlock, MediaBlock, CallToActionBlock],
        },
        {
          name: 'featuredImage',
          type: 'upload',
          relationTo: 'media',
        },
        {
          name: 'category',
          type: 'relationship',
          relationTo: 'categories',
          hasMany: false,
        },
        {
          name: 'tags',
          type: 'array',
          fields: [
            {
              name: 'tag',
              type: 'text',
            },
          ],
        },
        {
          name: 'author',
          type: 'text',
          admin: {
            position: 'sidebar',
          },
        },
        {
          name: 'publishedAt',
          type: 'date',
          admin: {
            position: 'sidebar',
          },
        },
      ],
    },
    // Pages collection for content with publishing capability
    {
      slug: 'pages',
      versions: {
        drafts: {
          autosave: {
            interval: 2000, // Auto-save every 2 seconds
          },
        },
        maxPerDoc: 10, // Keep 10 versions per document
      },
      access: {
        read: ({ req }) => {
          // If user is logged in, show all
          if (req.user) return true;
          // Otherwise, only show published
          return {
            _status: {
              equals: 'published',
            },
          }
        },
      },
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
        {
          name: 'blocks', // Add blocks field for Hero and other blocks
          type: 'blocks',
          blocks: [HeroBlock, ContentBlock, MediaBlock, CallToActionBlock], // All block types
        },
        {
          name: 'publishedAt',
          type: 'date',
          admin: {
            position: 'sidebar',
          },
        },
      ],
    },
    // Media collection for uploads
    {
      slug: 'media',
      access: {
        read: () => true,
      },
      upload: {
        staticDir: 'media',
        mimeTypes: ['image/*'],
        imageSizes: [
          {
            name: 'thumbnail',
            width: 300,
            height: 300,
            position: 'centre',
          },
        ],
      },
      fields: [
        {
          name: 'alt',
          type: 'text',
        },
      ],
    },
  ],

  // Global configurations
  globals: [Header, Footer],

  // Admin configuration
  admin: {
    user: 'users',
    autoLogin: false,
  },

  // Plugins configuration
  plugins: [
    seoPlugin({
      collections: ['pages', 'posts'], // SEO for pages and posts
      generateTitle: ({ doc }) => `ValidAI - ${doc?.title?.value || ''}`,
      generateDescription: ({ doc }) => doc?.excerpt?.value || doc?.content?.value || '',
    }),
  ],

  telemetry: false,
})

export default Promise.resolve(config)
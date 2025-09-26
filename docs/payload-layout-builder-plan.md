# Payload CMS Layout Builder Implementation Plan

## Overview

This document outlines the implementation plan for adding a true Layout Builder capability to Payload CMS. This should be implemented **AFTER Phase 2** (visual styling) is complete, as it builds upon the styled components foundation.

---

## Prerequisites Checklist

Before starting this implementation, ensure:

- [ ] Phase 2 visual implementation is complete
- [ ] All existing blocks are properly styled
- [ ] Design system/theme is established
- [ ] CSS Grid/Flexbox utilities are available
- [ ] Current blocks render correctly on frontend
- [ ] Rich text rendering is functional

---

## Architecture Overview

### Core Concept
Transform the current "content blocks" system into a full "layout builder" by adding:
1. **Layout blocks** for structure (sections, columns)
2. **Nested blocks** for complex compositions
3. **Design controls** for spacing, alignment, backgrounds
4. **Live preview** for visual feedback

### Block Hierarchy
```
Section Block
├── Container Block
    ├── Column Block (1-4 columns)
        ├── Content Blocks (Hero, Media, etc.)
        └── Nested Layout Blocks
```

---

## Implementation Phases

### Phase 3.1: Core Layout Blocks (Week 1)

#### Section Block
```typescript
{
  slug: 'section',
  fields: [
    {
      name: 'sectionType',
      type: 'select',
      options: ['full-width', 'contained', 'narrow']
    },
    {
      name: 'backgroundColor',
      type: 'select',
      options: ['default', 'muted', 'primary', 'dark']
    },
    {
      name: 'paddingTop',
      type: 'select',
      options: ['none', 'small', 'medium', 'large', 'xlarge']
    },
    {
      name: 'paddingBottom',
      type: 'select',
      options: ['none', 'small', 'medium', 'large', 'xlarge']
    },
    {
      name: 'content',
      type: 'blocks',
      blocks: [/* all blocks including nested sections */]
    }
  ]
}
```

#### Container Block
```typescript
{
  slug: 'container',
  fields: [
    {
      name: 'width',
      type: 'select',
      options: ['small', 'medium', 'large', 'full']
    },
    {
      name: 'alignment',
      type: 'select',
      options: ['left', 'center', 'right']
    },
    {
      name: 'content',
      type: 'blocks',
      blocks: [/* content blocks */]
    }
  ]
}
```

### Phase 3.2: Column System (Week 1-2)

#### Columns Block
```typescript
{
  slug: 'columns',
  fields: [
    {
      name: 'columnLayout',
      type: 'select',
      options: [
        '50-50',      // Two equal columns
        '33-67',      // 1/3 + 2/3
        '67-33',      // 2/3 + 1/3
        '33-33-33',   // Three equal
        '25-25-25-25' // Four equal
      ]
    },
    {
      name: 'gap',
      type: 'select',
      options: ['none', 'small', 'medium', 'large']
    },
    {
      name: 'stackOnMobile',
      type: 'checkbox',
      defaultValue: true
    },
    {
      name: 'columns',
      type: 'array',
      minRows: 2,
      maxRows: 4,
      fields: [
        {
          name: 'content',
          type: 'blocks',
          blocks: [/* all content blocks */]
        }
      ]
    }
  ]
}
```

### Phase 3.3: Advanced Controls (Week 2)

#### Spacer Block
```typescript
{
  slug: 'spacer',
  fields: [
    {
      name: 'height',
      type: 'select',
      options: ['small', 'medium', 'large', 'xlarge']
    },
    {
      name: 'mobileHeight',
      type: 'select',
      options: ['small', 'medium', 'large', 'xlarge']
    }
  ]
}
```

#### Divider Block
```typescript
{
  slug: 'divider',
  fields: [
    {
      name: 'style',
      type: 'select',
      options: ['solid', 'dashed', 'dotted']
    },
    {
      name: 'color',
      type: 'select',
      options: ['default', 'muted', 'primary']
    },
    {
      name: 'margin',
      type: 'select',
      options: ['small', 'medium', 'large']
    }
  ]
}
```

### Phase 3.4: Live Preview Integration (Week 3)

#### Requirements
1. Install Payload Live Preview plugin
2. Configure preview URL
3. Set up preview API endpoint
4. Create preview component wrapper

#### Implementation
```typescript
// payload.config.ts
plugins: [
  livePreviewPlugin({
    collections: ['pages', 'posts'],
    url: ({ data, collectionConfig }) => {
      return `${process.env.NEXT_PUBLIC_SERVER_URL}/preview/${data.slug}`
    }
  })
]
```

### Phase 3.5: Visual Editor (Optional, Week 4)

Consider third-party integrations:
- **Payload Visual Editor** (if available)
- **Builder.io integration**
- **Custom drag-and-drop interface**

---

## Technical Specifications

### Frontend Rendering

#### CSS Grid Implementation
```css
.columns-50-50 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--column-gap);
}

.columns-33-67 {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: var(--column-gap);
}

@media (max-width: 768px) {
  .columns-stack-mobile {
    grid-template-columns: 1fr;
  }
}
```

#### Block Renderer Updates
```typescript
// Enhanced BlockRenderer.tsx
export function BlockRenderer({ blocks }) {
  return blocks.map((block) => {
    switch(block.blockType) {
      case 'section':
        return <SectionBlock {...block} />
      case 'columns':
        return <ColumnsBlock {...block} />
      case 'container':
        return <ContainerBlock {...block} />
      // ... existing blocks
    }
  })
}
```

### Database Considerations

- Nested blocks will increase JSON size
- Consider depth limits (max 3-4 levels)
- Index slug fields for performance
- Monitor query complexity

---

## Migration Strategy

### Step 1: Backward Compatibility
- Keep existing blocks working
- Add layout blocks as optional

### Step 2: Content Migration
```typescript
// Migration script to wrap existing blocks in sections
async function migrateToLayoutBuilder() {
  const pages = await payload.find({ collection: 'pages' })

  for (const page of pages.docs) {
    if (page.blocks && !hasLayoutBlocks(page.blocks)) {
      // Wrap existing blocks in a default section
      page.blocks = [{
        blockType: 'section',
        sectionType: 'contained',
        content: page.blocks
      }]

      await payload.update({
        collection: 'pages',
        id: page.id,
        data: page
      })
    }
  }
}
```

---

## Testing Strategy

### Unit Tests
- Block configuration validation
- Nested block depth limits
- Field validation

### Integration Tests
- Block rendering
- Responsive behavior
- Preview functionality

### Performance Tests
- Page load times with nested blocks
- Admin UI responsiveness
- Database query performance

### Edge Cases
- Empty columns
- Deeply nested structures
- Mixed content types
- Mobile responsiveness

---

## Performance Considerations

### Optimization Strategies
1. **Lazy load nested blocks** in admin UI
2. **Limit nesting depth** to 3-4 levels
3. **Cache rendered layouts** on frontend
4. **Optimize database queries** for nested content
5. **Use React.memo** for block components

### Monitoring
- Track page render times
- Monitor database query complexity
- Watch bundle size growth
- Check admin UI performance

---

## Success Metrics

### Technical Metrics
- [ ] All layout blocks render correctly
- [ ] Nesting works to 3 levels deep
- [ ] Mobile responsive layouts work
- [ ] Live preview updates in < 500ms
- [ ] No performance degradation > 10%

### User Experience Metrics
- [ ] Editors can create complex layouts
- [ ] Preview accurately reflects final output
- [ ] Training time < 30 minutes
- [ ] 90% of layouts achievable without code

---

## Recommended Tools & Resources

### NPM Packages
```json
{
  "@payloadcms/plugin-nested-docs": "^3.x",
  "@payloadcms/plugin-live-preview": "^3.x",
  "react-grid-system": "^8.x",
  "react-beautiful-dnd": "^13.x" // for drag-drop
}
```

### Reference Implementations
- [Payload Website Template](https://github.com/payloadcms/website-template)
- [WordPress Gutenberg](https://github.com/WordPress/gutenberg)
- [Builder.io Open Source](https://github.com/BuilderIO/builder)

### Documentation
- [Payload Blocks Documentation](https://payloadcms.com/docs/fields/blocks)
- [Payload Custom Components](https://payloadcms.com/docs/admin/components)
- [React DnD Documentation](https://react-dnd.github.io/react-dnd/)

---

## Timeline Summary

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| 3.1 Core Layout | 1 week | Section & Container blocks |
| 3.2 Columns | 1-2 weeks | Column system with responsive |
| 3.3 Advanced | 1 week | Spacers, dividers, controls |
| 3.4 Live Preview | 1 week | Real-time preview |
| 3.5 Visual Editor | 1 week | Optional drag-drop interface |

**Total Duration**: 4-5 weeks

---

## Next Steps

1. **Review this plan** with stakeholders
2. **Complete Phase 2** visual implementation
3. **Set up development branch** for layout builder
4. **Start with Phase 3.1** core layout blocks
5. **Iterate based on user feedback**

---

## Notes

- This plan assumes Phase 2 styling is complete
- Live preview requires additional server setup
- Visual editor is optional but recommended
- Consider user training and documentation needs
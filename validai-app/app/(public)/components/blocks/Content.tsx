// MARK: CMS PATTERN - Only for content display, not app features

interface ContentProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content?: any // Rich text content from Lexical editor
}

export function Content({ content }: ContentProps) {
  if (!content) return null

  // For now, render a simple div with the content
  // In production, you'd want to use a proper Lexical renderer
  return (
    <div className="content-block py-8 px-4">
      <div className="max-w-4xl mx-auto prose prose-lg">
        {/* This is a simplified renderer - in production use proper Lexical renderer */}
        <div dangerouslySetInnerHTML={{ __html: JSON.stringify(content) }} />
      </div>
    </div>
  )
}
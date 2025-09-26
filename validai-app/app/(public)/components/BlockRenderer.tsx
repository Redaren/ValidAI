// MARK: CMS PATTERN - Only for content display
import { Hero } from './blocks/Hero'
import { Content } from './blocks/Content'
import { Media } from './blocks/Media'
import { CallToAction } from './blocks/CallToAction'

interface Block {
  blockType: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

interface BlockRendererProps {
  blocks?: Block[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const blockComponents: Record<string, React.ComponentType<any>> = {
  hero: Hero,
  content: Content,
  mediaBlock: Media,
  callToAction: CallToAction,
}

export function BlockRenderer({ blocks = [] }: BlockRendererProps) {
  if (!blocks || blocks.length === 0) {
    return null
  }

  return (
    <>
      {blocks.map((block, index) => {
        const BlockComponent = blockComponents[block.blockType]
        if (!BlockComponent) {
          console.warn(`No component found for block type: ${block.blockType}`)
          return null
        }
        return <BlockComponent key={index} {...block} />
      })}
    </>
  )
}
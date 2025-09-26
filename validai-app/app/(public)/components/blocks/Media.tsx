// MARK: CMS PATTERN - Only for content display, not app features
import Image from 'next/image'

interface MediaProps {
  media?: {
    url?: string
    alt?: string
    width?: number
    height?: number
  }
  caption?: string
}

export function Media({ media, caption }: MediaProps) {
  if (!media?.url) return null

  return (
    <div className="media-block py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <figure>
          <div className="relative aspect-video overflow-hidden rounded-lg">
            {media.width && media.height ? (
              <Image
                src={media.url}
                alt={media.alt || ''}
                width={media.width}
                height={media.height}
                className="object-cover w-full h-full"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={media.url}
                alt={media.alt || ''}
                className="object-cover w-full h-full"
              />
            )}
          </div>
          {caption && (
            <figcaption className="mt-2 text-center text-sm text-muted-foreground">
              {caption}
            </figcaption>
          )}
        </figure>
      </div>
    </div>
  )
}
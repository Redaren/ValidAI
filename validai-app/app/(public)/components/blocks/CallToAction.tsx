// MARK: CMS PATTERN - Only for content display, not app features
import Link from 'next/link'

interface CallToActionProps {
  text: string
  link: string
}

export function CallToAction({ text, link }: CallToActionProps) {
  const isExternal = link?.startsWith('http://') || link?.startsWith('https://')

  return (
    <div className="call-to-action-block py-12 px-4">
      <div className="max-w-4xl mx-auto text-center">
        {isExternal ? (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center px-6 py-3 text-base font-medium text-white bg-primary rounded-md hover:bg-primary/90 transition-colors"
          >
            {text}
          </a>
        ) : (
          <Link
            href={link}
            className="inline-flex items-center justify-center px-6 py-3 text-base font-medium text-white bg-primary rounded-md hover:bg-primary/90 transition-colors"
          >
            {text}
          </Link>
        )}
      </div>
    </div>
  )
}
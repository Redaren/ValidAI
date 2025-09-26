// MARK: CMS PATTERN - Only for content display, not app features
interface HeroProps {
  heading: string
  subheading?: string
}

export function Hero({ heading, subheading }: HeroProps) {
  return (
    <div className="hero-block py-16 px-4">
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
          {heading}
        </h1>
        {subheading && (
          <p className="text-lg md:text-xl text-muted-foreground">
            {subheading}
          </p>
        )}
      </div>
    </div>
  )
}
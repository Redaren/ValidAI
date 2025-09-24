import { SessionInfoCard } from "@/components/session-info-card"

export default function DashboardPage() {
  return (
    <>
      <div className="grid auto-rows-min gap-4 md:grid-cols-3">
        <div className="bg-muted/50 aspect-video rounded-xl flex items-center justify-center">
          <span className="text-muted-foreground">Dashboard Card 1</span>
        </div>
        <div className="bg-muted/50 aspect-video rounded-xl flex items-center justify-center">
          <span className="text-muted-foreground">Dashboard Card 2</span>
        </div>
        <div className="bg-muted/50 aspect-video rounded-xl flex items-center justify-center">
          <span className="text-muted-foreground">Dashboard Card 3</span>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="bg-muted/50 min-h-[50vh] rounded-xl flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-muted-foreground mb-2">
              Welcome to ValidAI
            </h1>
            <p className="text-muted-foreground">
              Your dashboard is ready for content
            </p>
          </div>
        </div>
        <SessionInfoCard />
      </div>
    </>
  )
}
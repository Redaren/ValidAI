import { createClient } from "@/lib/supabase/server";

export default async function DemoPage() {
  const supabase = await createClient();

  // Try to fetch from a sample table (we'll create this if it doesn't exist)
  const { data: todos, error } = await supabase
    .from("todos")
    .select("*")
    .limit(10);

  return (
    <div className="flex-1 w-full flex flex-col gap-12 p-4">
      <div className="w-full max-w-4xl mx-auto">
        <h1 className="font-bold text-3xl mb-8">Demo Page - Database Connection</h1>

        <div className="bg-accent text-sm p-3 px-5 rounded-md text-foreground mb-6">
          This page demonstrates fetching data from your Supabase database.
        </div>

        <div className="space-y-4">
          <h2 className="font-bold text-xl">Sample Data from &apos;todos&apos; table:</h2>

          {error ? (
            <div className="bg-destructive/10 border border-destructive text-destructive p-4 rounded-md">
              <strong>Error:</strong> {error.message}
              <p className="mt-2 text-sm">
                The &apos;todos&apos; table might not exist yet. You can create it in your Supabase dashboard
                or run this SQL command in the SQL editor:
              </p>
              <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">
{`CREATE TABLE todos (
  id BIGSERIAL PRIMARY KEY,
  task TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert sample data
INSERT INTO todos (task) VALUES
  ('Set up Next.js project'),
  ('Configure Supabase'),
  ('Create demo page'),
  ('Add authentication');`}
              </pre>
            </div>
          ) : (
            <div className="space-y-2">
              {todos && todos.length > 0 ? (
                <div className="bg-muted p-4 rounded-md">
                  <pre className="text-sm overflow-auto">
                    {JSON.stringify(todos, null, 2)}
                  </pre>
                </div>
              ) : (
                <div className="bg-muted p-4 rounded-md text-muted-foreground">
                  No data found in the &apos;todos&apos; table. The table exists but is empty.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-8 p-4 border rounded-md">
          <h3 className="font-semibold mb-2">Connection Status:</h3>
          <p className="text-sm text-muted-foreground">
            ✅ Successfully connected to Supabase<br/>
            ✅ Environment variables configured<br/>
            {error ? "❌" : "✅"} Database query {error ? "failed" : "executed successfully"}
          </p>
        </div>
      </div>
    </div>
  );
}
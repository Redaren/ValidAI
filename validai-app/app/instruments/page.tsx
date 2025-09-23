import { createClient } from '@/lib/supabase/server';

export default async function Instruments() {
  const supabase = await createClient();
  const { data: instruments, error } = await supabase.from("instruments").select();

  if (error) {
    return <div>Error loading instruments: {error.message}</div>;
  }

  if (!instruments || instruments.length === 0) {
    return <div>No instruments found</div>;
  }

  return (
    <div>
      <h1>Instruments:</h1>
      {instruments.map((instrument) => (
        <div key={instrument.id}>
          {instrument.id}. {instrument.name}
        </div>
      ))}
    </div>
  );
}
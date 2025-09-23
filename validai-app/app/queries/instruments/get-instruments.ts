import { TypedSupabaseClient } from '@/lib/supabase/types'

export async function getInstruments(supabase: TypedSupabaseClient) {
  const { data, error } = await supabase
    .from('instruments')
    .select('*')
    .order('name')

  if (error) throw error
  return data
}

export async function getInstrument(supabase: TypedSupabaseClient, id: string) {
  const { data, error } = await supabase
    .from('instruments')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}
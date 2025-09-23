'use client'

import { useQuery } from '@tanstack/react-query'
import { createTypedBrowserClient } from '@/lib/supabase/typed-clients'
import { getInstruments, getInstrument } from './get-instruments'

export function useInstruments() {
  const supabase = createTypedBrowserClient()

  return useQuery({
    queryKey: ['instruments'],
    queryFn: () => getInstruments(supabase),
  })
}

export function useInstrument(id: string) {
  const supabase = createTypedBrowserClient()

  return useQuery({
    queryKey: ['instruments', id],
    queryFn: () => getInstrument(supabase, id),
    enabled: !!id,
  })
}
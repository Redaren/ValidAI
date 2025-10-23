import { Database } from './database.types'
import { SupabaseClient } from '@supabase/supabase-js'

// Utility type: Extract all table names
export type TableName = keyof Database['public']['Tables']

// Utility type: Get Row type for any table
export type TableRow<T extends TableName> = Database['public']['Tables'][T]['Row']

// Utility type: Get Insert type for any table
export type TableInsert<T extends TableName> = Database['public']['Tables'][T]['Insert']

// Utility type: Get Update type for any table
export type TableUpdate<T extends TableName> = Database['public']['Tables'][T]['Update']

// Utility type: Type-safe RPC calls
export type RpcFunction = keyof Database['public']['Functions']
export type RpcArgs<T extends RpcFunction> = Database['public']['Functions'][T]['Args']
export type RpcReturns<T extends RpcFunction> = Database['public']['Functions'][T]['Returns']

// Helper for typed Supabase client
export type TypedSupabaseClient = SupabaseClient<Database>

'use client'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let browserClient: SupabaseClient | null = null

function getBrowserSupabaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!value) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured')
  }
  return value
}

function getBrowserSupabaseAnonKey(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!value) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured')
  }
  return value
}

export function createBrowserClient() {
  if (!browserClient) {
    browserClient = createClient(
      getBrowserSupabaseUrl(),
      getBrowserSupabaseAnonKey(),
      {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      }
    )
  }

  return browserClient
}

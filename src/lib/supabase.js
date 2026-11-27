import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://dlbeywpyjdhynflmqvgb.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsYmV5d3B5amRoeW5mbG1xdmdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ3NTgzNTIsImV4cCI6MjExMDMzNDM1Mn0.7Jiz5RJ_PjTVm4EvgDfShJoaWM6r90LCvUR-mvDxJ4k'
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsYmV5d3B5amRoeW5mbG1xdmdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5NDc1ODM1MiwiZXhwIjoyMTEwMzM0MzUyfQ.wB_iUoXsqHFLVltAmbmBHR99LbvuRDgIeQuXlIp2fo4'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Admin/Service client that bypasses storage & RLS restrictions when performing authorized operations
// auth.persistSession: false prevents "Multiple GoTrueClient instances detected under same storage key" warning
export const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : supabase

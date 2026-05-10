import { createClient } from "@supabase/supabase-js"

import Config from "@/config"

const supabaseUrl = Config.SUPABASE_URL
const supabaseAnonKey = Config.SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase mobile config")
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

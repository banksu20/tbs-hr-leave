import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://uuoyjcfksuzxxaaxixhn.supabase.co";
const supabaseKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE || import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_e_-U3CmfXi2t7YxtL3aJPQ_pN08k0ei";

export const supabase = createClient(supabaseUrl, supabaseKey);

import { createClient } from '@supabase/supabase-js';

// Accessing environment variables. In Vite they are import.meta.env, in standard node process.env.
// Hardcoding here based on your prompt to ensure it works in this environment immediately.

const supabaseUrl = 'https://mfgurigjcxovztmyzkrl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1mZ3VyaWdqY3hvdnp0bXl6a3JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0OTgwMDEsImV4cCI6MjA4MDA3NDAwMX0.Lid7uptIObAHNIB3gPHylTr-QuiHSXZVAPBHjMqdDaE';

export const supabase = createClient(supabaseUrl, supabaseKey);

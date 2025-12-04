import { ReservoirEntry } from '../types';
import { supabase } from './supabaseClient';

const LOCAL_STORAGE_KEY = 'reservoir_entries';

/**
 * Data Service to handle persistence via Supabase.
 * Falls back to LocalStorage if Supabase is unreachable.
 */
export const dataService = {
  
  async getEntries(): Promise<{ data: ReservoirEntry[], source: 'MYSQL' | 'LOCAL', isMissingTable?: boolean }> {
    try {
      const { data, error } = await supabase
        .from('reservoir_entries')
        .select('*')
        .order('timestamp', { ascending: false });

      if (error) throw error;

      // Map snake_case database fields back to camelCase Typescript interface
      const mappedData: ReservoirEntry[] = (data || []).map((row: any) => ({
        id: row.id,
        name: row.name,
        locationName: row.location_name,
        coordinates: { 
          latitude: row.latitude, 
          longitude: row.longitude 
        },
        waterLevel: row.water_level,
        capacityPercentage: row.capacity_percentage,
        status: row.status,
        notes: row.notes,
        timestamp: row.timestamp,
        submittedBy: row.submitted_by,
        isVerified: row.is_verified,
        geminiAnalysis: row.gemini_analysis,
        groundingUrl: row.grounding_url
      }));

      return { data: mappedData, source: 'MYSQL', isMissingTable: false }; // Reusing 'MYSQL' label to indicate 'Cloud DB' for UI consistency
    } catch (error: any) {
      let isMissingTable = false;
      if (error.code === 'PGRST205') {
        console.error("CRITICAL: Supabase Table Missing. Please run schema.sql in Supabase SQL Editor.");
        isMissingTable = true;
      } else {
        console.warn('Supabase unavailable, falling back to LocalStorage:', error.message);
      }
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      const data = saved ? JSON.parse(saved) : [];
      return { data, source: 'LOCAL', isMissingTable };
    }
  },

  async addEntry(entry: ReservoirEntry): Promise<void> {
    let success = false;
    let errorMessage = '';

    // Map camelCase entry to snake_case for DB
    const dbPayload = {
      id: entry.id,
      name: entry.name,
      location_name: entry.locationName,
      latitude: entry.coordinates.latitude,
      longitude: entry.coordinates.longitude,
      water_level: entry.waterLevel,
      capacity_percentage: entry.capacityPercentage,
      status: entry.status,
      notes: entry.notes,
      timestamp: entry.timestamp,
      submitted_by: entry.submittedBy,
      is_verified: entry.isVerified,
      gemini_analysis: entry.geminiAnalysis,
      grounding_url: entry.groundingUrl
    };

    // Try Supabase
    try {
      const { error } = await supabase
        .from('reservoir_entries')
        .insert([dbPayload]);
      
      if (!error) {
        success = true;
      } else {
        errorMessage = error.message;
        if (error.code === 'PGRST205') {
           errorMessage = "Table 'reservoir_entries' does not exist. Run schema.sql in Supabase.";
        }
        console.error("Supabase Write Error:", errorMessage);
      }
    } catch (error: any) {
      errorMessage = error.message || "Unknown error";
      console.error("Supabase Write Exception:", JSON.stringify(error, null, 2));
    }

    // Always update LocalStorage as backup/cache
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      const entries = saved ? JSON.parse(saved) : [];
      const newEntries = [entry, ...entries];
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newEntries));
    } catch (e) {
      console.warn("LocalStorage write failed", e);
    }

    if (success) {
      console.log('Data saved to Supabase');
    } else {
      console.log('Data saved to LocalStorage (Offline/Fallback Mode). Reason:', errorMessage);
    }
  },

  async deleteEntry(id: string): Promise<void> {
    // Try Supabase
    try {
      const { error } = await supabase.from('reservoir_entries').delete().eq('id', id);
      if (error) console.error("Supabase Delete Error:", JSON.stringify(error, null, 2));
    } catch (error) {
       console.warn('Supabase delete exception:', error);
    }

    // LocalStorage
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      const entries: ReservoirEntry[] = JSON.parse(saved);
      const filtered = entries.filter(e => e.id !== id);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
    }
  }
};
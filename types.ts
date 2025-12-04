export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  DATA_ENTRY_WORKER = 'DATA_ENTRY_WORKER',
}

export enum ReservoirStatus {
  NORMAL = 'NORMAL',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
  SPILLING = 'SPILLING',
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface ReservoirEntry {
  id: string;
  name: string;
  locationName: string; // From Gemini/Maps
  coordinates: Coordinates;
  waterLevel: number; // in meters
  capacityPercentage: number;
  status: ReservoirStatus;
  notes: string;
  timestamp: number;
  submittedBy: string; // Worker ID or Name
  isVerified: boolean; // Geofence check
  geminiAnalysis?: string;
  groundingUrl?: string;
}

export interface User {
  id: string;
  name: string;
  role: UserRole;
  avatarUrl: string;
}
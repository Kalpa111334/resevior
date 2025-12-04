import { supabase } from './supabaseClient';
import { User, UserRole } from '../types';
import { analyzeFaceForAccess } from './geminiService';

const BIOMETRIC_VAULT_KEY = 'lrw_biometric_vault';

export const authService = {
  
  /**
   * Register a new user.
   */
  async signUp(email: string, password: string, name: string, role: UserRole) {
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name,
          role: role,
          avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`
        }
      }
    });

    if (authError) {
      console.error("Supabase SignUp Error Details:", JSON.stringify(authError, null, 2));
      if (authError.status === 500 || (authError as any).code === 'unexpected_failure') {
        throw new Error("DATABASE CONFIG ERROR: The Supabase Trigger is crashing. Please run the provided 'schema.sql' script in your Supabase SQL Editor to fix this.");
      }
      throw new Error(authError.message || "Registration failed");
    }

    if (!authData.user) throw new Error("User creation failed");

    return { user: authData.user, error: null };
  },

  /**
   * Sign in and fetch the user's profile to get their role.
   */
  async signIn(email: string, password: string): Promise<{ appUser: User | null, error: any }> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) return { appUser: null, error: new Error(error.message) };
    if (!data.user) return { appUser: null, error: new Error("No user found") };

    return await this.getUserProfile(data.user.id, data.user);
  },

  /**
   * Sign out
   */
  async signOut() {
    return await supabase.auth.signOut();
  },

  async getCurrentUser(): Promise<User | null> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;

    const { appUser } = await this.getUserProfile(session.user.id, session.user);
    return appUser;
  },

  async getUserProfile(userId: string, authUserFallback?: any): Promise<{ appUser: User | null, error: any }> {
    let attempts = 0;
    const maxAttempts = 5;
    const delayMs = 500;

    // 1. Primary Method: Fetch from 'profiles' table
    while (attempts < maxAttempts) {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (!error && profile) {
        const appUser: User = {
          id: profile.id,
          name: profile.name,
          role: profile.role as UserRole,
          avatarUrl: profile.avatar_url
        };
        return { appUser, error: null };
      }

      attempts++;
      if (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    // 2. Fallback Method: Use Auth Metadata
    if (authUserFallback && authUserFallback.user_metadata) {
      console.warn("Profile DB fetch failed after retries. Using Auth Metadata fallback.");
      const meta = authUserFallback.user_metadata;
      
      const appUser: User = {
        id: userId,
        name: meta.name || 'Unknown User',
        role: (meta.role as UserRole) || UserRole.DATA_ENTRY_WORKER,
        avatarUrl: meta.avatar_url || `https://ui-avatars.com/api/?name=User&background=random`
      };
      return { appUser, error: null };
    }

    console.error("Failed to fetch profile after retries and no fallback available.");
    return { 
      appUser: null, 
      error: new Error("Profile could not be loaded. Please try logging out and logging back in.") 
    };
  },

  // --- BIOMETRIC AUTHENTICATION METHODS ---

  /**
   * Check if this device is enrolled for Face ID
   */
  isDeviceEnrolled(): boolean {
    return !!localStorage.getItem(BIOMETRIC_VAULT_KEY);
  },

  /**
   * Enroll a new user on this device.
   * Generates credentials, registers with Supabase, and stores tokens locally.
   */
  async enrollDevice(name: string, role: UserRole, faceImageBase64: string): Promise<User> {
    // 1. Verify Face Quality with Gemini
    const analysis = await analyzeFaceForAccess(faceImageBase64);
    if (!analysis.authorized) {
      throw new Error(`Face Enrollment Failed: ${analysis.reason}`);
    }

    // 2. Generate High-Entropy Credentials
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(7);
    const email = `officer.${timestamp}.${randomSuffix}@lankareservoir.secure`;
    const password = `SECURE_${timestamp}_${Math.random().toString(36).substring(2)}!@#`;

    // 3. Register User in Cloud (Supabase)
    const { user, error } = await this.signUp(email, password, name, role);
    if (error) throw error;
    if (!user) throw new Error("Cloud Registration Failed");

    // 4. Store Credentials in Local Vault (Simulated Secure Enclave)
    // In a real app, this would use WebAuthn/Passkeys, but here we store obfuscated creds
    // bound to the "Face ID" concept.
    const vaultData = btoa(JSON.stringify({ email, password }));
    localStorage.setItem(BIOMETRIC_VAULT_KEY, vaultData);

    // 5. Login immediately
    const { appUser, error: loginError } = await this.signIn(email, password);
    if (loginError || !appUser) throw new Error("Enrollment Login Failed");

    return appUser;
  },

  /**
   * Login using Face ID.
   * Verifies face liveness, then unlocks local credentials to sign in.
   */
  async faceLogin(faceImageBase64: string): Promise<User> {
    // 1. Check if enrolled
    const vault = localStorage.getItem(BIOMETRIC_VAULT_KEY);
    if (!vault) {
        throw new Error("Device not enrolled. Please perform One-Time Setup.");
    }

    // 2. Strict Biometric Check (Gemini)
    const analysis = await analyzeFaceForAccess(faceImageBase64);
    if (!analysis.authorized) {
      throw new Error(`Access Denied: ${analysis.reason}`);
    }

    // 3. Unlock Vault
    try {
        const creds = JSON.parse(atob(vault));
        
        // 4. Perform Cloud Auth
        const { appUser, error } = await this.signIn(creds.email, creds.password);
        if (error) throw error;
        if (!appUser) throw new Error("User not found.");

        return appUser;
    } catch (e) {
        console.error(e);
        throw new Error("Biometric Token Corrupted. Please Re-Enroll.");
    }
  },

  /**
   * Reset enrollment (for debugging or device transfer)
   */
  resetEnrollment() {
    localStorage.removeItem(BIOMETRIC_VAULT_KEY);
  }
};
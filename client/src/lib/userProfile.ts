import { type UserRole } from "@/lib/reportFamilyUtils";

export interface UserProfile {
  name: string;
  role: UserRole;
}

export const PROFILE_KEY = "smarteo_user_profile";
export const DEFAULT_PROFILE: UserProfile = { name: "Your Name", role: "Account Manager" };

export function loadProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) return JSON.parse(raw) as UserProfile;
  } catch {}
  return DEFAULT_PROFILE;
}

export function saveProfile(p: UserProfile) {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch {}
}

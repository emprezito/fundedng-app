import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface Profile {
  id: string;
  full_name: string;
  phone: string | null;
  kyc_verified: boolean;
  bank_account_number: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  partner_referred_by?: string | null;
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isAdmin: boolean;
  isPartner: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPartner, setIsPartner] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadProfile = async (uid: string) => {
    const [profileRes, rolesRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid),
    ]);
    setProfile((profileRes.data as Profile | null) ?? null);
    // Admin status comes EXCLUSIVELY from the user_roles table — no email
    // shortcuts, no client-side allow-lists. Server-side checks must use the
    // same source of truth.
    const roleAdmin = !!rolesRes.data?.some((r) => r.role === "admin");
    const rolePartner = !!rolesRes.data?.some((r) => r.role === "partner");
    setIsAdmin(roleAdmin);
    setIsPartner(rolePartner);
  };

  const refresh = async () => {
    if (user?.id) await loadProfile(user.id);
  };

  useEffect(() => {
    // Set up listener BEFORE getSession
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        // defer profile load to avoid recursion
        setTimeout(() => loadProfile(newSession.user!.id), 0);
      } else {
        setProfile(null);
        setIsAdmin(false);
        setIsPartner(false);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        loadProfile(data.session.user.id).finally(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
    setIsAdmin(false);
    setIsPartner(false);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: !!session,
        isLoading,
        user,
        session,
        profile,
        isAdmin,
        isPartner,
        refresh,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
import React, { createContext, useContext, useState, useEffect } from "react";
import { User } from '@shared/schema';
import * as auth from '@/lib/auth';
import { useToast } from "@/hooks/use-toast";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const initAuth = async () => {
      try {
        const userData = await auth.getCurrentUser();
        if (userData?.success && userData.user) {
          setUser(userData.user);
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = async (username: string, password: string) => {
    try {
      const response = await auth.login({ username, password });
      if (response.success && response.user) {
        setUser(response.user);
        // セッションの保存を確認
        await new Promise(resolve => setTimeout(resolve, 100));
        const currentUser = await auth.getCurrentUser();
        if (currentUser?.success && currentUser.user) {
          toast({
            title: "ログイン成功",
            description: "ようこそ！",
          });
          return response;
        } else {
          throw new Error("セッションの保存に失敗しました");
        }
      } else {
        throw new Error(response.message || "ログインに失敗しました");
      }
    } catch (error) {
      console.error('Login error:', error);
      toast({
        title: "ログインエラー",
        description: error instanceof Error ? error.message : "ログインに失敗しました",
        variant: "destructive",
      });
      throw error;
    }
  };

  const logout = async () => {
    try {
      await auth.logout();
      setUser(null);
      toast({
        title: "ログアウト",
        description: "ログアウトしました",
      });
    } catch (error) {
      console.error('Logout error:', error);
      toast({
        title: "ログアウトエラー",
        description: "ログアウトに失敗しました",
        variant: "destructive",
      });
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

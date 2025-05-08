import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema } from "@shared/schema";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

export default function Login() {
  const [isLoading, setIsLoading] = useState(false);
  const { login, user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  
  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && user) {
      setLocation("/chat");
    }
  }, [user, authLoading, setLocation]);

  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const onSubmit = async (values: { username: string; password: string }) => {
    try {
      setIsLoading(true);
      await login(values.username, values.password);
      setLocation("/chat");
    } catch (error) {
      console.error("Login error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-b from-primary/10 to-primary/5 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-primary">応急処置チャットシステム</h1>
          <p className="text-neutral-600 mt-2">Emergency Recovery Chat System</p>
        </div>
        <Card className="w-full shadow-lg">
          <CardHeader className="text-center bg-primary text-white rounded-t-lg">
            <CardTitle className="text-2xl font-bold">ログイン</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ユーザー名</FormLabel>
                      <FormControl>
                        <Input placeholder="ユーザー名を入力" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>パスワード</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="パスワードを入力" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full bg-primary" disabled={isLoading}>
                  {isLoading ? "ログイン中..." : "ログイン"}
                </Button>
              </form>
            </Form>
          </CardContent>
          <CardFooter className="flex flex-col space-y-2 text-center text-sm text-neutral-500 border-t pt-4 mt-2">
            <p>デモ用ログイン情報:</p>
            <p>管理者: niina / 0077</p>
            <p>一般ユーザー: employee / employee123</p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

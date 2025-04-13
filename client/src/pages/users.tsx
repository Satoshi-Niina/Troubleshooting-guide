import { useState, useEffect } from "react";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shield, UserPlus, ArrowLeft, User, Edit, Trash2, AlertCircle } from "lucide-react";
import { useLocation, Link } from "wouter";

// ユーザーインターフェース
interface UserData {
  id: number;
  username: string;
  displayName: string;
  role: "employee" | "admin";
  department?: string;
}

// 新規ユーザー作成用インターフェース
interface NewUserData {
  username: string;
  password: string;
  displayName: string;
  role: "employee" | "admin";
  department?: string;
}

export default function UsersPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  // 管理者でない場合はホームページにリダイレクト
  useEffect(() => {
    if (user && user.role !== "admin") {
      navigate("/");
    }
  }, [user, navigate]);

  // ユーザーデータの取得
  const { data: users, isLoading } = useQuery<UserData[]>({
    queryKey: ["/api/users"],
    refetchOnWindowFocus: false,
  });

  // 新規ユーザーフォーム
  const [showNewUserDialog, setShowNewUserDialog] = useState(false);
  const [showEditUserDialog, setShowEditUserDialog] = useState(false);
  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [newUser, setNewUser] = useState<Partial<NewUserData>>({
    username: "",
    password: "",
    displayName: "",
    role: "employee",
  });
  const [editUser, setEditUser] = useState<Partial<UserData>>({
    username: "",
    displayName: "",
    role: "employee",
  });

  // フォームの値をリセット
  const resetNewUserForm = () => {
    setNewUser({
      username: "",
      password: "",
      displayName: "",
      role: "employee",
      department: "",
    });
  };

  // ユーザー作成のミューテーション
  const createUserMutation = useMutation({
    mutationFn: async (userData: NewUserData) => {
      const res = await apiRequest("POST", "/api/users", userData);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "ユーザー作成完了",
        description: "新しいユーザーが作成されました",
      });
      setShowNewUserDialog(false);
      resetNewUserForm();
    },
    onError: (error: any) => {
      toast({
        title: "ユーザー作成失敗",
        description: error.message || "ユーザー作成中にエラーが発生しました",
        variant: "destructive",
      });
    },
  });

  // フォーム送信処理
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // バリデーション
    if (!newUser.username || !newUser.password || !newUser.displayName) {
      toast({
        title: "入力エラー",
        description: "必須項目を入力してください",
        variant: "destructive",
      });
      return;
    }

    createUserMutation.mutate(newUser as NewUserData);
  };

  // 入力フィールド更新処理
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setNewUser((prev) => ({ ...prev, [name]: value }));
  };

  // セレクト更新処理
  const handleSelectChange = (name: string, value: string) => {
    setNewUser((prev) => ({ ...prev, [name]: value }));
  };
  
  // 編集用セレクト更新処理
  const handleEditSelectChange = (name: string, value: string) => {
    setEditUser((prev) => ({ ...prev, [name]: value }));
  };
  
  // 編集用入力フィールド更新処理
  const handleEditInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setEditUser((prev) => ({ ...prev, [name]: value }));
  };
  
  // ユーザー編集準備
  const handleEditUser = (userData: UserData) => {
    setSelectedUserId(userData.id);
    setEditUser({
      username: userData.username,
      displayName: userData.displayName,
      role: userData.role,
      department: userData.department
    });
    setShowEditUserDialog(true);
  };
  
  // ユーザー削除準備
  const handleDeleteUser = (userId: number) => {
    setSelectedUserId(userId);
    setShowDeleteConfirmDialog(true);
  };
  
  // ユーザー編集のミューテーション
  const updateUserMutation = useMutation({
    mutationFn: async (userData: Partial<UserData>) => {
      if (!selectedUserId) throw new Error("ユーザーIDが選択されていません");
      const res = await apiRequest("PATCH", `/api/users/${selectedUserId}`, userData);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "ユーザー更新完了",
        description: "ユーザー情報が更新されました",
      });
      setShowEditUserDialog(false);
    },
    onError: (error: any) => {
      toast({
        title: "ユーザー更新失敗",
        description: error.message || "ユーザー更新中にエラーが発生しました",
        variant: "destructive",
      });
    },
  });
  
  // ユーザー削除のミューテーション
  const deleteUserMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUserId) throw new Error("ユーザーIDが選択されていません");
      // 自分自身のアカウントは削除できないチェックを追加
      if (user && selectedUserId === user.id) {
        throw new Error("自分自身のアカウントは削除できません");
      }
      
      const res = await apiRequest("DELETE", `/api/users/${selectedUserId}`);
      
      // エラーレスポンスをハンドリング
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "ユーザー削除中にエラーが発生しました");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "ユーザー削除完了",
        description: "ユーザーが削除されました",
      });
      setShowDeleteConfirmDialog(false);
    },
    onError: (error: any) => {
      toast({
        title: "ユーザー削除失敗",
        description: error.message || "ユーザー削除中にエラーが発生しました",
        variant: "destructive",
      });
      setShowDeleteConfirmDialog(false);
    },
  });
  
  // 編集フォーム送信処理
  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // バリデーション
    if (!editUser.username || !editUser.displayName) {
      toast({
        title: "入力エラー",
        description: "必須項目を入力してください",
        variant: "destructive",
      });
      return;
    }
    
    updateUserMutation.mutate(editUser);
  };

  // 管理者でない場合のローディング表示
  if (!user || (user && user.role !== "admin")) {
    return <div>Loading...</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center">
            <Shield className="mr-2 h-6 w-6" />
            ユーザー管理
          </h1>
          <p className="text-neutral-300">システムの全ユーザーを管理します</p>
        </div>

        <div className="flex space-x-2">
          <Link href="/settings">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              設定に戻る
            </Button>
          </Link>
          <Dialog open={showNewUserDialog} onOpenChange={setShowNewUserDialog}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="mr-2 h-4 w-4" />
                新規ユーザー作成
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>新規ユーザー作成</DialogTitle>
                <DialogDescription>
                  新しいユーザーアカウントを作成します。
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSubmit}>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="username">ユーザー名</Label>
                    <Input
                      id="username"
                      name="username"
                      value={newUser.username}
                      onChange={handleInputChange}
                      required
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="password">パスワード</Label>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      value={newUser.password}
                      onChange={handleInputChange}
                      required
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="displayName">表示名</Label>
                    <Input
                      id="displayName"
                      name="displayName"
                      value={newUser.displayName}
                      onChange={handleInputChange}
                      required
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="department">部署</Label>
                    <Input
                      id="department"
                      name="department"
                      value={newUser.department || ""}
                      onChange={handleInputChange}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="role">権限</Label>
                    <Select
                      value={newUser.role}
                      onValueChange={(value) => handleSelectChange("role", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="権限を選択" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="employee">一般ユーザー</SelectItem>
                        <SelectItem value="admin">管理者</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowNewUserDialog(false)}
                  >
                    キャンセル
                  </Button>
                  <Button 
                    type="submit"
                    disabled={createUserMutation.isPending}
                  >
                    {createUserMutation.isPending ? "作成中..." : "作成"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center">
            <User className="mr-2 h-5 w-5" />
            ユーザー一覧
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-4">読み込み中...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>ユーザー名</TableHead>
                  <TableHead>表示名</TableHead>
                  <TableHead>権限</TableHead>
                  <TableHead>部署</TableHead>
                  <TableHead className="text-right">アクション</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users && users.length > 0 ? (
                  users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>{user.id}</TableCell>
                      <TableCell>{user.username}</TableCell>
                      <TableCell>{user.displayName}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          user.role === "admin" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"
                        }`}>
                          {user.role === "admin" ? "管理者" : "一般ユーザー"}
                        </span>
                      </TableCell>
                      <TableCell>{user.department || "-"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleEditUser(user)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleDeleteUser(user.id)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center">
                      ユーザーが見つかりません
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      
      {/* ユーザー編集ダイアログ */}
      <Dialog open={showEditUserDialog} onOpenChange={setShowEditUserDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ユーザー編集</DialogTitle>
            <DialogDescription>
              ユーザーアカウント情報を編集します。
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEditSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-username">ユーザー名</Label>
                <Input
                  id="edit-username"
                  name="username"
                  value={editUser.username}
                  onChange={handleEditInputChange}
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-displayName">表示名</Label>
                <Input
                  id="edit-displayName"
                  name="displayName"
                  value={editUser.displayName}
                  onChange={handleEditInputChange}
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-department">部署</Label>
                <Input
                  id="edit-department"
                  name="department"
                  value={editUser.department || ""}
                  onChange={handleEditInputChange}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-role">権限</Label>
                <Select
                  value={editUser.role}
                  onValueChange={(value) => handleEditSelectChange("role", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="権限を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">一般ユーザー</SelectItem>
                    <SelectItem value="admin">管理者</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowEditUserDialog(false)}
              >
                キャンセル
              </Button>
              <Button 
                type="submit"
                disabled={updateUserMutation.isPending}
              >
                {updateUserMutation.isPending ? "更新中..." : "更新"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      
      {/* ユーザー削除確認ダイアログ */}
      <Dialog open={showDeleteConfirmDialog} onOpenChange={setShowDeleteConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <AlertCircle className="h-5 w-5 mr-2 text-red-500" />
              ユーザー削除の確認
            </DialogTitle>
            <DialogDescription>
              このユーザーを削除すると、関連するすべてのデータが削除されます。この操作は元に戻せません。
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <p className="text-center font-medium">本当にこのユーザーを削除しますか？</p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowDeleteConfirmDialog(false)}
            >
              キャンセル
            </Button>
            <Button 
              type="button"
              variant="destructive"
              onClick={() => deleteUserMutation.mutate()}
              disabled={deleteUserMutation.isPending}
            >
              {deleteUserMutation.isPending ? "削除中..." : "削除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
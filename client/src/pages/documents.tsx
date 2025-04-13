import { useState, useEffect } from "react";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { FileType, Plus, ArrowLeft, Tag, Search } from "lucide-react";
import { useLocation, Link } from "wouter";
import { format } from "date-fns";

// ドキュメントインターフェース
interface DocumentData {
  id: number;
  title: string;
  content: string;
  type: string;
  url: string;
  userId: number;
  createdAt: string;
  updatedAt: string;
  keywords?: string[];
}

// 新規ドキュメント作成用インターフェース
interface NewDocumentData {
  title: string;
  content: string;
  type: string;
  url: string;
  keywords?: string;
}

const documentTypes = [
  { value: "pdf", label: "PDF文書" },
  { value: "excel", label: "Excel" },
  { value: "word", label: "Word" },
  { value: "powerpoint", label: "PowerPoint" },
  { value: "text", label: "テキスト" },
  { value: "image", label: "画像" },
];

export default function DocumentsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  // 管理者でない場合はホームページにリダイレクト
  useEffect(() => {
    if (user && user.role !== "admin") {
      navigate("/");
    }
  }, [user, navigate]);

  // ドキュメントデータの取得
  const { data: documents, isLoading } = useQuery<DocumentData[]>({
    queryKey: ["/api/documents"],
    refetchOnWindowFocus: false,
  });

  // 新規ドキュメントフォーム
  const [showNewDocDialog, setShowNewDocDialog] = useState(false);
  const [newDocument, setNewDocument] = useState<Partial<NewDocumentData>>({
    title: "",
    content: "",
    type: "pdf",
    url: "",
    keywords: "",
  });

  // フォームの値をリセット
  const resetNewDocForm = () => {
    setNewDocument({
      title: "",
      content: "",
      type: "pdf",
      url: "",
      keywords: "",
    });
  };

  // ドキュメント作成のミューテーション
  const createDocumentMutation = useMutation({
    mutationFn: async (docData: NewDocumentData) => {
      // キーワードを配列に変換
      const processedData = {
        ...docData,
        keywords: docData.keywords ? docData.keywords.split(',').map(k => k.trim()) : undefined
      };
      delete processedData.keywords; // APIが直接キーワードを受け取らないため削除

      const res = await apiRequest("POST", "/api/documents", processedData);
      const document = await res.json();
      
      // キーワードがある場合は追加登録
      if (docData.keywords) {
        const keywords = docData.keywords.split(',').map(k => k.trim());
        for (const keyword of keywords) {
          await apiRequest("POST", "/api/keywords", {
            documentId: document.id,
            word: keyword
          });
        }
      }
      
      return document;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({
        title: "ドキュメント作成完了",
        description: "新しいドキュメントが登録されました",
      });
      setShowNewDocDialog(false);
      resetNewDocForm();
    },
    onError: (error: any) => {
      toast({
        title: "ドキュメント作成失敗",
        description: error.message || "ドキュメント作成中にエラーが発生しました",
        variant: "destructive",
      });
    },
  });

  // フォーム送信処理
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // バリデーション
    if (!newDocument.title || !newDocument.url) {
      toast({
        title: "入力エラー",
        description: "タイトルとURLは必須です",
        variant: "destructive",
      });
      return;
    }

    createDocumentMutation.mutate(newDocument as NewDocumentData);
  };

  // 入力フィールド更新処理
  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setNewDocument((prev) => ({ ...prev, [name]: value }));
  };

  // セレクト更新処理
  const handleSelectChange = (name: string, value: string) => {
    setNewDocument((prev) => ({ ...prev, [name]: value }));
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
            <FileType className="mr-2 h-6 w-6" />
            ドキュメント管理
          </h1>
          <p className="text-neutral-300">検索と解析に利用する資料を管理します</p>
        </div>

        <div className="flex space-x-2">
          <Link href="/settings">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              設定に戻る
            </Button>
          </Link>
          <Dialog open={showNewDocDialog} onOpenChange={setShowNewDocDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                新規ドキュメント追加
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>新規ドキュメント登録</DialogTitle>
                <DialogDescription>
                  検索対象となる新しいドキュメントを登録します。
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSubmit}>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="title">タイトル</Label>
                    <Input
                      id="title"
                      name="title"
                      value={newDocument.title}
                      onChange={handleInputChange}
                      required
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="type">ドキュメントタイプ</Label>
                    <Select
                      value={newDocument.type}
                      onValueChange={(value) => handleSelectChange("type", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="タイプを選択" />
                      </SelectTrigger>
                      <SelectContent>
                        {documentTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="url">URL/ファイルパス</Label>
                    <Input
                      id="url"
                      name="url"
                      value={newDocument.url}
                      onChange={handleInputChange}
                      required
                    />
                    <p className="text-xs text-neutral-300">
                      ファイルの場所またはURLを指定してください
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="content">説明/概要</Label>
                    <Textarea
                      id="content"
                      name="content"
                      rows={3}
                      value={newDocument.content}
                      onChange={handleInputChange}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="keywords">キーワード</Label>
                    <Input
                      id="keywords"
                      name="keywords"
                      value={newDocument.keywords}
                      onChange={handleInputChange}
                      placeholder="キーワード1, キーワード2, キーワード3"
                    />
                    <p className="text-xs text-neutral-300">
                      カンマ区切りで複数のキーワードを指定できます
                    </p>
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowNewDocDialog(false)}
                  >
                    キャンセル
                  </Button>
                  <Button 
                    type="submit"
                    disabled={createDocumentMutation.isPending}
                  >
                    {createDocumentMutation.isPending ? "登録中..." : "登録"}
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
            <Search className="mr-2 h-5 w-5" />
            登録済みドキュメント
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
                  <TableHead>タイトル</TableHead>
                  <TableHead>タイプ</TableHead>
                  <TableHead>作成日</TableHead>
                  <TableHead>キーワード</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents && documents.length > 0 ? (
                  documents.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell>{doc.id}</TableCell>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span>{doc.title}</span>
                          <span className="text-xs text-neutral-400 truncate max-w-[200px]">
                            {doc.url}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="px-2 py-1 rounded-full text-xs bg-neutral-100">
                          {documentTypes.find(t => t.value === doc.type)?.label || doc.type}
                        </span>
                      </TableCell>
                      <TableCell>
                        {doc.createdAt ? format(new Date(doc.createdAt), 'yyyy/MM/dd') : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {doc.keywords && doc.keywords.length > 0 ? (
                            doc.keywords.map((keyword, i) => (
                              <span 
                                key={i} 
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800"
                              >
                                <Tag className="h-3 w-3 mr-1" />
                                {keyword}
                              </span>
                            ))
                          ) : (
                            <span className="text-neutral-400 text-xs">-</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center">
                      ドキュメントが見つかりません
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
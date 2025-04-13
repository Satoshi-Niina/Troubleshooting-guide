import React, { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileText, Upload, Trash2, FileType } from "lucide-react";
import { Loader2 } from "lucide-react";

interface KnowledgeDocument {
  id: string;
  title: string;
  type: string;
  addedAt: string;
}

const KnowledgeUploader: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // ファイル選択ハンドラ
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setSelectedFile(event.target.files[0]);
      
      // ファイル選択後にinput要素をリセットして、同じファイルを再選択できるようにする
      event.target.value = '';
    }
  };

  // 再処理ハンドラ
  const handleProcessDocument = async (docId: string, title: string) => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/knowledge/${docId}/process`, {
        method: "POST",
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "処理に失敗しました");
      }

      toast({
        title: "処理成功",
        description: `${title} を再処理しました`,
      });
      
      // ドキュメント一覧を再読み込み
      await fetchDocuments();
    } catch (error) {
      console.error("Processing error:", error);
      toast({
        title: "処理エラー",
        description: error instanceof Error ? error.message : "未知のエラーが発生しました",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // ファイルアップロードハンドラ
  const handleUpload = async () => {
    if (!selectedFile) {
      toast({
        title: "ファイルが選択されていません",
        description: "アップロードするファイルを選択してください",
        variant: "destructive",
      });
      return;
    }

    // 対応しているファイル形式をチェック
    const validExtensions = [".pdf", ".docx", ".txt", ".xlsx", ".pptx"];
    const fileExt = selectedFile.name.substring(selectedFile.name.lastIndexOf(".")).toLowerCase();
    if (!validExtensions.includes(fileExt)) {
      toast({
        title: "未対応のファイル形式",
        description: "PDF, Word, Excel, PowerPoint, またはテキストファイルのみアップロード可能です",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch("/api/knowledge/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "アップロードに失敗しました");
      }

      const result = await response.json();

      toast({
        title: "アップロード成功",
        description: `${selectedFile.name} が知識ベースに追加されました`,
      });

      // ドキュメントリストを更新
      fetchDocuments();
      setSelectedFile(null);
      
      // ファイル入力をリセット
      const fileInput = document.getElementById("file-upload") as HTMLInputElement;
      if (fileInput) {
        fileInput.value = "";
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "アップロードエラー",
        description: error instanceof Error ? error.message : "未知のエラーが発生しました",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  // ドキュメント削除ハンドラ
  const handleDeleteDocument = async (docId: string, title: string) => {
    try {
      const response = await fetch(`/api/knowledge/${docId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "削除に失敗しました");
      }

      toast({
        title: "削除成功",
        description: `${title} が知識ベースから削除されました`,
      });

      // ドキュメントリストを更新
      fetchDocuments();
    } catch (error) {
      console.error("Delete error:", error);
      toast({
        title: "削除エラー",
        description: error instanceof Error ? error.message : "未知のエラーが発生しました",
        variant: "destructive",
      });
    }
  };

  // ドキュメントリスト取得
  const fetchDocuments = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/knowledge");
      if (!response.ok) {
        throw new Error("ドキュメントの取得に失敗しました");
      }
      const data = await response.json();
      setDocuments(data);
    } catch (error) {
      console.error("Fetch documents error:", error);
      toast({
        title: "エラー",
        description: "ドキュメントの取得に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // コンポーネントマウント時にドキュメントリストを取得
  React.useEffect(() => {
    fetchDocuments();
  }, []);

  // ファイルタイプに応じたアイコンを返す
  const getFileIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case "pdf":
        return <FileText className="h-5 w-5 text-red-500" />;
      case "word":
        return <FileText className="h-5 w-5 text-blue-500" />;
      case "excel":
        return <FileText className="h-5 w-5 text-green-500" />;
      case "powerpoint":
        return <FileText className="h-5 w-5 text-orange-500" />;
      case "text":
        return <FileText className="h-5 w-5 text-gray-500" />;
      default:
        return <FileType className="h-5 w-5 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-8">
      <Card className="bg-white border border-cyan-200 shadow-sm mb-6">
        <CardHeader className="bg-gradient-to-r from-cyan-50 to-blue-50 border-b border-cyan-100">
          <CardTitle className="text-cyan-700">ナレッジファイルのアップロード</CardTitle>
          <CardDescription className="text-cyan-600">
            保守用車のマニュアルやガイドラインをアップロードし、AIチャットの知識ベースとして活用します
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="mb-6">
            <Label htmlFor="file-upload" className="text-cyan-700 font-medium">ファイルを選択してください</Label>
            <div className="flex mt-2">
              <Input
                id="file-upload"
                type="file"
                onChange={handleFileChange}
                className="bg-cyan-50 border-cyan-200 text-cyan-900"
              />
              <Button
                onClick={handleUpload}
                disabled={!selectedFile || isUploading}
                className="ml-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    処理中...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    アップロード
                  </>
                )}
              </Button>
            </div>
            <p className="text-sm text-cyan-600 mt-2">
              対応フォーマット: PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), テキストファイル (.txt)
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white border border-cyan-200 shadow-sm">
        <CardHeader className="bg-gradient-to-r from-cyan-50 to-blue-50 border-b border-cyan-100">
          <CardTitle className="text-cyan-700">登録済みナレッジ一覧</CardTitle>
          <CardDescription className="text-cyan-600">
            AIがユーザーの質問に回答する際に参照する知識ベースファイル
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-8 text-cyan-400 bg-cyan-50 rounded-lg border border-cyan-100">
              登録されているドキュメントはありません
            </div>
          ) : (
            <Table>
              <TableCaption className="text-cyan-500">AI回答生成に使用されるナレッジ文書一覧</TableCaption>
              <TableHeader>
                <TableRow className="bg-gradient-to-r from-cyan-50 to-blue-50">
                  <TableHead className="w-12"></TableHead>
                  <TableHead className="text-cyan-700">ファイル名</TableHead>
                  <TableHead className="text-cyan-700">タイプ</TableHead>
                  <TableHead className="text-cyan-700">追加日時</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <TableRow key={doc.id} className="hover:bg-cyan-50">
                    <TableCell>{getFileIcon(doc.type)}</TableCell>
                    <TableCell className="font-medium text-cyan-900">{doc.title}</TableCell>
                    <TableCell className="text-cyan-700">{doc.type}</TableCell>
                    <TableCell className="text-cyan-700">{new Date(doc.addedAt).toLocaleString("ja-JP")}</TableCell>
                    <TableCell>
                      <div className="flex space-x-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleProcessDocument(doc.id, doc.title)}
                          className="hover:bg-blue-100 text-blue-500"
                          title="ファイルを再処理"
                        >
                          <FileText className="h-5 w-5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteDocument(doc.id, doc.title)}
                          className="hover:bg-red-100 text-red-500"
                          title="ファイルを削除"
                        >
                          <Trash2 className="h-5 w-5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default KnowledgeUploader;
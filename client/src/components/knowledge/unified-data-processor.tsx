import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, Trash2, FileText, RefreshCw, Database, Image } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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

// タイプ定義
interface ProcessedDocument {
  id: string;
  title: string;
  type: string;
  addedAt: string;
}

interface ProcessingOptions {
  keepOriginalFile: boolean;
  extractKnowledgeBase: boolean;
  extractImageSearch: boolean;
  createQA: boolean;
}

const UnifiedDataProcessor: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [documents, setDocuments] = useState<ProcessedDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 処理オプション（自動化するため、すべてデフォルトで有効に設定）
  const [options, setOptions] = useState<ProcessingOptions>({
    keepOriginalFile: false, // 元ファイルを保存するオプションのみユーザーが選択可能（デフォルトでは無効）
    extractKnowledgeBase: true,
    extractImageSearch: true,
    createQA: true
  });

  // コンポーネントがマウントされたときに文書リストを読み込む
  useEffect(() => {
    fetchDocuments();
  }, []);

  // ドラッグ&ドロップエリアのイベントハンドラー
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      setSelectedFile(file);
    }
  };

  // クリックしてファイル選択するためのハンドラー
  const handleFileSelectClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // ファイル選択ハンドラー
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setSelectedFile(event.target.files[0]);
      
      // 同じファイルを再選択可能にするために入力をリセット
      event.target.value = '';
    }
  };

  // オプション変更ハンドラー
  const handleOptionChange = (option: keyof ProcessingOptions) => {
    setOptions(prev => ({
      ...prev,
      [option]: !prev[option]
    }));
  };

  // ファイルサイズのフォーマット
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // ファイルのアップロードと処理
  const handleProcessFile = async () => {
    if (!selectedFile) {
      toast({
        title: "ファイルが選択されていません",
        description: "処理するファイルを選択してください",
        variant: "destructive",
      });
      return;
    }

    // 対応しているファイル形式をチェック
    const validExtensions = [".pdf", ".docx", ".txt", ".xlsx", ".pptx", ".ppt", ".doc"];
    const fileExt = selectedFile.name.substring(selectedFile.name.lastIndexOf(".")).toLowerCase();
    if (!validExtensions.includes(fileExt)) {
      toast({
        title: "未対応のファイル形式",
        description: "PDF, Word, Excel, PowerPoint, またはテキストファイルのみ処理可能です",
        variant: "destructive",
      });
      return;
    }
    
    // 処理オプションは自動的に有効化されているので確認不要

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("keepOriginalFile", options.keepOriginalFile.toString());
      formData.append("extractKnowledgeBase", options.extractKnowledgeBase.toString());
      formData.append("extractImageSearch", options.extractImageSearch.toString());
      formData.append("createQA", options.createQA.toString());

      // 統合データ処理APIを呼び出す
      const response = await fetch("/api/data-processor/process", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "処理に失敗しました");
      }

      const result = await response.json();

      toast({
        title: "処理成功",
        description: `${selectedFile.name} を処理しました。${result.message || ""}`,
      });

      // 処理完了後、画像検索データを更新するイベントを発生させる
      window.dispatchEvent(new CustomEvent('image-search-data-updated'));

      // 文書リストを更新
      fetchDocuments();
      setSelectedFile(null);
    } catch (error) {
      console.error("Processing error:", error);
      toast({
        title: "処理エラー",
        description: error instanceof Error ? error.message : "未知のエラーが発生しました",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  // 文書の削除
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
        description: `${title} を削除しました`,
      });

      // 文書リストを更新
      fetchDocuments();
      
      // 画像検索データも更新
      window.dispatchEvent(new CustomEvent('image-search-data-updated'));
    } catch (error) {
      console.error("Delete error:", error);
      toast({
        title: "削除エラー",
        description: error instanceof Error ? error.message : "未知のエラーが発生しました",
        variant: "destructive",
      });
    }
  };

  // 文書リストの取得
  const fetchDocuments = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/knowledge");
      if (!response.ok) {
        throw new Error("文書の取得に失敗しました");
      }
      const data = await response.json();
      setDocuments(data);
    } catch (error) {
      console.error("Fetch documents error:", error);
      toast({
        title: "エラー",
        description: "文書リストの取得に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 日付のフォーマット
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).format(date);
    } catch (e) {
      return dateString || '不明';
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow-md border border-blue-100">
        <h2 className="text-xl font-semibold text-blue-800 mb-4">ファイルアップロード処理</h2>
        
        {/* ドラッグ&ドロップエリア */}
        <div
          className={`border-2 border-dashed border-blue-300 rounded-lg p-8 mb-4 text-center cursor-pointer bg-blue-50 hover:bg-blue-100 transition-colors ${
            selectedFile ? 'border-blue-600 bg-blue-100' : ''
          }`}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={handleFileSelectClick}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.docx,.doc,.txt,.xlsx,.xls,.pptx,.ppt"
            onChange={handleFileChange}
          />
          <div className="flex flex-col items-center justify-center">
            <FileText className="w-12 h-12 text-blue-700 mb-2" />
            {selectedFile ? (
              <div>
                <p className="text-lg font-medium text-blue-700">{selectedFile.name}</p>
                <p className="text-sm text-blue-600">({formatFileSize(selectedFile.size)})</p>
              </div>
            ) : (
              <div>
                <p className="text-lg font-medium text-blue-700">ここにファイルをドラッグ&ドロップ</p>
                <p className="text-sm text-gray-500">または<span className="text-blue-600 font-medium">クリックして選択</span></p>
              </div>
            )}
          </div>
        </div>

        {/* 処理オプション（元ファイル保存のみ表示） */}
        <div className="flex items-center space-x-2 mb-4">
          <Checkbox 
            id="keepOriginalFile" 
            checked={options.keepOriginalFile}
            onCheckedChange={() => handleOptionChange('keepOriginalFile')}
          />
          <Label htmlFor="keepOriginalFile" className="cursor-pointer">
            元ファイルを保存する
          </Label>
        </div>

        {/* 処理ボタン */}
        <div className="flex justify-center">
          <Button
            onClick={handleProcessFile}
            disabled={!selectedFile || isUploading}
            className="w-full max-w-md bg-blue-600 hover:bg-blue-700 text-white py-2 rounded"
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                処理中...
              </>
            ) : (
              <>
                <Database className="mr-2 h-5 w-5" />
                処理開始
              </>
            )}
          </Button>
        </div>
      </div>

      {/* 処理済み文書一覧 */}
      <div className="bg-white p-6 rounded-lg shadow-md border border-blue-100">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-blue-800">処理済み文書一覧</h2>
          <Button
            onClick={fetchDocuments}
            variant="outline"
            className="text-blue-600 border-blue-600"
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-2 text-blue-600">読み込み中...</span>
          </div>
        ) : documents.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>タイトル</TableHead>
                  <TableHead>種類</TableHead>
                  <TableHead>追加日時</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">{doc.title || "無題"}</TableCell>
                    <TableCell>{doc.type || "不明"}</TableCell>
                    <TableCell>{formatDate(doc.addedAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteDocument(doc.id, doc.title)}
                        className="text-red-600 hover:text-red-800 hover:bg-red-100"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <Database className="h-12 w-12 mx-auto mb-2 text-gray-400" />
            <p>処理済み文書はありません</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default UnifiedDataProcessor;
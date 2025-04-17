import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Upload, Save, X, Edit, File, FileText, Plus, Download, FolderOpen } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import EmergencyFlowEditor from './emergency-flow-editor';

const EmergencyFlowCreator: React.FC = () => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<string>('file');
  
  // アップロード関連の状態
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  
  // オプション
  const [saveOriginalFile, setSaveOriginalFile] = useState(true);
  const [extractKnowledgeBase, setExtractKnowledgeBase] = useState(true);
  const [extractImageSearch, setExtractImageSearch] = useState(true);
  const [createTroubleshooting, setCreateTroubleshooting] = useState(true);
  
  // フロー編集の状態
  const [flowData, setFlowData] = useState<any>(null);
  
  // ファイル選択のハンドラー
  const handleFileClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      setSelectedFile(files[0]);
    }
  };
  
  // ドラッグ&ドロップイベントハンドラー
  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };
  
  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const files = event.dataTransfer.files;
    if (files && files.length > 0) {
      setSelectedFile(files[0]);
    }
  };
  
  // ファイルアップロード
  const handleUpload = async () => {
    if (!selectedFile) {
      toast({
        title: "エラー",
        description: "ファイルを選択してください",
        variant: "destructive",
      });
      return;
    }
    
    try {
      setIsUploading(true);
      setUploadProgress(0);
      
      // 進行状況の更新処理
      const updateProgress = () => {
        setUploadProgress(prev => {
          const increment = Math.random() * 10;
          const newProgress = Math.min(prev + increment, 95);
          return newProgress;
        });
      };
      
      // 一定間隔で進行状況を更新
      const progressInterval = setInterval(updateProgress, 300);
      
      // フォームデータの作成
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('keepOriginalFile', saveOriginalFile.toString());
      formData.append('extractKnowledgeBase', extractKnowledgeBase.toString());
      formData.append('extractImageSearch', extractImageSearch.toString());
      formData.append('createTroubleshooting', createTroubleshooting.toString());
      
      // ファイルの送信
      const response = await fetch('/api/data-processor/process', {
        method: 'POST',
        body: formData,
      });
      
      // 進行状況の更新を停止
      clearInterval(progressInterval);
      
      const data = await response.json();
      setUploadProgress(100);
      
      if (data.success) {
        setUploadSuccess(true);
        toast({
          title: "成功",
          description: data.message || "ファイルが処理されました",
        });
        
        // 3秒後にリセット
        setTimeout(() => {
          setSelectedFile(null);
          setUploadSuccess(false);
          setUploadProgress(0);
        }, 3000);
      } else {
        throw new Error(data.error || 'ファイル処理中にエラーが発生しました');
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "ファイルのアップロードに失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };
  
  // フロー保存ハンドラー
  const handleSaveFlow = async (data: any) => {
    try {
      // ここで実際のデータをJSONに変換して保存APIを呼び出す
      const response = await fetch('/api/emergency-guide/save-flow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        throw new Error('フローの保存に失敗しました');
      }
      
      const result = await response.json();
      
      if (result.success) {
        toast({
          title: "保存成功",
          description: "応急処置フローが保存されました",
        });
        
        // ファイル読込みタブに戻る
        setActiveTab('file');
      } else {
        throw new Error(result.error || 'フローの保存に失敗しました');
      }
    } catch (error) {
      console.error('保存エラー:', error);
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "フローの保存に失敗しました",
        variant: "destructive",
      });
    }
  };
  
  // フロー作成キャンセルハンドラー
  const handleCancelFlow = () => {
    setActiveTab('file');
  };
  
  return (
    <Card className="w-full max-h-full overflow-auto">
      <CardHeader className="pb-2">
        <CardDescription>ファイルをドラッグ＆ドロップするか、フローを新規作成します</CardDescription>
      </CardHeader>
      
      <CardContent className="overflow-auto">
        <Tabs defaultValue="file" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="file">
              <FolderOpen className="mr-2 h-4 w-4" />
              既存ファイルの編集
            </TabsTrigger>
            <TabsTrigger value="create">
              <Plus className="mr-2 h-4 w-4" />
              新規フロー作成
            </TabsTrigger>
          </TabsList>
          
          {/* ファイル読込みタブコンテンツ */}
          <TabsContent value="file">
            {/* ファイル入力 (非表示) */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".pptx,.ppt,.xlsx,.xls,.pdf,.json"
              className="hidden"
            />
            
            {/* ドラッグ&ドロップエリア */}
            <div
              className={`border-2 border-dashed rounded-lg p-8 mb-4 text-center cursor-pointer transition-colors ${
                selectedFile
                  ? 'border-indigo-600 bg-indigo-50'
                  : 'border-gray-300 hover:border-indigo-400 hover:bg-indigo-50'
              }`}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={handleFileClick}
            >
              {selectedFile ? (
                <div>
                  <FileText className="mx-auto h-12 w-12 text-indigo-600 mb-2" />
                  <p className="text-sm text-gray-800 font-medium">{selectedFile.name}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              ) : (
                <div>
                  <Upload className="mx-auto h-12 w-12 text-gray-400 mb-2" />
                  <p className="text-sm text-gray-600">
                    クリックまたはファイルをドラッグ&ドロップしてください
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    PowerPoint, Excel, PDF, JSONファイルに対応
                  </p>
                </div>
              )}
            </div>
            
            {/* 進行状況 */}
            {isUploading && (
              <div className="mb-4">
                <Progress value={uploadProgress} className="h-2" />
                <p className="text-xs text-center mt-1 text-gray-500">
                  {uploadProgress < 100 ? '処理中...' : '完了!'}
                </p>
              </div>
            )}
            
            {/* アップロードボタン */}
            <div className="flex justify-end mb-6">
              <Button
                onClick={handleUpload}
                disabled={!selectedFile || isUploading}
                className="w-full sm:w-auto"
              >
                {isUploading ? (
                  <>処理中...</>
                ) : uploadSuccess ? (
                  <>完了</>
                ) : (
                  <>アップロード</>
                )}
              </Button>
            </div>
            
            {/* データ保存オプション */}
            <div className="space-y-3 border rounded-md p-4 bg-gray-50">
              <h3 className="font-medium mb-2">処理オプション</h3>
              
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="saveOriginalFile" 
                  checked={saveOriginalFile} 
                  onCheckedChange={(checked) => setSaveOriginalFile(checked === true)}
                />
                <Label htmlFor="saveOriginalFile" className="text-sm text-gray-700">
                  元のファイルも保存する
                </Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="extractKnowledgeBase" 
                  checked={extractKnowledgeBase} 
                  onCheckedChange={(checked) => setExtractKnowledgeBase(checked === true)}
                />
                <Label htmlFor="extractKnowledgeBase" className="text-sm text-gray-700">
                  ナレッジベースに登録する
                </Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="extractImageSearch" 
                  checked={extractImageSearch} 
                  onCheckedChange={(checked) => setExtractImageSearch(checked === true)}
                />
                <Label htmlFor="extractImageSearch" className="text-sm text-gray-700">
                  画像検索データを抽出する
                </Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="createTroubleshooting" 
                  checked={createTroubleshooting} 
                  onCheckedChange={(checked) => setCreateTroubleshooting(checked === true)}
                />
                <Label htmlFor="createTroubleshooting" className="text-sm text-gray-700">
                  トラブルシューティングフローを自動生成する
                </Label>
              </div>
            </div>
          </TabsContent>
          
          {/* 新規フロー作成タブコンテンツ */}
          <TabsContent value="create" className="h-full">
            <EmergencyFlowEditor 
              onSave={handleSaveFlow}
              onCancel={handleCancelFlow}
              initialData={flowData}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default EmergencyFlowCreator;
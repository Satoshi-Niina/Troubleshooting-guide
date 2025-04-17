import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Upload, Save, X, Edit, File, FileText, Plus, Download, FolderOpen, Trash2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  
  // アップロード完了時のファイル名を保持
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  
  // フロー編集の状態
  const [flowData, setFlowData] = useState<any>(null);
  
  // キャラクター削除関連の状態
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [flowToDelete, setFlowToDelete] = useState<string | null>(null);
  
  // 保存済みフローのリスト
  const [flowList, setFlowList] = useState<any[]>([]);
  const [isLoadingFlowList, setIsLoadingFlowList] = useState(false);
  
  // フロー一覧を取得
  const fetchFlowList = async () => {
    try {
      setIsLoadingFlowList(true);
      const response = await fetch('/api/emergency-guide/list');
      
      if (!response.ok) {
        throw new Error('フロー一覧の取得に失敗しました');
      }
      
      const data = await response.json();
      setFlowList(data);
    } catch (error) {
      console.error('フロー一覧取得エラー:', error);
      toast({
        title: "エラー",
        description: "フロー一覧の取得に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsLoadingFlowList(false);
    }
  };
  
  // コンポーネントマウント時にフローリストを取得
  useEffect(() => {
    fetchFlowList();
  }, []);
  
  // ファイル選択のハンドラー
  const handleFileClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      setSelectedFile(file);
      
      // JSONファイルの場合は直接読み込む
      if (file.name.toLowerCase().endsWith('.json')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const jsonData = JSON.parse(e.target?.result as string);
            // ファイル名情報を追加
            jsonData.fileName = file.name;
            setUploadedFileName(file.name);
            setFlowData(jsonData);
            
            // 読み込み成功したらエディタに切り替え
            setActiveTab('create');
            toast({
              title: "JSONファイル読み込み",
              description: "フローデータをエディタで編集できます",
            });
          } catch (error) {
            toast({
              title: "エラー",
              description: "JSONファイルの解析に失敗しました",
              variant: "destructive",
            });
          }
        };
        reader.readAsText(file);
      }
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
      const file = files[0];
      setSelectedFile(file);
      
      // JSONファイルの場合は直接読み込む
      if (file.name.toLowerCase().endsWith('.json')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const jsonData = JSON.parse(e.target?.result as string);
            // ファイル名情報を追加
            jsonData.fileName = file.name;
            setUploadedFileName(file.name);
            setFlowData(jsonData);
            
            // 読み込み成功したらエディタに切り替え
            setActiveTab('create');
            toast({
              title: "JSONファイル読み込み",
              description: "フローデータをエディタで編集できます",
            });
          } catch (error) {
            toast({
              title: "エラー",
              description: "JSONファイルの解析に失敗しました",
              variant: "destructive",
            });
          }
        };
        reader.readAsText(file);
      }
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
      
      // JSONファイルを直接読み込み、編集画面に切り替える
      if (selectedFile.name.toLowerCase().endsWith('.json')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const jsonData = JSON.parse(e.target?.result as string);
            // ファイル名情報を追加
            jsonData.fileName = selectedFile.name;
            setUploadedFileName(selectedFile.name);
            setFlowData(jsonData);
            
            // 読み込み成功したらエディタに切り替え
            setActiveTab('create');
            setUploadSuccess(true);
            toast({
              title: "JSONファイル読込み成功",
              description: "フローデータをエディタで編集できます",
            });
            
            // 進行状況の更新を停止
            clearInterval(progressInterval);
            setUploadProgress(100);
            
            // 3秒後にリセット（ファイル選択状態のみ）
            setTimeout(() => {
              setSelectedFile(null);
              setUploadSuccess(false);
              setUploadProgress(0);
            }, 3000);
          } catch (error) {
            clearInterval(progressInterval);
            setUploadProgress(0);
            toast({
              title: "エラー",
              description: "JSONファイルの解析に失敗しました",
              variant: "destructive",
            });
          }
        };
        reader.readAsText(selectedFile);
        return;
      }
      
      // フォームデータの作成
      const formData = new FormData();
      formData.append('file', selectedFile);
      // ファイル名を保存
      setUploadedFileName(selectedFile.name);
      
      // すべてのオプションを有効化
      formData.append('options', JSON.stringify({
        keepOriginalFile: true,
        extractKnowledgeBase: true,
        extractImageSearch: true,
        createTroubleshooting: true
      }));
      
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
  
  // 新規フロー作成ハンドラー
  const handleCreateNewFlow = () => {
    // 空のフローデータで初期化
    setFlowData(null);
    setUploadedFileName('');
    setActiveTab('create');
  };
  
  // キャラクター削除確認ダイアログを表示
  const handleDeleteCharacter = (id: string) => {
    setFlowToDelete(id);
    setShowConfirmDelete(true);
  };
  
  // 特定のフローを読み込む
  const loadFlow = async (id: string) => {
    try {
      const response = await fetch(`/api/emergency-guide/detail/${id}`);
      
      if (!response.ok) {
        throw new Error('フローデータの取得に失敗しました');
      }
      
      const data = await response.json();
      // フローデータを設定
      setFlowData(data.data);
      
      // ファイル名を設定（フロー名から）
      const flow = flowList.find(f => f.id === id);
      if (flow) {
        setUploadedFileName(flow.fileName || `${flow.title}.json`);
      }
      
      // エディタタブに切り替え
      setActiveTab('create');
      
      toast({
        title: "フロー読込み",
        description: "フローデータをエディタで編集できます",
      });
    } catch (error) {
      console.error('フロー読込みエラー:', error);
      toast({
        title: "エラー",
        description: "フローデータの読込みに失敗しました",
        variant: "destructive",
      });
    }
  };
  
  // キャラクター削除実行
  const executeDeleteCharacter = async () => {
    if (!flowToDelete) return;
    
    try {
      const response = await fetch(`/api/emergency-guide/delete/${flowToDelete}`, {
        method: 'DELETE',
      });
      
      const result = await response.json();
      
      if (result.success) {
        toast({
          title: "削除成功",
          description: "キャラクターが削除されました",
        });
        // 削除後にフローリストを再取得
        fetchFlowList();
      } else {
        throw new Error(result.error || '削除に失敗しました');
      }
    } catch (error) {
      console.error('削除エラー:', error);
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "削除に失敗しました",
        variant: "destructive",
      });
    } finally {
      setShowConfirmDelete(false);
      setFlowToDelete(null);
    }
  };
  
  return (
    <>
      <Card className="w-full max-h-full overflow-auto">
        <CardHeader className="pb-2">
          <CardDescription>応急処置データ管理：新規作成・キャラクターデザイン・テキストフロー編集</CardDescription>
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
                accept=".json"
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
                      JSONファイルをクリックまたはドラッグ&ドロップしてください
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      読み込んだデータをReact Flowで編集できます
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
                    <>読込み</>
                  )}
                </Button>
              </div>
              
              {/* 新規フロー作成ボタン */}
              <div className="mt-6 mb-2">
                <Button
                  onClick={handleCreateNewFlow}
                  variant="outline"
                  className="w-full"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  新規フローを作成する
                </Button>
              </div>
              
              {/* 補足情報やヒント */}
              <div className="mt-2 text-xs text-gray-500 italic">
                読み込んだファイルはフローエディタで編集できます。JSONファイルを選択すると直接編集が可能です。
              </div>
            </TabsContent>
            
            {/* 新規フロー作成タブコンテンツ */}
            <TabsContent value="create" className="h-full">
              <EmergencyFlowEditor 
                onSave={handleSaveFlow}
                onCancel={handleCancelFlow}
                initialData={{
                  ...flowData,
                  fileName: uploadedFileName || (flowData?.fileName || '')
                }}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      
      {/* キャラクター削除確認ダイアログ */}
      <AlertDialog open={showConfirmDelete} onOpenChange={setShowConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>キャラクターを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              このキャラクターを削除すると、すべての関連データが失われます。この操作は元に戻すことができません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowConfirmDelete(false)}>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={executeDeleteCharacter} className="bg-red-600 hover:bg-red-700">
              <Trash2 className="mr-2 h-4 w-4" />
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default EmergencyFlowCreator;
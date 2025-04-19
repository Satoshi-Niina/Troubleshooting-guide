import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Upload, Save, X, Edit, File, FileText, Plus, Download, FolderOpen, Trash2, RefreshCw } from 'lucide-react';
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
  // activeTabは使用しなくなったため削除
  
  // キャラクターデザインタブ内のサブタブ
  const [characterDesignTab, setCharacterDesignTab] = useState<string>('new');
  
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
            
            // データに nodes や edges がない場合は空の配列を設定
            // この処理により既存のJSONデータから常に有効なキャラクターデータを作成できる
            const enhancedData = {
              ...jsonData,
              nodes: jsonData.nodes || [],
              edges: jsonData.edges || []
            };
            
            setFlowData(enhancedData);
            
            // 読み込み成功したらキャラクターデザインタブの「新規作成」に切り替え
            setCharacterDesignTab('new');
            toast({
              title: "JSONファイル読み込み完了",
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
            
            // データに nodes や edges がない場合は空の配列を設定
            // この処理により既存のJSONデータから常に有効なキャラクターデータを作成できる
            const enhancedData = {
              ...jsonData,
              nodes: jsonData.nodes || [],
              edges: jsonData.edges || []
            };
            
            setFlowData(enhancedData);
            
            // 読み込み成功したらキャラクターデザインタブの「新規作成」に切り替え
            setCharacterDesignTab('new');
            toast({
              title: "JSONファイル読み込み完了",
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
            
            // 読み込み成功したら、キャラクター編集用に「新規作成」タブに切り替え
            setCharacterDesignTab('new');
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
        
        // フローリストを更新
        fetchFlowList();
        
        // ファイル編集タブに戻る
        setCharacterDesignTab('file');
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
    setCharacterDesignTab('file');
  };
  
  // 新規フロー作成ハンドラー
  const handleCreateNewFlow = () => {
    // 空のフローデータで初期化
    setFlowData(null);
    setUploadedFileName('');
    setCharacterDesignTab('new');
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
      // データに nodes や edges がない場合は、空の配列を追加
      // この処理により既存のJSONデータから常に有効なキャラクターデータを作成できる
      const enhancedData = {
        ...data.data,
        nodes: data.data.nodes || [],
        edges: data.data.edges || []
      };
      
      setFlowData(enhancedData);
      
      // ファイル名を設定（フロー名から）
      const flow = flowList.find(f => f.id === id);
      if (flow) {
        setUploadedFileName(flow.fileName || `${flow.title}.json`);
      }
      
      // データを読み込み、「新規作成」タブに切り替えてキャラクターを編集できるようにする
      setCharacterDesignTab('new');
      
      toast({
        title: "フロー読込み完了",
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
      <Card className="w-full h-screen max-h-[calc(100vh-120px)] overflow-auto">
        <CardHeader className="pb-2 sticky top-0 bg-white z-10">
          <CardDescription>応急処置データ管理</CardDescription>
        </CardHeader>
        
        <CardContent className="overflow-y-auto pb-24">
          <Tabs defaultValue="new" value={characterDesignTab} onValueChange={setCharacterDesignTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="new">
                <Plus className="mr-2 h-4 w-4" />
                新規作成
              </TabsTrigger>
              <TabsTrigger value="file">
                <FolderOpen className="mr-2 h-4 w-4" />
                ファイル編集
              </TabsTrigger>
            </TabsList>
            
            {/* ファイル入力 (非表示) */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".json"
              className="hidden"
            />

            {/* 新規作成タブ */}
            <TabsContent value="new" className="h-full">
              <EmergencyFlowEditor 
                onSave={handleSaveFlow}
                onCancel={handleCancelFlow}
                initialData={{
                  ...flowData,
                  fileName: uploadedFileName || (flowData?.fileName || '')
                }}
              />
            </TabsContent>
            
            {/* ファイル編集タブ */}
            <TabsContent value="file" className="h-full">
              <div className="space-y-4">
                <div className="border-2 border-dashed rounded-lg p-8 mb-4 text-center cursor-pointer transition-colors border-gray-300 hover:border-indigo-400 hover:bg-indigo-50"
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.click();
                    }
                  }}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                >
                  <Upload className="mx-auto h-12 w-12 text-gray-400 mb-2" />
                  <p className="text-sm text-gray-600">
                    JSONファイルをクリックまたはドラッグ&ドロップしてください
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    既存のJSONデータからキャラクターを生成・編集できます
                  </p>
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
                {selectedFile && (
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
                )}
                
                {/* 保存済みキャラクター一覧 */}
                <div className="mt-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-medium">保存済みキャラクター一覧</h3>
                    <Button variant="outline" size="sm" onClick={fetchFlowList} disabled={isLoadingFlowList}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      更新
                    </Button>
                  </div>
                  
                  {isLoadingFlowList ? (
                    <div className="py-4 text-center text-gray-500">読込中...</div>
                  ) : flowList.length === 0 ? (
                    <div className="py-4 text-center text-gray-500">保存済みのキャラクターはありません</div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {flowList.map(flow => (
                        <Card key={flow.id} className="overflow-hidden">
                          <CardHeader className="p-4 pb-2">
                            <CardTitle className="text-md">{flow.title}</CardTitle>
                            <CardDescription className="text-xs">
                              作成日: {new Date(flow.createdAt).toLocaleString()}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="p-4 pt-2">
                            <div className="flex justify-end gap-2">
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => loadFlow(flow.id)}
                              >
                                編集
                              </Button>
                              <Button 
                                variant="destructive" 
                                size="sm"
                                onClick={() => handleDeleteCharacter(flow.id)}
                              >
                                削除
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </div>
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
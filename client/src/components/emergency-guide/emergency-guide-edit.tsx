import React, { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetClose,
  SheetFooter,
} from '@/components/ui/sheet';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Pencil, Save, X, Plus, Trash2, FileText, LifeBuoy, Sparkles, AlertCircle, RefreshCcw } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { WarningDialog } from '../shared/warning-dialog';

// APIからのガイドファイル型定義
interface GuideFile {
  id: string;
  filePath: string;
  fileName: string;
  title: string;
  createdAt: string;
  slideCount: number;
}

// メタデータフィールドの型
type MetadataField = 'タイトル' | '作成者' | '作成日' | '修正日' | '説明';

// ガイド詳細データ型定義
interface GuideData {
  id: string;
  data: {
    metadata: {
      タイトル: string;
      作成者: string;
      作成日: string;
      修正日: string;
      説明: string;
    };
    slides: Array<{
      スライド番号: number;
      タイトル: string;
      本文: string[];
      ノート: string;
      画像テキスト: Array<{
        画像パス: string;
        テキスト: string;
      }>;
    }>;
  };
}

// 接続番号の型定義
interface ConnectionNumber {
  id: string;
  label: string;
  value: string;
}

const EmergencyGuideEdit: React.FC = () => {
  const { toast } = useToast();
  
  // ガイドファイルリストの状態
  const [guideFiles, setGuideFiles] = useState<GuideFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGuideId, setSelectedGuideId] = useState<string | null>(null);
  const [guideData, setGuideData] = useState<GuideData | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editedGuideData, setEditedGuideData] = useState<any>(null);
  const [showEditCard, setShowEditCard] = useState(false); // 編集カードを表示するかどうかのフラグ
  
  // 削除確認ダイアログの状態
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<GuideFile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // 接続番号の状態
  const [connectionNumbers, setConnectionNumbers] = useState<ConnectionNumber[]>([]);
  const [showConnectionDialog, setShowConnectionDialog] = useState(false);
  const [newConnection, setNewConnection] = useState<{label: string, value: string}>({
    label: '',
    value: ''
  });
  
  // ガイドファイル一覧を取得
  const fetchGuideFiles = async () => {
    try {
      setLoading(true);
      // キャッシュバスティングのためにタイムスタンプパラメータを追加
      const timestamp = new Date().getTime();
      const response = await fetch(`/api/emergency-guide/list?_t=${timestamp}`);
      
      if (!response.ok) {
        throw new Error('ガイドファイル一覧の取得に失敗しました');
      }
      
      const data = await response.json();
      console.log('サーバーから取得したガイド一覧:', data);
      setGuideFiles(data);
    } catch (error) {
      console.error('ガイドファイル取得エラー:', error);
      toast({
        title: 'エラー',
        description: 'ガイドファイル一覧の取得に失敗しました',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };
  
  // ガイド詳細データの取得
  const fetchGuideData = async (id: string) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/emergency-guide/detail/${id}`);
      
      if (!response.ok) {
        throw new Error('ガイド詳細データの取得に失敗しました');
      }
      
      const data = await response.json();
      setGuideData(data);
      setEditedGuideData(JSON.parse(JSON.stringify(data.data))); // ディープコピー
      
      // テキスト内の接続番号を抽出
      extractConnectionNumbers(data.data);
    } catch (error) {
      console.error('ガイド詳細取得エラー:', error);
      toast({
        title: 'エラー',
        description: 'ガイド詳細の取得に失敗しました',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };
  
  // 詳細表示ダイアログの状態
  const [showGuideDetailDialog, setShowGuideDetailDialog] = useState(false);
  
  // 保存確認ダイアログの状態
  const [showSaveConfirmDialog, setShowSaveConfirmDialog] = useState(false);
  const [saveChanges, setSaveChanges] = useState<{
    added: number;
    modified: number;
    deleted: number;
  }>({ added: 0, modified: 0, deleted: 0 });
  
  // 変更内容を分析する関数
  const analyzeChanges = () => {
    if (!guideData || !editedGuideData) return { added: 0, modified: 0, deleted: 0 };
    
    let added = 0;
    let modified = 0;
    let deleted = 0;
    
    // メタデータの変更をチェック
    const metadataKeys = ['タイトル', '作成者', '説明'] as const;
    metadataKeys.forEach(key => {
      if (guideData.data.metadata[key] !== editedGuideData.metadata[key]) {
        modified++;
      }
    });
    
    // スライド数の変更をチェック
    if (guideData.data.slides.length > editedGuideData.slides.length) {
      deleted += guideData.data.slides.length - editedGuideData.slides.length;
    } else if (guideData.data.slides.length < editedGuideData.slides.length) {
      added += editedGuideData.slides.length - guideData.data.slides.length;
    }
    
    // 共通するスライドの変更をチェック
    const minSlideCount = Math.min(guideData.data.slides.length, editedGuideData.slides.length);
    for (let i = 0; i < minSlideCount; i++) {
      const origSlide = guideData.data.slides[i];
      const editedSlide = editedGuideData.slides[i];
      
      // スライドの各部分を比較
      if (origSlide.タイトル !== editedSlide.タイトル || 
          origSlide.ノート !== editedSlide.ノート ||
          JSON.stringify(origSlide.本文) !== JSON.stringify(editedSlide.本文)) {
        modified++;
      }
    }
    
    return { added, modified, deleted };
  };

  // 保存ボタンがクリックされたときの処理
  const handleSaveClick = () => {
    if (!selectedGuideId || !editedGuideData) return;
    
    // 変更内容を分析
    const changes = analyzeChanges();
    setSaveChanges(changes);
    
    // 変更がある場合、確認ダイアログを表示
    if (changes.added > 0 || changes.modified > 0 || changes.deleted > 0) {
      setShowSaveConfirmDialog(true);
    } else {
      // 変更がない場合は編集モードを終了
      setIsEditing(false);
      toast({
        title: "変更なし",
        description: "変更点はありませんでした",
      });
    }
  };

  // ガイドデータの更新
  const updateGuideData = async () => {
    if (!selectedGuideId || !editedGuideData) return;
    
    try {
      setIsSaving(true);
      const response = await fetch(`/api/emergency-guide/update/${selectedGuideId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          data: editedGuideData,
          connectionNumbers: connectionNumbers
        })
      });
      
      if (!response.ok) {
        throw new Error('応急復旧フローデータの更新に失敗しました');
      }
      
      // 更新成功
      toast({
        title: '更新完了',
        description: '応急復旧フローデータを更新しました',
      });
      
      // 最新データを再取得
      fetchGuideData(selectedGuideId);
      setIsEditing(false);
      // 確認ダイアログを閉じる
      setShowSaveConfirmDialog(false);
    } catch (error) {
      console.error('ガイド更新エラー:', error);
      toast({
        title: 'エラー',
        description: '応急復旧フローデータの更新に失敗しました',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };
  
  // テキスト内の接続番号を抽出する関数
  const extractConnectionNumbers = (data: any) => {
    const connections: ConnectionNumber[] = [];
    const regex = /接続番号\s*[:：]\s*(\d+)/g;
    
    // メタデータの説明から抽出
    if (data.metadata && data.metadata.説明) {
      let match;
      while ((match = regex.exec(data.metadata.説明)) !== null) {
        connections.push({
          id: `metadata-${connections.length}`,
          label: `メタデータの説明`,
          value: match[1]
        });
      }
    }
    
    // 各スライドの本文から抽出
    if (data.slides) {
      data.slides.forEach((slide: any, slideIndex: number) => {
        if (slide.本文) {
          slide.本文.forEach((text: string, textIndex: number) => {
            let match;
            regex.lastIndex = 0; // 正規表現のインデックスをリセット
            while ((match = regex.exec(text)) !== null) {
              connections.push({
                id: `slide-${slideIndex}-text-${textIndex}-${connections.length}`,
                label: `スライド ${slide.スライド番号} の本文`,
                value: match[1]
              });
            }
          });
        }
        
        // ノートからも抽出
        if (slide.ノート) {
          let match;
          regex.lastIndex = 0;
          while ((match = regex.exec(slide.ノート)) !== null) {
            connections.push({
              id: `slide-${slideIndex}-note-${connections.length}`,
              label: `スライド ${slide.スライド番号} のノート`,
              value: match[1]
            });
          }
        }
      });
    }
    
    // 重複を除去
    const uniqueConnections = connections.filter((connection, index, self) => 
      index === self.findIndex((c) => c.value === connection.value)
    );
    
    setConnectionNumbers(uniqueConnections);
  };
  
  // 接続番号を一括更新する関数
  const updateAllConnectionNumbers = (oldValue: string, newValue: string) => {
    if (!editedGuideData) return;
    
    const updatedData = JSON.parse(JSON.stringify(editedGuideData));
    const regex = new RegExp(`接続番号\\s*[:：]\\s*${oldValue}`, 'g');
    const replacement = `接続番号: ${newValue}`;
    
    // メタデータの説明を更新
    if (updatedData.metadata && updatedData.metadata.説明) {
      updatedData.metadata.説明 = updatedData.metadata.説明.replace(regex, replacement);
    }
    
    // 各スライドの本文を更新
    if (updatedData.slides) {
      updatedData.slides.forEach((slide: any) => {
        if (slide.本文) {
          slide.本文 = slide.本文.map((text: string) => text.replace(regex, replacement));
        }
        if (slide.ノート) {
          slide.ノート = slide.ノート.replace(regex, replacement);
        }
      });
    }
    
    setEditedGuideData(updatedData);
    
    // 接続番号リストも更新
    setConnectionNumbers(prev => 
      prev.map(conn => 
        conn.value === oldValue 
          ? { ...conn, value: newValue } 
          : conn
      )
    );
    
    toast({
      title: '接続番号を更新',
      description: `接続番号 ${oldValue} を ${newValue} に変更しました`,
    });
  };
  
  // 新しい接続番号を追加
  const addConnectionNumber = () => {
    if (!newConnection.label || !newConnection.value) {
      toast({
        title: '入力エラー',
        description: 'ラベルと値を入力してください',
        variant: 'destructive',
      });
      return;
    }
    
    // 既存の接続番号リストを更新
    const newId = `custom-${Date.now()}`;
    setConnectionNumbers([
      ...connectionNumbers,
      {
        id: newId,
        label: newConnection.label,
        value: newConnection.value
      }
    ]);
    
    // 入力フォームをリセット
    setNewConnection({ label: '', value: '' });
    setShowConnectionDialog(false);
    
    toast({
      title: '接続番号を追加',
      description: `新しい接続番号 (${newConnection.value}) を追加しました`,
    });
  };
  
  // メタデータの編集ハンドラ
  const handleMetadataChange = (field: MetadataField, value: string) => {
    if (!editedGuideData) return;
    
    setEditedGuideData({
      ...editedGuideData,
      metadata: {
        ...editedGuideData.metadata,
        [field]: value
      }
    });
  };
  
  // スライド内容の編集ハンドラ
  const handleSlideChange = (slideIndex: number, field: string, value: any) => {
    if (!editedGuideData) return;
    
    const updatedSlides = [...editedGuideData.slides];
    updatedSlides[slideIndex] = {
      ...updatedSlides[slideIndex],
      [field]: value
    };
    
    setEditedGuideData({
      ...editedGuideData,
      slides: updatedSlides
    });
  };
  
  // スライド本文テキストの編集ハンドラ
  const handleSlideTextChange = (slideIndex: number, textIndex: number, value: string) => {
    if (!editedGuideData) return;
    
    const updatedSlides = [...editedGuideData.slides];
    const updatedTexts = [...updatedSlides[slideIndex].本文];
    updatedTexts[textIndex] = value;
    
    updatedSlides[slideIndex] = {
      ...updatedSlides[slideIndex],
      本文: updatedTexts
    };
    
    setEditedGuideData({
      ...editedGuideData,
      slides: updatedSlides
    });
  };
  
  // フロー生成を処理する関数
  const handleGenerateFlow = async (guideId: string, guideTitle: string) => {
    try {
      toast({
        title: 'フロー生成中',
        description: `「${guideTitle}」からフローを生成しています...`,
      });
      
      const response = await fetch(`/api/flow-generator/generate-from-guide/${guideId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('フロー生成に失敗しました');
      }
      
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: 'フロー生成完了',
          description: `「${data.flowData.title}」フローが生成されました`,
        });
        
        // フロー編集画面に遷移
        const flowId = data.flowData.id;
        window.location.href = `/troubleshooting?flowId=${flowId}`;
      } else {
        throw new Error(data.error || 'フロー生成に失敗しました');
      }
    } catch (error) {
      console.error('フロー生成エラー:', error);
      toast({
        title: 'フロー生成エラー',
        description: error instanceof Error ? error.message : '不明なエラーが発生しました',
        variant: 'destructive',
      });
    }
  };
  
  // ガイド削除処理
  const handleDeleteGuide = async () => {
    if (!fileToDelete) return;
    
    try {
      setIsDeleting(true);
      
      // 削除開始メッセージを表示
      toast({
        title: '削除中',
        description: `「${fileToDelete.title}」を削除しています...`,
      });
      
      // 削除リクエストを送信
      const response = await fetch(`/api/emergency-guide/delete/${fileToDelete.id}`, {
        method: 'DELETE'
      });
      
      // レスポンスを確認
      if (response.ok) {
        // 削除成功メッセージを表示
        toast({
          title: '削除完了',
          description: `「${fileToDelete.title}」を削除しました`,
        });
        
        // 一覧から該当項目を削除（クライアント側で即時反映）
        setGuideFiles(prevFiles => 
          prevFiles.filter(f => f.id !== fileToDelete.id)
        );
        
        // サーバー側の処理完了を待つため十分な遅延を設定
        console.log(`ID=${fileToDelete.id}を削除しました。リスト更新を待機中...`);
        
        // サーバーキャッシュをクリア
        try {
          console.log('サーバーキャッシュをクリア中...');
          await fetch('/api/tech-support/clear-cache', {
            method: 'POST',
            headers: {
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache'
            }
          });
          console.log('サーバーキャッシュクリア完了');
        } catch (e) {
          console.error('キャッシュクリア失敗:', e);
        }
        
        // より長い遅延を設定してサーバー側の処理完了を確実に待つ (3秒)
        setTimeout(() => {
          console.log('サーバーからデータを再取得します...');
          fetchGuideFiles();
          
          // さらに遅延して2回目のフェッチを実行（削除後の整合性を確保するため）
          setTimeout(() => {
            console.log('整合性確認のため、2回目のデータ取得を実行...');
            fetchGuideFiles();
          }, 1500);
        }, 3000);
      } else {
        // エラーレスポンスの詳細を取得
        const errorData = await response.json();
        console.error('削除エラー (サーバー):', errorData);
        throw new Error(errorData.error || '削除に失敗しました');
      }
    } catch (error) {
      // エラー処理
      console.error('削除エラー:', error);
      toast({
        title: 'エラー',
        description: error instanceof Error ? error.message : 'ファイルの削除に失敗しました',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
      setFileToDelete(null);
    }
  };
  
  // 初期データの読み込み
  useEffect(() => {
    fetchGuideFiles();
  }, []);
  
  // ガイドが選択されたときの処理
  useEffect(() => {
    if (selectedGuideId) {
      fetchGuideData(selectedGuideId);
    }
  }, [selectedGuideId]);
  
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
      return dateString;
    }
  };
  
  return (
    <div className="container mx-auto p-4">
      <div className="flex flex-col gap-6">
        {/* ヘッダー - ページ上部に既にタイトルがあるので削除 */}
        
        {/* 削除確認ダイアログ */}
        <WarningDialog
          open={showDeleteDialog}
          title="ファイル削除の確認"
          message={fileToDelete ? `「${fileToDelete.title}」を削除してもよろしいですか？\n削除すると元に戻せません。` : ''}
          onCancel={() => {
            setShowDeleteDialog(false);
            setFileToDelete(null);
          }}
          onConfirm={handleDeleteGuide}
        />
        
        {/* ガイドファイル一覧 */}
        <Card>
          <CardHeader>
            <CardTitle>ファイル一覧</CardTitle>
            <CardDescription>編集するファイルを選択してください</CardDescription>
          </CardHeader>
          <CardContent>
            {loading && !guideFiles.length ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
              </div>
            ) : guideFiles.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <FileText className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                <p>ファイルがありません</p>
                <p className="text-sm mt-2">PowerPoint, Excel, またはPDFファイルをアップロードして処理してください</p>
              </div>
            ) : (
              <ScrollArea className="h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>タイトル</TableHead>
                      <TableHead>作成日</TableHead>
                      <TableHead>スライド数</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {guideFiles.map((file) => (
                      <TableRow 
                        key={file.id}
                        className={selectedGuideId === file.id ? 'bg-indigo-50' : ''}
                      >
                        <TableCell className="font-medium">{file.title}</TableCell>
                        <TableCell>{formatDate(file.createdAt)}</TableCell>
                        <TableCell>{file.slideCount}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => window.location.href = `/troubleshooting?guideId=${file.id}`}
                            >
                              <Pencil className="h-4 w-4 mr-1" />
                              編集
                            </Button>

                            <Button
                              variant="outline"
                              size="sm"
                              className="bg-red-50 hover:bg-red-100 text-red-700 hover:text-red-800"
                              onClick={() => {
                                // 削除確認ダイアログを表示するためのデータをセット
                                setFileToDelete(file);
                                setShowDeleteDialog(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              削除
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
        
        {/* ガイド編集エリア - 新しいウィンドウで開くため、このエリアは非表示にする */}
        {false && selectedGuideId && guideData && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle>応急復旧データ編集</CardTitle>
                <CardDescription>
                  {guideData?.data.metadata.タイトル} ({formatDate(guideData?.data.metadata.作成日 || "")})
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {isEditing ? (
                  <>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        setIsEditing(false);
                        if (guideData) {
                          setEditedGuideData(JSON.parse(JSON.stringify(guideData.data)));
                        }
                      }}
                      disabled={isSaving}
                    >
                      <X className="h-4 w-4 mr-1" />
                      キャンセル
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleSaveClick}
                      disabled={isSaving}
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          保存中...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-1" />
                          保存
                        </>
                      )}
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditing(true)}
                  >
                    <Pencil className="h-4 w-4 mr-1" />
                    編集
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="metadata" className="w-full">
                <TabsList className="grid grid-cols-3 mb-4">
                  <TabsTrigger value="metadata">メタデータ</TabsTrigger>
                  <TabsTrigger value="slides">スライド内容</TabsTrigger>
                  <TabsTrigger value="connections">接続番号</TabsTrigger>
                </TabsList>
                
                {/* メタデータタブ */}
                <TabsContent value="metadata">
                  <div className="space-y-4">
                    <div className="grid gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="title">タイトル</Label>
                        <Input
                          id="title"
                          value={isEditing ? editedGuideData.metadata.タイトル : guideData?.data.metadata.タイトル || ""}
                          onChange={(e) => handleMetadataChange('タイトル', e.target.value)}
                          disabled={!isEditing}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="author">作成者</Label>
                        <Input
                          id="author"
                          value={isEditing ? editedGuideData.metadata.作成者 : guideData?.data.metadata.作成者 || ""}
                          onChange={(e) => handleMetadataChange('作成者', e.target.value)}
                          disabled={!isEditing}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="description">説明</Label>
                        <Textarea
                          id="description"
                          rows={5}
                          value={isEditing ? editedGuideData.metadata.説明 : guideData?.data.metadata.説明 || ""}
                          onChange={(e) => handleMetadataChange('説明', e.target.value)}
                          disabled={!isEditing}
                        />
                      </div>
                    </div>
                  </div>
                </TabsContent>
                
                {/* スライド内容タブ */}
                <TabsContent value="slides">
                  <div className="space-y-8">
                    {(isEditing ? editedGuideData.slides : guideData?.data.slides || []).map((slide: any, slideIndex: number) => (
                      <Card key={slideIndex} className="border-indigo-200">
                        <CardHeader className="bg-indigo-50 rounded-t-lg">
                          <div className="flex justify-between items-center">
                            <CardTitle className="text-lg">
                              スライド {slide.スライド番号}: {slide.タイトル}
                            </CardTitle>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-4">
                          <div className="grid gap-2">
                            <Label htmlFor={`slide-${slideIndex}-title`}>タイトル</Label>
                            <Input
                              id={`slide-${slideIndex}-title`}
                              value={slide.タイトル}
                              onChange={(e) => handleSlideChange(slideIndex, 'タイトル', e.target.value)}
                              disabled={!isEditing}
                            />
                          </div>
                          
                          <div className="grid gap-2">
                            <Label htmlFor={`slide-${slideIndex}-text`}>本文</Label>
                            {slide.本文.map((text: string, textIndex: number) => (
                              <Textarea
                                key={textIndex}
                                id={`slide-${slideIndex}-text-${textIndex}`}
                                rows={3}
                                value={text}
                                onChange={(e) => handleSlideTextChange(slideIndex, textIndex, e.target.value)}
                                disabled={!isEditing}
                                className="mb-2"
                              />
                            ))}
                          </div>
                          
                          <div className="grid gap-2">
                            <Label htmlFor={`slide-${slideIndex}-note`}>ノート</Label>
                            <Textarea
                              id={`slide-${slideIndex}-note`}
                              rows={3}
                              value={slide.ノート}
                              onChange={(e) => handleSlideChange(slideIndex, 'ノート', e.target.value)}
                              disabled={!isEditing}
                            />
                          </div>
                          
                          {slide.画像テキスト && slide.画像テキスト.length > 0 && (
                            <div className="grid gap-2">
                              <Label>画像</Label>
                              <div className="grid grid-cols-2 gap-4">
                                {slide.画像テキスト.map((imgText: any, imgIndex: number) => (
                                  <div key={imgIndex} className="border rounded-lg p-2">
                                    <img 
                                      src={imgText.画像パス} 
                                      alt={`スライド${slide.スライド番号}の画像${imgIndex + 1}`}
                                      className="w-full h-auto mb-2 rounded"
                                    />
                                    <p className="text-sm text-gray-600">{imgText.テキスト}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>
                
                {/* 接続番号タブ */}
                <TabsContent value="connections">
                  <div className="space-y-4">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-medium">検出された接続番号</h3>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setShowConnectionDialog(true)}
                        disabled={!isEditing}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        接続番号を追加
                      </Button>
                    </div>
                    
                    {connectionNumbers.length === 0 ? (
                      <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                        <p>接続番号が見つかりませんでした</p>
                        <p className="text-sm mt-2">テキスト内の「接続番号: 数字」パターンを検索します</p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>場所</TableHead>
                            <TableHead>接続番号</TableHead>
                            <TableHead className="text-right">操作</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {connectionNumbers.map((conn) => (
                            <TableRow key={conn.id}>
                              <TableCell>{conn.label}</TableCell>
                              <TableCell>
                                {isEditing ? (
                                  <Input
                                    value={conn.value}
                                    onChange={(e) => {
                                      // 現在の値を保存
                                      const oldValue = conn.value;
                                      // 新しい値でコネクション番号を更新
                                      const updatedConnections = connectionNumbers.map(c => 
                                        c.id === conn.id ? { ...c, value: e.target.value } : c
                                      );
                                      setConnectionNumbers(updatedConnections);
                                    }}
                                    className="w-24"
                                  />
                                ) : (
                                  <Badge>{conn.value}</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                {isEditing && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      const newValue = prompt(`接続番号 ${conn.value} を変更`, conn.value);
                                      if (newValue && newValue !== conn.value) {
                                        updateAllConnectionNumbers(conn.value, newValue);
                                      }
                                    }}
                                  >
                                    <Pencil className="h-4 w-4" />
                                    <span className="sr-only">編集</span>
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}
        
        {/* 接続番号追加ダイアログ */}
        <Dialog open={showConnectionDialog} onOpenChange={setShowConnectionDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>接続番号を追加</DialogTitle>
              <DialogDescription>
                新しい接続番号とその説明ラベルを入力してください
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="conn-label">説明ラベル</Label>
                <Input
                  id="conn-label"
                  placeholder="例: ルーター背面の番号"
                  value={newConnection.label}
                  onChange={(e) => setNewConnection({ ...newConnection, label: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="conn-value">接続番号</Label>
                <Input
                  id="conn-value"
                  placeholder="例: 0120123456"
                  value={newConnection.value}
                  onChange={(e) => setNewConnection({ ...newConnection, value: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowConnectionDialog(false)}>
                キャンセル
              </Button>
              <Button onClick={addConnectionNumber}>
                追加
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {/* 保存確認ダイアログ */}
        <Dialog open={showSaveConfirmDialog} onOpenChange={setShowSaveConfirmDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>変更内容の確認</DialogTitle>
              <DialogDescription>
                以下の変更を保存しますか？
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <ul className="list-disc pl-5 space-y-2">
                {saveChanges.added > 0 && (
                  <li>新しい項目追加: {saveChanges.added}件</li>
                )}
                {saveChanges.modified > 0 && (
                  <li>項目の変更: {saveChanges.modified}件</li>
                )}
                {saveChanges.deleted > 0 && (
                  <li>項目の削除: {saveChanges.deleted}件</li>
                )}
              </ul>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSaveConfirmDialog(false)}>
                キャンセル
              </Button>
              <Button onClick={updateGuideData} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    保存中...
                  </>
                ) : (
                  "保存"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default EmergencyGuideEdit;
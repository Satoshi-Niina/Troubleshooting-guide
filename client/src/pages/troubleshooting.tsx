import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Search, Plus, FileText, Edit, Trash2, ArrowLeft } from 'lucide-react';
import TroubleshootingEditor from '@/components/troubleshooting/troubleshooting-editor';
import TroubleshootingFlow from '@/components/troubleshooting/troubleshooting-flow';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Helmet } from 'react-helmet';

// トラブルシューティングデータ型
interface TroubleshootingData {
  id: string;
  title: string;
  description: string;
  trigger: string[];
}

const TroubleshootingPage: React.FC = () => {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [troubleshootingList, setTroubleshootingList] = useState<TroubleshootingData[]>([]);
  const [filteredList, setFilteredList] = useState<TroubleshootingData[]>([]);
  
  // ガイドID (URL パラメータから取得)
  const [guideId, setGuideId] = useState<string | null>(null);
  const [isFromEmergencyGuide, setIsFromEmergencyGuide] = useState(false);
  
  // 編集モード関連
  const [editMode, setEditMode] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);

  // トラブルシューティングデータの取得
  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/troubleshooting');
      if (!response.ok) {
        throw new Error('データの取得に失敗しました');
      }
      
      const data = await response.json();
      setTroubleshootingList(data);
      setFilteredList(data);
    } catch (error) {
      console.error('トラブルシューティングデータの取得エラー:', error);
      toast({
        title: 'エラー',
        description: 'トラブルシューティングデータの取得に失敗しました',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // URLクエリパラメータの処理
  useEffect(() => {
    // URLからguideIdを取得
    const urlParams = new URLSearchParams(window.location.search);
    const guideIdParam = urlParams.get('guideId');
    
    if (guideIdParam) {
      setGuideId(guideIdParam);
      setIsFromEmergencyGuide(true);
      
      // ガイドIDがある場合は新規トラブルシューティング作成モードを開始
      setCurrentId(null);
      setEditMode(true);
    }
    
    fetchData();
  }, []);

  // 検索フィルタリング
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredList(troubleshootingList);
      return;
    }
    
    const term = searchTerm.toLowerCase();
    const filtered = troubleshootingList.filter(item => 
      item.id.toLowerCase().includes(term) || 
      item.title.toLowerCase().includes(term) || 
      item.description.toLowerCase().includes(term) ||
      (item.trigger && item.trigger.some(t => t.toLowerCase().includes(term)))
    );
    
    setFilteredList(filtered);
  }, [searchTerm, troubleshootingList]);

  // 編集モードの開始
  const handleEdit = (id: string) => {
    setCurrentId(id);
    setEditMode(true);
  };

  // 新規作成モードの開始
  const handleCreate = () => {
    setCurrentId(null);
    setEditMode(true);
  };

  // 編集/作成のキャンセル
  const handleCancelEdit = () => {
    // 応急復旧フローから来た場合は元のページに戻る
    if (isFromEmergencyGuide && guideId) {
      window.location.href = '/emergency-guide';
    } else {
      setEditMode(false);
      setCurrentId(null);
    }
  };

  // 編集/作成の保存完了
  const handleSaved = () => {
    // 応急復旧フローから来た場合は元のページに戻る
    if (isFromEmergencyGuide && guideId) {
      toast({
        title: '保存完了',
        description: 'トラブルシューティングデータを保存しました。応急復旧データ作成ページに戻ります。',
      });
      // 少し遅延させて通知を見せてから遷移
      setTimeout(() => {
        window.location.href = '/emergency-guide';
      }, 1500);
    } else {
      setEditMode(false);
      setCurrentId(null);
      // データを再取得
      fetchData();
    }
  };

  // プレビューモードの開始
  const handlePreview = (id: string) => {
    setPreviewId(id);
    setPreviewMode(true);
  };

  // プレビューの終了
  const handlePreviewExit = () => {
    setPreviewMode(false);
    setPreviewId(null);
  };

  // 削除確認ダイアログの表示
  const handleDeleteConfirm = (id: string) => {
    setDeleteTargetId(id);
    setShowDeleteConfirm(true);
  };

  // 削除の実行
  const handleDelete = async () => {
    if (!deleteTargetId) return;

    try {
      const response = await fetch(`/api/troubleshooting/${deleteTargetId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('削除に失敗しました');
      }

      toast({
        title: '削除完了',
        description: 'トラブルシューティングデータを削除しました',
      });

      // リストを更新
      fetchData();
    } catch (error) {
      console.error('削除エラー:', error);
      toast({
        title: 'エラー',
        description: '削除に失敗しました',
        variant: 'destructive',
      });
    } finally {
      setShowDeleteConfirm(false);
      setDeleteTargetId(null);
    }
  };

  // 編集モード時のレンダリング
  if (editMode) {
    return (
      <div className="container mx-auto p-6">
        {isFromEmergencyGuide && guideId && (
          <Card className="mb-4">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>応急復旧データに関連付けられたトラブルシューティング</CardTitle>
                  <CardDescription>
                    ガイドID: {guideId}
                  </CardDescription>
                </div>
                <Button variant="outline" onClick={() => window.location.href = '/emergency-guide'}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  応急復旧データ作成に戻る
                </Button>
              </div>
            </CardHeader>
          </Card>
        )}
        <TroubleshootingEditor 
          id={currentId || undefined} 
          onCancel={handleCancelEdit} 
          onSaved={handleSaved}
          guideId={guideId || undefined}
        />
      </div>
    );
  }

  // プレビューモード時のレンダリング
  if (previewMode && previewId) {
    return (
      <div className="container mx-auto p-6">
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <div className="flex justify-between items-center">
              <CardTitle>トラブルシューティングプレビュー</CardTitle>
              <Button variant="outline" onClick={handlePreviewExit}>
                一覧に戻る
              </Button>
            </div>
          </CardHeader>
        </Card>
        
        <TroubleshootingFlow 
          id={previewId} 
          onExit={handlePreviewExit} 
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <Helmet>
        <title>トラブルシューティング管理 | 保守用車支援システム</title>
      </Helmet>
      
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-blue-800 mb-2">トラブルシューティング管理</h1>
        <p className="text-gray-600">
          トラブルシューティングフローの作成・編集・プレビューを行います
        </p>
      </div>
      
      <div className="flex items-center justify-between mb-6">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
          <Input
            type="search"
            placeholder="トラブルシューティングを検索..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          新規作成
        </Button>
      </div>
      
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <span className="ml-2">データを読み込み中...</span>
        </div>
      ) : filteredList.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <div className="flex flex-col items-center justify-center">
              <FileText className="h-12 w-12 text-gray-400 mb-4" />
              {searchTerm ? (
                <p className="text-gray-500">検索条件に一致するトラブルシューティングが見つかりません</p>
              ) : (
                <>
                  <p className="text-gray-500 mb-2">トラブルシューティングがまだ登録されていません</p>
                  <Button variant="outline" onClick={handleCreate}>
                    <Plus className="mr-2 h-4 w-4" />
                    新規作成
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredList.map((item) => (
            <Card key={item.id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">{item.title}</CardTitle>
                <CardDescription className="line-clamp-2">
                  {item.description}
                </CardDescription>
              </CardHeader>
              
              <CardContent>
                <div className="flex flex-wrap gap-2 mb-4">
                  {item.trigger && item.trigger.map((tag, idx) => (
                    <span
                      key={idx}
                      className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded"
                    >
                      {tag}
                    </span>
                  ))}
                  {(!item.trigger || item.trigger.length === 0) && (
                    <span className="text-gray-400 text-sm">トリガーなし</span>
                  )}
                </div>
                
                <div className="flex justify-between">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePreview(item.id)}
                  >
                    プレビュー
                  </Button>
                  
                  <div className="space-x-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleEdit(item.id)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-600"
                      onClick={() => handleDeleteConfirm(item.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      
      {/* 削除確認ダイアログ */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>トラブルシューティングの削除</DialogTitle>
            <DialogDescription>
              このトラブルシューティングを削除してもよろしいですか？この操作は元に戻せません。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              キャンセル
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              削除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TroubleshootingPage;
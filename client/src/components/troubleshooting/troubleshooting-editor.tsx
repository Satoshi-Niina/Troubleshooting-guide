import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { 
  Loader2, 
  Save, 
  X, 
  Plus, 
  Trash2, 
  ChevronDown, 
  ChevronUp,
  FilePlus2,
  FileEdit,
  FileX,
  Eye
} from 'lucide-react';
import TroubleshootingPreview from './troubleshooting-preview';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// トラブルシューティングのステップ型定義
interface TroubleshootingStep {
  id: string;
  message: string;
  image?: string;
  imageKeywords?: string[]; // 画像検索用キーワード配列
  options?: {
    label: string;
    next: string;
  }[];
  next?: string;
  checklist?: string[];
  end?: boolean;
}

// トラブルシューティングのデータ型定義
interface TroubleshootingData {
  id: string;
  title: string;
  description: string;
  trigger: string[];
  steps: TroubleshootingStep[];
}

interface TroubleshootingEditorProps {
  id?: string; // 既存のトラブルシューティングID（編集時）
  guideId?: string; // 関連する応急復旧ガイドID
  onCancel: () => void;
  onSaved: () => void;
}

const TroubleshootingEditor: React.FC<TroubleshootingEditorProps> = ({ 
  id, 
  guideId,
  onCancel,
  onSaved
}) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [changes, setChanges] = useState<{
    added: number;
    modified: number;
    deleted: number;
  }>({ added: 0, modified: 0, deleted: 0 });
  
  // 元のデータと編集中のデータ
  const [originalData, setOriginalData] = useState<TroubleshootingData | null>(null);
  const [editedData, setEditedData] = useState<TroubleshootingData | null>(null);
  
  // ステップ編集用の状態
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const [newTrigger, setNewTrigger] = useState('');
  const [newChecklist, setNewChecklist] = useState('');
  const [newOption, setNewOption] = useState({ label: '', next: '' });
  
  // 既存データの読み込み
  const fetchData = useCallback(async () => {
    if (!id) {
      // 新規作成時
      setLoading(false);
      setOriginalData(null);
      
      // 初期データを生成
      const newData: TroubleshootingData = {
        id: '',
        title: '',
        description: '',
        trigger: [],
        steps: [{
          id: 'start',
          message: '',
          next: ''
        }]
      };
      
      // ガイドIDが指定されている場合は関連情報を追加
      if (guideId) {
        newData.id = `guide_ts_${guideId}`;
        newData.title = `応急復旧ガイド関連トラブルシューティング`;
        newData.description = `応急復旧ガイドID: ${guideId} に関連するトラブルシューティングフロー`;
        newData.trigger = [`ガイド_${guideId}`];
      }
      
      setEditedData(newData);
      return;
    }
    
    try {
      setLoading(true);
      const response = await fetch(`/api/troubleshooting/${id}`);
      
      if (!response.ok) {
        throw new Error('トラブルシューティングデータの取得に失敗しました');
      }
      
      const data = await response.json();
      setOriginalData(data);
      setEditedData(JSON.parse(JSON.stringify(data))); // ディープコピー
      
      // 最初のステップをアクティブに
      if (data.steps && data.steps.length > 0) {
        setActiveStep(data.steps[0].id);
      }
    } catch (error) {
      console.error('データ取得エラー:', error);
      toast({
        title: 'エラー',
        description: 'トラブルシューティングデータの取得に失敗しました',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [id, guideId, toast]);
  
  // 初期ロード
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  
  // 基本情報の更新ハンドラ
  const handleBasicInfoChange = (field: string, value: any) => {
    if (!editedData) return;
    
    setEditedData({
      ...editedData,
      [field]: value
    });
  };
  
  // トリガーの追加
  const handleAddTrigger = () => {
    if (!newTrigger.trim() || !editedData) return;
    
    setEditedData({
      ...editedData,
      trigger: [...editedData.trigger, newTrigger.trim()]
    });
    setNewTrigger('');
  };
  
  // トリガーの削除
  const handleRemoveTrigger = (index: number) => {
    if (!editedData) return;
    
    const newTriggers = [...editedData.trigger];
    newTriggers.splice(index, 1);
    
    setEditedData({
      ...editedData,
      trigger: newTriggers
    });
  };
  
  // ステップの更新ハンドラ
  const handleStepChange = (stepId: string, field: string, value: any) => {
    if (!editedData) return;
    
    const updatedSteps = editedData.steps.map(step => 
      step.id === stepId ? { ...step, [field]: value } : step
    );
    
    setEditedData({
      ...editedData,
      steps: updatedSteps
    });
  };
  
  // ステップの追加
  const handleAddStep = () => {
    if (!editedData) return;
    
    // 新しいステップID生成（既存のものと重複しないように）
    const newStepId = `step_${Date.now()}`;
    const newStep: TroubleshootingStep = {
      id: newStepId,
      message: '',
      next: ''
    };
    
    setEditedData({
      ...editedData,
      steps: [...editedData.steps, newStep]
    });
    
    setActiveStep(newStepId);
  };
  
  // ステップの削除
  const handleRemoveStep = (stepId: string) => {
    if (!editedData) return;
    
    const updatedSteps = editedData.steps.filter(step => step.id !== stepId);
    
    // 最初のステップを削除しようとしていたら防止
    if (stepId === 'start' || editedData.steps.length <= 1) {
      toast({
        title: '削除できません',
        description: '最初のステップは削除できません。少なくとも1つのステップが必要です。',
        variant: 'destructive',
      });
      return;
    }
    
    setEditedData({
      ...editedData,
      steps: updatedSteps
    });
    
    // 削除されたステップがアクティブだった場合、他のステップをアクティブに
    if (activeStep === stepId) {
      setActiveStep(updatedSteps[0]?.id || null);
    }
    
    // 他のステップのnextを更新
    const stepsWithUpdatedNext = updatedSteps.map(step => {
      if (step.next === stepId) {
        return { ...step, next: '' };
      }
      if (step.options) {
        const updatedOptions = step.options.map(option => {
          if (option.next === stepId) {
            return { ...option, next: '' };
          }
          return option;
        });
        return { ...step, options: updatedOptions };
      }
      return step;
    });
    
    setEditedData({
      ...editedData,
      steps: stepsWithUpdatedNext
    });
  };
  
  // チェックリストアイテムの追加
  const handleAddChecklistItem = (stepId: string) => {
    if (!newChecklist.trim() || !editedData) return;
    
    const updatedSteps = editedData.steps.map(step => {
      if (step.id === stepId) {
        const currentChecklist = step.checklist || [];
        return {
          ...step,
          checklist: [...currentChecklist, newChecklist.trim()]
        };
      }
      return step;
    });
    
    setEditedData({
      ...editedData,
      steps: updatedSteps
    });
    
    setNewChecklist('');
  };
  
  // チェックリストアイテムの削除
  const handleRemoveChecklistItem = (stepId: string, index: number) => {
    if (!editedData) return;
    
    const updatedSteps = editedData.steps.map(step => {
      if (step.id === stepId && step.checklist) {
        const newChecklist = [...step.checklist];
        newChecklist.splice(index, 1);
        return {
          ...step,
          checklist: newChecklist
        };
      }
      return step;
    });
    
    setEditedData({
      ...editedData,
      steps: updatedSteps
    });
  };
  
  // オプションの追加
  const handleAddOption = (stepId: string) => {
    if (!newOption.label.trim() || !newOption.next.trim() || !editedData) return;
    
    const updatedSteps = editedData.steps.map(step => {
      if (step.id === stepId) {
        const currentOptions = step.options || [];
        return {
          ...step,
          options: [...currentOptions, { ...newOption }]
        };
      }
      return step;
    });
    
    setEditedData({
      ...editedData,
      steps: updatedSteps
    });
    
    setNewOption({ label: '', next: '' });
  };
  
  // オプションの削除
  const handleRemoveOption = (stepId: string, index: number) => {
    if (!editedData) return;
    
    const updatedSteps = editedData.steps.map(step => {
      if (step.id === stepId && step.options) {
        const newOptions = [...step.options];
        newOptions.splice(index, 1);
        return {
          ...step,
          options: newOptions
        };
      }
      return step;
    });
    
    setEditedData({
      ...editedData,
      steps: updatedSteps
    });
  };
  
  // 対象のステップ情報を取得
  const getActiveStepData = () => {
    if (!editedData || !activeStep) return null;
    return editedData.steps.find(step => step.id === activeStep) || null;
  };

  // 更新内容の分析
  const analyzeChanges = useCallback(() => {
    if (!originalData || !editedData) {
      return { added: 0, modified: 0, deleted: 0 };
    }
    
    let added = 0;
    let modified = 0;
    let deleted = 0;
    
    // 基本情報の変更チェック
    if (originalData.title !== editedData.title) modified++;
    if (originalData.description !== editedData.description) modified++;
    
    // トリガーの比較
    if (JSON.stringify(originalData.trigger) !== JSON.stringify(editedData.trigger)) {
      if (originalData.trigger.length < editedData.trigger.length) {
        added += editedData.trigger.length - originalData.trigger.length;
      } else if (originalData.trigger.length > editedData.trigger.length) {
        deleted += originalData.trigger.length - editedData.trigger.length;
      } else {
        modified++;
      }
    }
    
    // ステップ数の変更チェック
    if (originalData.steps.length > editedData.steps.length) {
      deleted += originalData.steps.length - editedData.steps.length;
    } else if (originalData.steps.length < editedData.steps.length) {
      added += editedData.steps.length - originalData.steps.length;
    }
    
    // 共通するステップの変更チェック
    const originalStepIds = originalData.steps.map(step => step.id);
    const editedStepIds = editedData.steps.map(step => step.id);
    
    // ステップ単位での追加・削除
    editedStepIds.forEach(id => {
      if (!originalStepIds.includes(id)) {
        added++;
      }
    });
    
    originalStepIds.forEach(id => {
      if (!editedStepIds.includes(id)) {
        deleted++;
      }
    });
    
    // 共通するステップの内容比較
    const commonStepIds = originalStepIds.filter(id => editedStepIds.includes(id));
    commonStepIds.forEach(id => {
      const origStep = originalData.steps.find(step => step.id === id);
      const editedStep = editedData.steps.find(step => step.id === id);
      
      if (origStep && editedStep) {
        // メッセージの比較
        if (origStep.message !== editedStep.message) {
          modified++;
        }
        
        // 次のステップIDの比較
        if (origStep.next !== editedStep.next) {
          modified++;
        }
        
        // チェックリストの比較
        if (JSON.stringify(origStep.checklist) !== JSON.stringify(editedStep.checklist)) {
          modified++;
        }
        
        // オプションの比較
        if (JSON.stringify(origStep.options) !== JSON.stringify(editedStep.options)) {
          modified++;
        }
      }
    });
    
    return { added, modified, deleted };
  }, [originalData, editedData]);
  
  // 保存処理
  const handleSave = async () => {
    if (!editedData) return;
    
    try {
      setSaving(true);
      
      // IDが空なら新規作成
      const isNewData = !id || id === '';
      const endpoint = isNewData 
        ? '/api/troubleshooting/create'
        : `/api/troubleshooting/update/${id}`;
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(editedData)
      });
      
      if (!response.ok) {
        throw new Error('データの保存に失敗しました');
      }
      
      toast({
        title: '保存完了',
        description: 'トラブルシューティングデータを保存しました',
      });
      
      // 保存完了後の処理
      onSaved();
    } catch (error) {
      console.error('保存エラー:', error);
      toast({
        title: 'エラー',
        description: 'データの保存に失敗しました',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
      setShowSaveConfirm(false);
    }
  };
  
  // 保存ボタンクリック時
  const handleSaveClick = () => {
    if (!editedData) return;
    
    // IDとタイトルの入力チェック
    if (!editedData.id.trim()) {
      toast({
        title: '入力エラー',
        description: 'IDは必須です',
        variant: 'destructive',
      });
      return;
    }
    
    if (!editedData.title.trim()) {
      toast({
        title: '入力エラー',
        description: 'タイトルは必須です',
        variant: 'destructive',
      });
      return;
    }
    
    // 新規かどうか
    if (!id || id === '') {
      // 新規作成の場合は確認なしで保存
      handleSave();
      return;
    }
    
    // 変更の分析
    const changesData = analyzeChanges();
    setChanges(changesData);
    
    // 変更がある場合は確認ダイアログを表示
    if (changesData.added > 0 || changesData.modified > 0 || changesData.deleted > 0) {
      setShowSaveConfirm(true);
    } else {
      toast({
        title: '変更なし',
        description: '変更点はありませんでした',
      });
      onCancel();
    }
  };
  
  // ステップIDの選択肢
  const getStepOptions = () => {
    if (!editedData) return [];
    return editedData.steps.map(step => ({
      id: step.id,
      label: `${step.id}: ${step.message.substring(0, 20)}${step.message.length > 20 ? '...' : ''}`
    }));
  };
  
  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        <span className="ml-2">データを読み込み中...</span>
      </div>
    );
  }
  
  if (!editedData) {
    return (
      <div className="text-center py-12 text-red-500">
        データの読み込みに失敗しました
      </div>
    );
  }
  
  const activeStepData = getActiveStepData();
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-xl">フロー編集</CardTitle>
            <CardDescription>
              {id ? 'トラブルシューティングフローを編集' : '新規トラブルシューティングフローを作成'}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={saving}
            >
              <X className="h-4 w-4 mr-1" />
              キャンセル
            </Button>
            <Button
              variant="default"
              onClick={handleSaveClick}
              disabled={saving}
            >
              {saving ? (
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
          </div>
        </CardHeader>
        
        <CardContent>
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-4 mb-4">
              <TabsTrigger value="basic">基本情報</TabsTrigger>
              <TabsTrigger value="triggers">トリガー設定</TabsTrigger>
              <TabsTrigger value="steps">ステップ管理</TabsTrigger>
              <TabsTrigger value="preview">プレビュー</TabsTrigger>
            </TabsList>
            
            {/* 基本情報タブ */}
            <TabsContent value="basic" className="space-y-4">
              <div className="grid gap-4">
                <div className="bg-blue-50 p-4 rounded-lg mb-4">
                  <h3 className="font-medium mb-2 text-blue-700">基本情報とは</h3>
                  <p className="text-sm text-blue-700 mb-2">
                    トラブルシューティングフローの基本的な情報を設定します。IDは一意の識別子として使用されます。
                  </p>
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="id">ID (一意のキー)</Label>
                  <p className="text-sm text-gray-500">他のフローと重複しない一意の識別子です。英数字とアンダースコアを使用してください。</p>
                  <Input
                    id="id"
                    value={editedData.id}
                    onChange={(e) => handleBasicInfoChange('id', e.target.value)}
                    placeholder="一意のID (例: brake_failure)"
                    className="font-mono"
                  />
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="title">タイトル</Label>
                  <p className="text-sm text-gray-500">ユーザーに表示されるフローの名前です。わかりやすい名前をつけてください。</p>
                  <Input
                    id="title"
                    value={editedData.title}
                    onChange={(e) => handleBasicInfoChange('title', e.target.value)}
                    placeholder="トラブルシューティングのタイトル"
                  />
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="description">説明</Label>
                  <p className="text-sm text-gray-500">フローの目的や使い方を説明します。内部参照用なのでユーザーには表示されません。</p>
                  <Textarea
                    id="description"
                    value={editedData.description}
                    onChange={(e) => handleBasicInfoChange('description', e.target.value)}
                    placeholder="トラブルシューティングの説明"
                    rows={3}
                  />
                </div>
              </div>
            </TabsContent>
            
            {/* トリガー設定タブ */}
            <TabsContent value="triggers" className="space-y-4">
              <div className="mb-4">
                <div className="bg-blue-50 p-4 rounded-lg mb-4">
                  <h3 className="font-medium mb-2 text-blue-700">トリガー設定とは</h3>
                  <p className="text-sm text-blue-700 mb-2">
                    トリガーとは、このフローを自動的に起動させるためのキーワードです。ユーザーがチャットでこれらのキーワードを含む質問をすると、このフローが候補として表示されます。
                  </p>
                </div>
                
                <Label htmlFor="triggers">トリガーキーワード</Label>
                <p className="text-sm text-gray-500 mb-2">
                  このトラブルシューティングを起動するキーワードを設定します。複数のキーワードを追加できます。
                </p>
                
                <div className="flex items-center gap-2 mb-2">
                  <Input
                    id="new-trigger"
                    value={newTrigger}
                    onChange={(e) => setNewTrigger(e.target.value)}
                    placeholder="新しいトリガーキーワード"
                    className="flex-1"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTrigger();
                      }
                    }}
                  />
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleAddTrigger}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    追加
                  </Button>
                </div>
                
                <div className="flex flex-wrap gap-2 mt-4">
                  {editedData.trigger.length === 0 ? (
                    <p className="text-sm text-gray-500">トリガーがありません</p>
                  ) : (
                    editedData.trigger.map((trigger, index) => (
                      <Badge 
                        key={index} 
                        variant="secondary"
                        className="flex items-center gap-1 px-3 py-1"
                      >
                        {trigger}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 rounded-full"
                          onClick={() => handleRemoveTrigger(index)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </Badge>
                    ))
                  )}
                </div>
              </div>
            </TabsContent>
            
            {/* ステップ管理タブ */}
            <TabsContent value="steps" className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-lg mb-4">
                <h3 className="font-medium mb-2 text-blue-700">ステップ管理とは</h3>
                <p className="text-sm text-blue-700 mb-2">
                  ステップはフロー内の各画面を表します。ユーザーはステップごとにメッセージを読み、選択肢を選んで次のステップに進みます。
                </p>
                <p className="text-sm text-blue-700">
                  <strong>ステップID：</strong> 各ステップの一意の識別子<br/>
                  <strong>メッセージ内容：</strong> ユーザーに表示されるテキスト<br/>
                  <strong>次のステップID：</strong> 選択肢がない場合の遷移先<br/>
                  <strong>選択肢オプション：</strong> ユーザーが選べる選択肢とその遷移先<br/>
                  <strong>チェックリスト：</strong> ユーザーに表示される確認項目
                </p>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {/* 左サイドバー - ステップ一覧 */}
                <div className="border rounded-lg p-4">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-medium">ステップ一覧</h3>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={handleAddStep}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      追加
                    </Button>
                  </div>
                  
                  <ScrollArea className="h-[400px]">
                    {editedData.steps.map((step) => (
                      <div 
                        key={step.id}
                        className={`p-2 mb-2 rounded-lg cursor-pointer ${
                          activeStep === step.id 
                            ? 'bg-blue-100 border border-blue-300' 
                            : 'hover:bg-gray-100 border border-gray-200'
                        }`}
                        onClick={() => setActiveStep(step.id)}
                      >
                        <div className="flex justify-between items-center">
                          <div className="font-mono text-xs text-blue-600">{step.id}</div>
                          {step.id !== 'start' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 rounded-full"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveStep(step.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          )}
                        </div>
                        <div className="text-sm truncate mt-1">
                          {step.message.substring(0, 35)}{step.message.length > 35 ? '...' : ''}
                        </div>
                      </div>
                    ))}
                  </ScrollArea>
                </div>
                
                {/* 右側 - 選択したステップの編集 */}
                <div className="col-span-2 border rounded-lg p-4">
                  {activeStepData ? (
                    <div className="space-y-4">
                      <div className="grid gap-2">
                        <Label htmlFor="step-id">ステップID</Label>
                        <Input
                          id="step-id"
                          value={activeStepData.id}
                          readOnly
                          className="font-mono bg-gray-50"
                        />
                      </div>
                      
                      <div className="grid gap-2">
                        <Label htmlFor="step-message">メッセージ内容</Label>
                        <Textarea
                          id="step-message"
                          value={activeStepData.message}
                          onChange={(e) => handleStepChange(activeStepData.id, 'message', e.target.value)}
                          placeholder="ステップでのメッセージ内容"
                          rows={5}
                        />
                      </div>
                      
                      <div className="grid gap-2">
                        <Label htmlFor="step-next">次のステップID</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            id="step-next"
                            value={activeStepData.next || ''}
                            onChange={(e) => handleStepChange(activeStepData.id, 'next', e.target.value)}
                            placeholder="次に進むステップID"
                            className="font-mono"
                          />
                          {activeStepData.end && (
                            <Badge className="bg-green-500">終了ステップ</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <input
                            type="checkbox"
                            id="step-end"
                            checked={!!activeStepData.end}
                            onChange={(e) => handleStepChange(activeStepData.id, 'end', e.target.checked)}
                          />
                          <Label htmlFor="step-end" className="text-sm">終了ステップ（フローの最後）</Label>
                        </div>
                      </div>
                      
                      <Accordion type="single" collapsible className="w-full">
                        {/* 画像設定 */}
                        <AccordionItem value="images">
                          <AccordionTrigger>画像設定</AccordionTrigger>
                          <AccordionContent>
                            <div className="space-y-4 pt-2">
                              <div className="grid gap-2">
                                <Label htmlFor={`step-image-${activeStepData.id}`}>画像URL</Label>
                                <Input
                                  id={`step-image-${activeStepData.id}`}
                                  value={activeStepData.image || ''}
                                  onChange={(e) => handleStepChange(activeStepData.id, 'image', e.target.value)}
                                  placeholder="画像のURLを入力 (例: /images/device.png)"
                                />
                              </div>
                              
                              {/* 画像検索キーワード入力欄 */}
                              <div className="grid gap-2 mt-2">
                                <Label htmlFor={`step-image-keywords-${activeStepData.id}`}>
                                  画像検索キーワード（カンマ区切りで複数入力可）
                                </Label>
                                <Input
                                  id={`step-image-keywords-${activeStepData.id}`}
                                  value={activeStepData.imageKeywords?.join(', ') || ''}
                                  onChange={(e) => {
                                    // カンマ区切りの文字列を配列に変換
                                    const keywords = e.target.value
                                      .split(',')
                                      .map(k => k.trim())
                                      .filter(k => k.length > 0);
                                    handleStepChange(activeStepData.id, 'imageKeywords', keywords);
                                  }}
                                  placeholder="例: 燃料カットソレノイド, 冷却ポンプ"
                                />
                                <p className="text-xs text-muted-foreground">
                                  関連する部品や装置の名前を入力すると、自動的に関連画像が表示されます
                                </p>
                              </div>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                        
                        {/* チェックリスト設定 */}
                        <AccordionItem value="checklist">
                          <AccordionTrigger>チェックリスト</AccordionTrigger>
                          <AccordionContent>
                            <div className="space-y-2 pt-2">
                              <div className="flex items-center gap-2">
                                <Input
                                  value={newChecklist}
                                  onChange={(e) => setNewChecklist(e.target.value)}
                                  placeholder="新しいチェックリスト項目"
                                  className="flex-1"
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      handleAddChecklistItem(activeStepData.id);
                                    }
                                  }}
                                />
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => handleAddChecklistItem(activeStepData.id)}
                                >
                                  <Plus className="h-4 w-4 mr-1" />
                                  追加
                                </Button>
                              </div>
                              
                              <div className="space-y-2 mt-4">
                                {!activeStepData.checklist || activeStepData.checklist.length === 0 ? (
                                  <p className="text-sm text-gray-500">チェックリスト項目がありません</p>
                                ) : (
                                  activeStepData.checklist.map((item, index) => (
                                    <div 
                                      key={index}
                                      className="flex items-center justify-between bg-gray-50 p-2 rounded"
                                    >
                                      <span className="text-sm">{item}</span>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={() => handleRemoveChecklistItem(activeStepData.id, index)}
                                      >
                                        <X className="h-4 w-4 text-red-500" />
                                      </Button>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                        
                        {/* オプション設定 */}
                        <AccordionItem value="options">
                          <AccordionTrigger>選択肢オプション</AccordionTrigger>
                          <AccordionContent>
                            <div className="space-y-4 pt-2">
                              <div className="grid gap-2">
                                <Label htmlFor="option-label">オプションラベル</Label>
                                <Input
                                  id="option-label"
                                  value={newOption.label}
                                  onChange={(e) => setNewOption({ ...newOption, label: e.target.value })}
                                  placeholder="選択肢のテキスト"
                                />
                              </div>
                              
                              <div className="grid gap-2">
                                <Label htmlFor="option-next">遷移先ステップID</Label>
                                <Input
                                  id="option-next"
                                  value={newOption.next}
                                  onChange={(e) => setNewOption({ ...newOption, next: e.target.value })}
                                  placeholder="選択時に遷移するステップID"
                                  className="font-mono"
                                />
                              </div>
                              
                              <Button 
                                variant="outline"
                                onClick={() => handleAddOption(activeStepData.id)}
                                disabled={!newOption.label.trim() || !newOption.next.trim()}
                              >
                                <Plus className="h-4 w-4 mr-1" />
                                選択肢を追加
                              </Button>
                              
                              <div className="space-y-2 mt-4">
                                {!activeStepData.options || activeStepData.options.length === 0 ? (
                                  <p className="text-sm text-gray-500">選択肢がありません</p>
                                ) : (
                                  activeStepData.options.map((option, index) => (
                                    <div 
                                      key={index}
                                      className="flex items-center justify-between bg-gray-50 p-2 rounded"
                                    >
                                      <div>
                                        <div className="text-sm">{option.label}</div>
                                        <div className="text-xs font-mono text-blue-600">
                                          次: {option.next}
                                        </div>
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={() => handleRemoveOption(activeStepData.id, index)}
                                      >
                                        <X className="h-4 w-4 text-red-500" />
                                      </Button>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full py-12 text-gray-500">
                      <FileEdit className="h-12 w-12 mb-2 text-gray-400" />
                      <p>左側のリストからステップを選択してください</p>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
            
            {/* プレビュータブ */}
            <TabsContent value="preview" className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-lg mb-4">
                <h3 className="font-medium mb-2 text-blue-700">プレビュー表示</h3>
                <p className="text-sm text-blue-700 mb-2">
                  現在編集中の内容を実際のフロー表示としてプレビューできます。編集内容はリアルタイムに反映されます。
                </p>
              </div>
              
              {editedData.steps.length > 0 ? (
                <TroubleshootingPreview 
                  steps={editedData.steps} 
                  initialStepId="start"
                />
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <Eye className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                  <p>ステップを作成してプレビューを表示します</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      
      {/* 変更確認ダイアログ */}
      <Dialog open={showSaveConfirm} onOpenChange={setShowSaveConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>変更内容の確認</DialogTitle>
            <DialogDescription>
              以下の変更を保存しますか？
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              {changes.added > 0 && (
                <div className="flex items-center text-green-600">
                  <Plus className="h-4 w-4 mr-2" />
                  <span>新規追加項目: {changes.added}件</span>
                </div>
              )}
              {changes.modified > 0 && (
                <div className="flex items-center text-blue-600">
                  <FileEdit className="h-4 w-4 mr-2" />
                  <span>更新項目: {changes.modified}件</span>
                </div>
              )}
              {changes.deleted > 0 && (
                <div className="flex items-center text-red-600">
                  <Trash2 className="h-4 w-4 mr-2" />
                  <span>削除項目: {changes.deleted}件</span>
                </div>
              )}
            </div>
            <p className="mt-4 text-sm text-gray-600">
              保存すると既存のデータは上書きされます。削除した項目は完全に削除され、新規追加した項目がこのフローに追加されます。
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveConfirm(false)}>
              キャンセル
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-1" />
                  変更を保存
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TroubleshootingEditor;
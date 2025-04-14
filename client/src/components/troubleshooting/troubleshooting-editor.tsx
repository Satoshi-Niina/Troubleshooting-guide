import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { X, Plus, Save, Trash2, ArrowLeft, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';

// トラブルシューティングステップの型定義
interface TroubleshootingStep {
  id: string;
  message: string;
  image?: string;
  options?: {
    label: string;
    next: string;
  }[];
  next?: string;
  checklist?: string[];
  end?: boolean;
}

// トラブルシューティングデータの型定義
interface TroubleshootingData {
  id: string;
  title: string;
  description: string;
  trigger: string[];
  steps: TroubleshootingStep[];
}

interface TroubleshootingEditorProps {
  id?: string;
  onSaveSuccess?: () => void;
  onCancel?: () => void;
}

export default function TroubleshootingEditor({ id, onSaveSuccess, onCancel }: TroubleshootingEditorProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<TroubleshootingData | null>(null);
  const [editedData, setEditedData] = useState<TroubleshootingData | null>(null);
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);
  const [editingTriggers, setEditingTriggers] = useState(false);
  const [newTrigger, setNewTrigger] = useState('');
  const [newStepDialogOpen, setNewStepDialogOpen] = useState(false);
  const [newStepId, setNewStepId] = useState('');
  const [showSaveConfirmDialog, setShowSaveConfirmDialog] = useState(false);
  const [saveChanges, setSaveChanges] = useState<{
    added: number;
    modified: number;
    deleted: number;
  }>({ added: 0, modified: 0, deleted: 0 });

  // トラブルシューティングデータの取得
  const fetchData = useCallback(async () => {
    if (!id) {
      // 新規作成モード
      const newData: TroubleshootingData = {
        id: '',
        title: '',
        description: '',
        trigger: [],
        steps: [
          {
            id: 'start',
            message: '開始メッセージを入力してください',
            next: 'end'
          },
          {
            id: 'end',
            message: '終了メッセージを入力してください',
            end: true
          }
        ]
      };
      setData(newData);
      setEditedData(JSON.parse(JSON.stringify(newData)));
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`/api/troubleshooting/${id}`);
      
      if (!response.ok) {
        throw new Error(`トラブルシューティングデータの取得に失敗しました: ${response.statusText}`);
      }
      
      const data = await response.json();
      setData(data);
      // ディープコピーを作成
      setEditedData(JSON.parse(JSON.stringify(data)));
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
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // トリガー追加ハンドラ
  const handleAddTrigger = () => {
    if (!newTrigger.trim() || !editedData) return;
    
    setEditedData({
      ...editedData,
      trigger: [...editedData.trigger, newTrigger.trim()]
    });
    
    setNewTrigger('');
  };

  // トリガー削除ハンドラ
  const handleRemoveTrigger = (index: number) => {
    if (!editedData) return;
    
    const newTriggers = [...editedData.trigger];
    newTriggers.splice(index, 1);
    
    setEditedData({
      ...editedData,
      trigger: newTriggers
    });
  };

  // ステップ追加ハンドラ
  const handleAddStep = () => {
    if (!newStepId.trim() || !editedData) return;
    
    // IDの重複チェック
    if (editedData.steps.some(step => step.id === newStepId)) {
      toast({
        title: '重複エラー',
        description: `ステップID "${newStepId}" は既に使用されています`,
        variant: 'destructive',
      });
      return;
    }
    
    const newStep: TroubleshootingStep = {
      id: newStepId,
      message: '',
      options: [],
      next: ''
    };
    
    setEditedData({
      ...editedData,
      steps: [...editedData.steps, newStep]
    });
    
    setNewStepId('');
    setNewStepDialogOpen(false);
    
    // 新しく追加したステップを選択
    setSelectedStepIndex(editedData.steps.length);
  };

  // ステップ削除ハンドラ
  const handleRemoveStep = (index: number) => {
    if (!editedData) return;
    
    const stepToRemove = editedData.steps[index];
    
    // start ステップは削除不可
    if (stepToRemove.id === 'start') {
      toast({
        title: '削除できません',
        description: 'スタートステップは削除できません',
        variant: 'destructive',
      });
      return;
    }
    
    // 他のステップの next や options.next 参照をチェック
    const isReferenced = editedData.steps.some(step => {
      if (step.next === stepToRemove.id) return true;
      if (step.options) {
        return step.options.some(option => option.next === stepToRemove.id);
      }
      return false;
    });
    
    if (isReferenced) {
      toast({
        title: '削除できません',
        description: 'このステップは他のステップから参照されています',
        variant: 'destructive',
      });
      return;
    }
    
    // ステップ削除
    const newSteps = [...editedData.steps];
    newSteps.splice(index, 1);
    
    setEditedData({
      ...editedData,
      steps: newSteps
    });
    
    // 選択されているステップがなくなるか、削除されたステップが選択されていた場合
    if (selectedStepIndex === null || selectedStepIndex === index) {
      setSelectedStepIndex(null);
    } else if (selectedStepIndex > index) {
      // 削除されたステップより後ろのステップが選択されていた場合はインデックスを調整
      setSelectedStepIndex(selectedStepIndex - 1);
    }
  };

  // ステップの基本情報更新ハンドラ
  const handleStepChange = (index: number, field: string, value: any) => {
    if (!editedData) return;
    
    const updatedSteps = [...editedData.steps];
    updatedSteps[index] = {
      ...updatedSteps[index],
      [field]: value
    };
    
    setEditedData({
      ...editedData,
      steps: updatedSteps
    });
  };

  // オプション追加ハンドラ
  const handleAddOption = (stepIndex: number) => {
    if (!editedData) return;
    
    const updatedSteps = [...editedData.steps];
    const step = updatedSteps[stepIndex];
    
    const options = step.options || [];
    options.push({
      label: '',
      next: ''
    });
    
    updatedSteps[stepIndex] = {
      ...step,
      options
    };
    
    setEditedData({
      ...editedData,
      steps: updatedSteps
    });
  };

  // オプション更新ハンドラ
  const handleOptionChange = (stepIndex: number, optionIndex: number, field: string, value: string) => {
    if (!editedData) return;
    
    const updatedSteps = [...editedData.steps];
    const step = updatedSteps[stepIndex];
    
    if (!step.options) return;
    
    const updatedOptions = [...step.options];
    updatedOptions[optionIndex] = {
      ...updatedOptions[optionIndex],
      [field]: value
    };
    
    updatedSteps[stepIndex] = {
      ...step,
      options: updatedOptions
    };
    
    setEditedData({
      ...editedData,
      steps: updatedSteps
    });
  };

  // オプション削除ハンドラ
  const handleRemoveOption = (stepIndex: number, optionIndex: number) => {
    if (!editedData) return;
    
    const updatedSteps = [...editedData.steps];
    const step = updatedSteps[stepIndex];
    
    if (!step.options) return;
    
    const updatedOptions = [...step.options];
    updatedOptions.splice(optionIndex, 1);
    
    updatedSteps[stepIndex] = {
      ...step,
      options: updatedOptions
    };
    
    setEditedData({
      ...editedData,
      steps: updatedSteps
    });
  };

  // チェックリストアイテム追加ハンドラ
  const handleAddChecklistItem = (stepIndex: number) => {
    if (!editedData) return;
    
    const updatedSteps = [...editedData.steps];
    const step = updatedSteps[stepIndex];
    
    const checklist = step.checklist || [];
    checklist.push('');
    
    updatedSteps[stepIndex] = {
      ...step,
      checklist
    };
    
    setEditedData({
      ...editedData,
      steps: updatedSteps
    });
  };

  // チェックリストアイテム更新ハンドラ
  const handleChecklistItemChange = (stepIndex: number, itemIndex: number, value: string) => {
    if (!editedData) return;
    
    const updatedSteps = [...editedData.steps];
    const step = updatedSteps[stepIndex];
    
    if (!step.checklist) return;
    
    const updatedChecklist = [...step.checklist];
    updatedChecklist[itemIndex] = value;
    
    updatedSteps[stepIndex] = {
      ...step,
      checklist: updatedChecklist
    };
    
    setEditedData({
      ...editedData,
      steps: updatedSteps
    });
  };

  // チェックリストアイテム削除ハンドラ
  const handleRemoveChecklistItem = (stepIndex: number, itemIndex: number) => {
    if (!editedData) return;
    
    const updatedSteps = [...editedData.steps];
    const step = updatedSteps[stepIndex];
    
    if (!step.checklist) return;
    
    const updatedChecklist = [...step.checklist];
    updatedChecklist.splice(itemIndex, 1);
    
    updatedSteps[stepIndex] = {
      ...step,
      checklist: updatedChecklist
    };
    
    setEditedData({
      ...editedData,
      steps: updatedSteps
    });
  };

  // 変更内容を分析する関数
  const analyzeChanges = () => {
    if (!data || !editedData) return { added: 0, modified: 0, deleted: 0 };
    
    let added = 0;
    let modified = 0;
    let deleted = 0;
    
    // トリガーの変更をチェック
    if (data.trigger.length !== editedData.trigger.length) {
      if (data.trigger.length < editedData.trigger.length) {
        added += editedData.trigger.length - data.trigger.length;
      } else {
        deleted += data.trigger.length - editedData.trigger.length;
      }
    }
    
    // 基本情報の変更をチェック
    if (data.title !== editedData.title) modified++;
    if (data.description !== editedData.description) modified++;
    
    // ステップの変更をチェック
    const originalStepIds = new Set(data.steps.map(step => step.id));
    const editedStepIds = new Set(editedData.steps.map(step => step.id));
    
    // 新しく追加されたステップ
    editedData.steps.forEach(step => {
      if (!originalStepIds.has(step.id)) {
        added++;
      }
    });
    
    // 削除されたステップ
    data.steps.forEach(step => {
      if (!editedStepIds.has(step.id)) {
        deleted++;
      }
    });
    
    // 変更されたステップ
    data.steps.forEach(originalStep => {
      const editedStep = editedData.steps.find(s => s.id === originalStep.id);
      if (editedStep) {
        // メッセージの変更
        if (originalStep.message !== editedStep.message) {
          modified++;
        }
        
        // オプションの変更
        const originalOptions = originalStep.options || [];
        const editedOptions = editedStep.options || [];
        
        if (JSON.stringify(originalOptions) !== JSON.stringify(editedOptions)) {
          modified++;
        }
        
        // チェックリストの変更
        const originalChecklist = originalStep.checklist || [];
        const editedChecklist = editedStep.checklist || [];
        
        if (JSON.stringify(originalChecklist) !== JSON.stringify(editedChecklist)) {
          modified++;
        }
        
        // next の変更
        if (originalStep.next !== editedStep.next) {
          modified++;
        }
        
        // end の変更
        if (originalStep.end !== editedStep.end) {
          modified++;
        }
      }
    });
    
    return { added, modified, deleted };
  };

  // 保存ボタンがクリックされたときの処理
  const handleSaveClick = () => {
    if (!editedData) return;
    
    // 基本バリデーション
    if (!editedData.id.trim()) {
      toast({
        title: '入力エラー',
        description: 'トラブルシューティングIDは必須です',
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
    
    // 変更内容を分析
    const changes = analyzeChanges();
    setSaveChanges(changes);
    
    // 変更がある場合、確認ダイアログを表示
    if (changes.added > 0 || changes.modified > 0 || changes.deleted > 0) {
      setShowSaveConfirmDialog(true);
    } else {
      // 変更がない場合
      toast({
        title: "変更なし",
        description: "変更点はありませんでした",
      });
    }
  };

  // データ保存処理
  const saveData = async () => {
    if (!editedData) return;
    
    try {
      setSaving(true);
      
      const response = await fetch(`/api/troubleshooting/update`, {
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
      
      // 保存に成功したら最新データを再取得
      fetchData();
      setShowSaveConfirmDialog(false);
      
      if (onSaveSuccess) {
        onSaveSuccess();
      }
    } catch (error) {
      console.error('保存エラー:', error);
      toast({
        title: 'エラー',
        description: 'データの保存に失敗しました',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!editedData) {
    return (
      <div className="text-center py-8">
        <p className="text-red-500">データの読み込みに失敗しました</p>
        <Button 
          variant="outline" 
          className="mt-4"
          onClick={onCancel}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          戻る
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>トラブルシューティング基本情報</CardTitle>
          <CardDescription>ID、タイトル、説明などの基本情報を編集できます</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="ts-id">ID</Label>
            <Input
              id="ts-id"
              value={editedData.id}
              onChange={(e) => setEditedData({...editedData, id: e.target.value})}
              placeholder="例: brake_failure"
              disabled={!!id} // 既存データの場合はIDは変更不可
            />
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="ts-title">タイトル</Label>
            <Input
              id="ts-title"
              value={editedData.title}
              onChange={(e) => setEditedData({...editedData, title: e.target.value})}
              placeholder="例: ブレーキ故障トラブルシューティング"
            />
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="ts-description">説明</Label>
            <Textarea
              id="ts-description"
              value={editedData.description}
              onChange={(e) => setEditedData({...editedData, description: e.target.value})}
              placeholder="例: ブレーキが正常に作動しない場合の対処方法"
              rows={3}
            />
          </div>
          
          <div className="grid gap-2">
            <div className="flex justify-between items-center">
              <Label>トリガーキーワード</Label>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setEditingTriggers(true)}
              >
                <Plus className="h-4 w-4 mr-1" />
                追加
              </Button>
            </div>
            
            {editedData.trigger.length === 0 ? (
              <p className="text-sm text-gray-500 italic">
                トリガーキーワードはまだ設定されていません
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {editedData.trigger.map((trigger, index) => (
                  <Badge key={index} variant="secondary" className="flex items-center gap-1">
                    {trigger}
                    <button 
                      onClick={() => handleRemoveTrigger(index)}
                      className="ml-1 text-gray-500 hover:text-red-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={onCancel}>
            キャンセル
          </Button>
          <Button onClick={handleSaveClick}>
            <Save className="h-4 w-4 mr-2" />
            保存
          </Button>
        </CardFooter>
      </Card>
      
      {/* ステップ一覧と編集エリア */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>ステップ一覧</CardTitle>
            <CardDescription>編集するステップを選択してください</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-2">
                {editedData.steps.map((step, index) => (
                  <div 
                    key={step.id}
                    className={`
                      p-3 rounded-md cursor-pointer border
                      ${selectedStepIndex === index 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:border-blue-200'}
                    `}
                    onClick={() => setSelectedStepIndex(index)}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-medium">{step.id}</p>
                        <p className="text-sm text-gray-500 truncate">
                          {step.message.substring(0, 40)}{step.message.length > 40 ? '...' : ''}
                        </p>
                      </div>
                      {step.id !== 'start' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveStep(index);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="flex mt-2 gap-2">
                      {step.options ? (
                        <Badge variant="outline" className="text-xs">
                          選択肢: {step.options.length}
                        </Badge>
                      ) : null}
                      {step.checklist ? (
                        <Badge variant="outline" className="text-xs">
                          チェックリスト: {step.checklist.length}
                        </Badge>
                      ) : null}
                      {step.end ? (
                        <Badge className="text-xs bg-green-500">
                          終了ステップ
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            
            <Button 
              variant="outline" 
              className="w-full mt-4"
              onClick={() => setNewStepDialogOpen(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              新規ステップ追加
            </Button>
          </CardContent>
        </Card>
        
        {/* ステップ編集エリア */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>
              {selectedStepIndex !== null
                ? `ステップ編集: ${editedData.steps[selectedStepIndex]?.id || ''}`
                : 'ステップ編集'}
            </CardTitle>
            <CardDescription>
              {selectedStepIndex !== null
                ? '各項目を編集してください'
                : '左のリストからステップを選択してください'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedStepIndex === null ? (
              <div className="text-center py-12 text-gray-500">
                <p>編集するステップを選択してください</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid gap-2">
                  <Label htmlFor="step-id">ステップID</Label>
                  <Input
                    id="step-id"
                    value={editedData.steps[selectedStepIndex].id}
                    disabled
                  />
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="step-message">メッセージ</Label>
                  <Textarea
                    id="step-message"
                    value={editedData.steps[selectedStepIndex].message}
                    onChange={(e) => handleStepChange(selectedStepIndex, 'message', e.target.value)}
                    placeholder="ステップのメッセージを入力"
                    rows={5}
                  />
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="step-image">画像パス（オプション）</Label>
                  <Input
                    id="step-image"
                    value={editedData.steps[selectedStepIndex].image || ''}
                    onChange={(e) => handleStepChange(selectedStepIndex, 'image', e.target.value)}
                    placeholder="例: /uploads/troubleshooting/brake_warning.png"
                  />
                </div>
                
                <div className="grid gap-2">
                  <div className="flex justify-between items-center">
                    <Label>選択肢（オプション）</Label>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleAddOption(selectedStepIndex)}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      選択肢を追加
                    </Button>
                  </div>
                  
                  {!editedData.steps[selectedStepIndex].options || 
                   editedData.steps[selectedStepIndex].options.length === 0 ? (
                    <p className="text-sm text-gray-500 italic">
                      選択肢はまだありません
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {editedData.steps[selectedStepIndex].options.map((option, optIndex) => (
                        <div key={optIndex} className="border rounded-md p-4 relative">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="absolute top-2 right-2 text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleRemoveOption(selectedStepIndex, optIndex)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                          
                          <div className="grid gap-2 mb-3">
                            <Label htmlFor={`option-label-${optIndex}`}>ラベル</Label>
                            <Input
                              id={`option-label-${optIndex}`}
                              value={option.label}
                              onChange={(e) => handleOptionChange(selectedStepIndex, optIndex, 'label', e.target.value)}
                              placeholder="例: ブレーキペダルが柔らかく感じる"
                            />
                          </div>
                          
                          <div className="grid gap-2">
                            <Label htmlFor={`option-next-${optIndex}`}>次のステップID</Label>
                            <Input
                              id={`option-next-${optIndex}`}
                              value={option.next}
                              onChange={(e) => handleOptionChange(selectedStepIndex, optIndex, 'next', e.target.value)}
                              placeholder="例: soft_pedal"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="grid gap-2">
                  <div className="flex justify-between items-center">
                    <Label>チェックリスト（オプション）</Label>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleAddChecklistItem(selectedStepIndex)}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      項目を追加
                    </Button>
                  </div>
                  
                  {!editedData.steps[selectedStepIndex].checklist || 
                   editedData.steps[selectedStepIndex].checklist.length === 0 ? (
                    <p className="text-sm text-gray-500 italic">
                      チェックリストはまだありません
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {editedData.steps[selectedStepIndex].checklist.map((item, itemIndex) => (
                        <div key={itemIndex} className="flex items-center gap-2">
                          <Input
                            value={item}
                            onChange={(e) => handleChecklistItemChange(selectedStepIndex, itemIndex, e.target.value)}
                            placeholder="チェックリスト項目"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleRemoveChecklistItem(selectedStepIndex, itemIndex)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="step-next">次のステップID（選択肢がない場合）</Label>
                  <Input
                    id="step-next"
                    value={editedData.steps[selectedStepIndex].next || ''}
                    onChange={(e) => handleStepChange(selectedStepIndex, 'next', e.target.value)}
                    placeholder="例: maintenance_required"
                    disabled={
                      editedData.steps[selectedStepIndex].end === true || 
                      (editedData.steps[selectedStepIndex].options && 
                       editedData.steps[selectedStepIndex].options.length > 0)
                    }
                  />
                </div>
                
                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    id="step-end"
                    checked={editedData.steps[selectedStepIndex].end === true}
                    onChange={(e) => handleStepChange(selectedStepIndex, 'end', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <Label htmlFor="step-end">終了ステップ（フローの終点）</Label>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* トリガー入力ダイアログ */}
      <Dialog open={editingTriggers} onOpenChange={setEditingTriggers}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>トリガーキーワード追加</DialogTitle>
            <DialogDescription>
              トラブルシューティングを起動するキーワードを入力してください
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="new-trigger">新しいトリガーキーワード</Label>
                <div className="flex gap-2">
                  <Input
                    id="new-trigger"
                    value={newTrigger}
                    onChange={(e) => setNewTrigger(e.target.value)}
                    placeholder="例: ブレーキ故障"
                  />
                  <Button onClick={handleAddTrigger}>追加</Button>
                </div>
              </div>
              
              <div className="grid gap-2">
                <Label>現在のトリガーキーワード</Label>
                <div className="flex flex-wrap gap-2 border rounded-md p-3 min-h-[80px]">
                  {editedData.trigger.length === 0 ? (
                    <p className="text-sm text-gray-500 italic">
                      トリガーキーワードはまだありません
                    </p>
                  ) : (
                    editedData.trigger.map((trigger, index) => (
                      <Badge key={index} variant="secondary" className="flex items-center gap-1">
                        {trigger}
                        <button 
                          onClick={() => handleRemoveTrigger(index)}
                          className="ml-1 text-gray-500 hover:text-red-500"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setEditingTriggers(false)}>
              完了
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* 新規ステップ追加ダイアログ */}
      <Dialog open={newStepDialogOpen} onOpenChange={setNewStepDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新規ステップ追加</DialogTitle>
            <DialogDescription>
              追加するステップのIDを入力してください
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="grid gap-2">
              <Label htmlFor="new-step-id">ステップID</Label>
              <Input
                id="new-step-id"
                value={newStepId}
                onChange={(e) => setNewStepId(e.target.value)}
                placeholder="例: fluid_check"
              />
              <p className="text-xs text-gray-500">
                ステップIDは他のステップから参照するための一意の識別子です。<br />
                半角英数字とアンダースコアのみ使用できます。
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewStepDialogOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={handleAddStep}>
              追加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* 保存確認ダイアログ */}
      <Dialog open={showSaveConfirmDialog} onOpenChange={setShowSaveConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>変更内容の確認</DialogTitle>
            <DialogDescription>
              以下の変更を保存しますか？
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              {saveChanges.added > 0 && (
                <div className="flex items-center text-green-600">
                  <Plus className="h-4 w-4 mr-2" />
                  <span>新規追加項目: {saveChanges.added}件</span>
                </div>
              )}
              {saveChanges.modified > 0 && (
                <div className="flex items-center text-blue-600">
                  <Pencil className="h-4 w-4 mr-2" />
                  <span>更新項目: {saveChanges.modified}件</span>
                </div>
              )}
              {saveChanges.deleted > 0 && (
                <div className="flex items-center text-red-600">
                  <Trash2 className="h-4 w-4 mr-2" />
                  <span>削除項目: {saveChanges.deleted}件</span>
                </div>
              )}
            </div>
            <p className="mt-4 text-sm text-gray-600">
              保存すると既存のデータは上書きされます。削除した項目は完全に削除され、新規追加した項目が追加されます。
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveConfirmDialog(false)}>
              キャンセル
            </Button>
            <Button onClick={saveData} disabled={saving}>
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
}
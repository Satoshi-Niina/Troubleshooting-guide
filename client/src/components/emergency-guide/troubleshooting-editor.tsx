import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Plus, Save, X, ChevronDown, ChevronUp, Edit, Trash } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Step {
  id: string;
  title: string;
  content: string;
  imageUrl?: string;
}

interface TroubleshootingData {
  id: string;
  title: string;
  description: string;
  keywords: string[];
  createdAt: string;
  steps: Step[];
}

interface TroubleshootingEditorProps {
  data: TroubleshootingData;
  onSave: (data: TroubleshootingData) => void;
  onCancel: () => void;
}

const TroubleshootingEditor: React.FC<TroubleshootingEditorProps> = ({ data, onSave, onCancel }) => {
  const { toast } = useToast();
  const [editedData, setEditedData] = useState<TroubleshootingData>({ ...data });
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [stepToDelete, setStepToDelete] = useState<number | null>(null);
  const [showAddSlideDialog, setShowAddSlideDialog] = useState(false);
  const [addSlidePosition, setAddSlidePosition] = useState<number | null>(null);
  const [newSlide, setNewSlide] = useState<Omit<Step, 'id'>>({
    title: '',
    content: '',
    imageUrl: ''
  });

  // 基本情報の編集
  const handleBasicInfoChange = (field: keyof TroubleshootingData, value: any) => {
    setEditedData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // キーワードの編集
  const handleKeywordsChange = (value: string) => {
    const keywordsArray = value.split(',').map(k => k.trim()).filter(k => k);
    setEditedData(prev => ({
      ...prev,
      keywords: keywordsArray
    }));
  };

  // ステップの編集
  const handleStepChange = (index: number, field: keyof Step, value: string) => {
    const updatedSteps = [...editedData.steps];
    updatedSteps[index] = {
      ...updatedSteps[index],
      [field]: value
    };
    setEditedData(prev => ({
      ...prev,
      steps: updatedSteps
    }));
  };

  // ステップの削除
  const handleDeleteStep = (index: number) => {
    setStepToDelete(index);
    setIsDeleteDialogOpen(true);
  };

  // ステップの削除実行
  const executeDeleteStep = () => {
    if (stepToDelete !== null) {
      const updatedSteps = editedData.steps.filter((_, i) => i !== stepToDelete);
      setEditedData(prev => ({
        ...prev,
        steps: updatedSteps
      }));
      toast({
        title: "ステップを削除しました",
        description: `ステップ ${stepToDelete + 1}を削除しました`,
      });
    }
    setIsDeleteDialogOpen(false);
    setStepToDelete(null);
  };

  // ステップの上下移動
  const moveStep = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) || 
      (direction === 'down' && index === editedData.steps.length - 1)
    ) {
      return;
    }

    const updatedSteps = [...editedData.steps];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    
    // 入れ替え
    [updatedSteps[index], updatedSteps[newIndex]] = [updatedSteps[newIndex], updatedSteps[index]];
    
    setEditedData(prev => ({
      ...prev,
      steps: updatedSteps
    }));
  };

  // スライド追加ダイアログを表示
  const handleShowAddSlideDialog = (position: number) => {
    setAddSlidePosition(position);
    setNewSlide({
      title: '',
      content: '',
      imageUrl: ''
    });
    setShowAddSlideDialog(true);
  };

  // 新しいスライドを追加
  const handleAddSlide = () => {
    if (!newSlide.title) {
      toast({
        title: "入力エラー",
        description: "スライドのタイトルを入力してください",
        variant: "destructive",
      });
      return;
    }

    const updatedSteps = [...editedData.steps];
    const position = addSlidePosition !== null ? addSlidePosition : updatedSteps.length;
    
    const newStepId = `step${Date.now()}`;
    const newStepObj = {
      ...newSlide,
      id: newStepId
    };
    
    updatedSteps.splice(position, 0, newStepObj);
    
    setEditedData(prev => ({
      ...prev,
      steps: updatedSteps
    }));
    
    setShowAddSlideDialog(false);
    setAddSlidePosition(null);
    
    toast({
      title: "スライドを追加しました",
      description: `「${newSlide.title}」を追加しました`,
    });
  };

  // 変更を保存
  const handleSave = () => {
    // 基本的なバリデーション
    if (!editedData.title || editedData.steps.length === 0) {
      toast({
        title: "入力エラー",
        description: "タイトルとステップが必要です",
        variant: "destructive",
      });
      return;
    }

    // 保存
    onSave(editedData);
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>基本情報</CardTitle>
          <CardDescription>フローの基本情報を編集します</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="title">タイトル</Label>
            <Input 
              id="title" 
              value={editedData.title} 
              onChange={e => handleBasicInfoChange('title', e.target.value)}
              placeholder="エラー対応フローのタイトル"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">説明</Label>
            <Textarea 
              id="description" 
              value={editedData.description} 
              onChange={e => handleBasicInfoChange('description', e.target.value)}
              placeholder="フローの説明や用途など"
              rows={2}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="keywords">キーワード（カンマ区切り）</Label>
            <Input 
              id="keywords" 
              value={editedData.keywords.join(', ')} 
              onChange={e => handleKeywordsChange(e.target.value)}
              placeholder="エンジン, 過熱, エラー"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="flex-1 overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>スライド ({editedData.steps.length}件)</CardTitle>
              <CardDescription>スライドの順序と内容を編集します</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleShowAddSlideDialog(editedData.steps.length)}
            >
              <Plus className="mr-2 h-4 w-4" />
              スライド追加
            </Button>
          </div>
        </CardHeader>
        <ScrollArea className="h-[calc(100vh-450px)]">
          <CardContent className="space-y-6 pt-0">
            {editedData.steps.map((step, index) => (
              <div key={step.id || index} className="border rounded-md p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{index + 1}</Badge>
                    <span className="font-medium">{step.title}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => moveStep(index, 'up')}
                      disabled={index === 0}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => moveStep(index, 'down')}
                      disabled={index === editedData.steps.length - 1}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleDeleteStep(index)}
                    >
                      <Trash className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="grid gap-1">
                    <Label htmlFor={`step-${index}-title`}>タイトル</Label>
                    <Input 
                      id={`step-${index}-title`} 
                      value={step.title} 
                      onChange={e => handleStepChange(index, 'title', e.target.value)}
                      placeholder="ステップのタイトル"
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`step-${index}-content`}>内容</Label>
                    <Textarea 
                      id={`step-${index}-content`} 
                      value={step.content} 
                      onChange={e => handleStepChange(index, 'content', e.target.value)}
                      placeholder="ステップの詳細内容"
                      rows={3}
                    />
                  </div>
                </div>
                
                {index < editedData.steps.length - 1 && (
                  <div className="flex items-center justify-center mt-4 py-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full max-w-xs border-dashed"
                      onClick={() => handleShowAddSlideDialog(index + 1)}
                    >
                      <Plus className="mr-2 h-3 w-3" />
                      ここにスライドを追加
                    </Button>
                  </div>
                )}
              </div>
            ))}
            
            {editedData.steps.length === 0 && (
              <div className="py-8 text-center border border-dashed rounded-lg">
                <div className="flex flex-col items-center justify-center space-y-2">
                  <Plus className="h-8 w-8 text-gray-400" />
                  <h3 className="text-lg font-medium text-gray-600">スライドがありません</h3>
                  <p className="text-sm text-gray-500">
                    「スライド追加」ボタンをクリックして最初のスライドを追加してください
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-2"
                    onClick={() => handleShowAddSlideDialog(0)}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    スライド追加
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </ScrollArea>
        <CardFooter className="border-t p-4 bg-gray-50">
          <div className="flex justify-end gap-2 w-full">
            <Button variant="outline" onClick={onCancel}>
              <X className="mr-2 h-4 w-4" />
              キャンセル
            </Button>
            <Button onClick={handleSave}>
              <Save className="mr-2 h-4 w-4" />
              保存
            </Button>
          </div>
        </CardFooter>
      </Card>

      {/* ステップ削除確認ダイアログ */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ステップを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              {stepToDelete !== null && editedData.steps[stepToDelete] && (
                <>ステップ {stepToDelete + 1}: 「{editedData.steps[stepToDelete].title}」</>
              )}
              を削除します。この操作は元に戻せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={executeDeleteStep} className="bg-red-500 hover:bg-red-600">
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* スライド追加ダイアログ */}
      <AlertDialog open={showAddSlideDialog} onOpenChange={setShowAddSlideDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>新しいスライドを追加</AlertDialogTitle>
            <AlertDialogDescription>
              {addSlidePosition !== null && (
                addSlidePosition < editedData.steps.length ? 
                `ステップ ${addSlidePosition} と ${addSlidePosition + 1} の間に新しいスライドを追加します。` :
                `最後に新しいスライドを追加します。`
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="new-slide-title">タイトル</Label>
              <Input 
                id="new-slide-title" 
                value={newSlide.title} 
                onChange={e => setNewSlide({...newSlide, title: e.target.value})}
                placeholder="新しいステップのタイトル"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-slide-content">内容</Label>
              <Textarea 
                id="new-slide-content" 
                value={newSlide.content} 
                onChange={e => setNewSlide({...newSlide, content: e.target.value})}
                placeholder="ステップの詳細内容"
                rows={3}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={handleAddSlide}>
              追加
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TroubleshootingEditor;
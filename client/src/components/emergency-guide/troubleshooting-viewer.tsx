import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit, ArrowLeft, ArrowRight, Calendar } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import TroubleshootingEditor from './troubleshooting-editor';
import { useToast } from '@/hooks/use-toast';

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

interface TroubleshootingViewerProps {
  data: TroubleshootingData;
  onSave: (data: TroubleshootingData) => Promise<void>;
  onBack: () => void;
}

const TroubleshootingViewer: React.FC<TroubleshootingViewerProps> = ({ data, onSave, onBack }) => {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(0);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // 前のスライドに移動
  const goToPrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  // 次のスライドに移動
  const goToNext = () => {
    if (currentStep < data.steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  // 編集モードの切り替え
  const toggleEditMode = () => {
    setIsEditMode(!isEditMode);
  };

  // 編集した内容を保存
  const handleSave = async (editedData: TroubleshootingData) => {
    try {
      setIsSaving(true);
      await onSave(editedData);
      setIsEditMode(false);
      toast({
        title: "保存成功",
        description: "トラブルシューティングデータが更新されました",
      });
    } catch (error) {
      toast({
        title: "保存エラー",
        description: "データの保存中にエラーが発生しました",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // 編集モードをキャンセル
  const handleCancel = () => {
    setIsEditMode(false);
  };

  // 編集モードの場合
  if (isEditMode) {
    return (
      <div className="container py-4 mx-auto">
        <div className="flex items-center justify-between mb-4">
          <Button variant="outline" onClick={handleCancel}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            戻る
          </Button>
          <h2 className="text-xl font-bold">トラブルシューティング編集</h2>
          <div className="w-24" />
        </div>
        <TroubleshootingEditor
          data={data}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      </div>
    );
  }

  // 表示モードの場合
  return (
    <div className="container py-4 mx-auto">
      <div className="flex items-center justify-between mb-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          戻る
        </Button>
        <h2 className="text-xl font-bold">{data.title}</h2>
        <Button onClick={toggleEditMode}>
          <Edit className="mr-2 h-4 w-4" />
          編集
        </Button>
      </div>

      {/* 基本情報カード */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle>{data.title}</CardTitle>
            <Badge variant="outline">
              <Calendar className="h-3 w-3 mr-1" />
              {new Date(data.createdAt).toLocaleDateString()}
            </Badge>
          </div>
          <CardDescription>{data.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {data.keywords.map((keyword, i) => (
              <Badge key={i} variant="secondary">{keyword}</Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* スライド表示 */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              ステップ {currentStep + 1}/{data.steps.length}: {data.steps[currentStep]?.title}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px] rounded-md border p-4">
            <div className="prose prose-sm max-w-none">
              {data.steps[currentStep]?.content.split("\n").map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
        <CardFooter className="justify-between border-t p-4">
          <Button
            variant="outline"
            onClick={goToPrevious}
            disabled={currentStep === 0}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            前へ
          </Button>
          <div className="flex items-center">
            {Array.from({ length: data.steps.length }).map((_, i) => (
              <div
                key={i}
                className={`
                  w-2 h-2 mx-1 rounded-full cursor-pointer transition-colors
                  ${i === currentStep ? 'bg-primary' : 'bg-gray-300'}
                `}
                onClick={() => setCurrentStep(i)}
              />
            ))}
          </div>
        </CardFooter>
      </Card>

      {/* 全スライド一覧 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">全スライド一覧</CardTitle>
          <CardDescription>クリックするとスライドに移動します</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.steps.map((step, i) => (
              <Card
                key={step.id || i}
                className={`cursor-pointer hover:border-primary ${
                  i === currentStep ? 'border-primary bg-primary/5' : ''
                }`}
                onClick={() => setCurrentStep(i)}
              >
                <CardHeader className="p-3 pb-1">
                  <div className="flex items-center">
                    <Badge variant="outline" className="mr-2">
                      {i + 1}
                    </Badge>
                    <CardTitle className="text-sm">{step.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-3 pt-1">
                  <p className="text-xs text-gray-500 line-clamp-2">
                    {step.content}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TroubleshootingViewer;
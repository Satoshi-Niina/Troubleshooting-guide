import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, ArrowRight } from 'lucide-react';

// サンプルデータタイプと同じ型を使用
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

interface TroubleshootingPreviewProps {
  steps: TroubleshootingStep[];
  initialStepId?: string;
}

const TroubleshootingPreview: React.FC<TroubleshootingPreviewProps> = ({ 
  steps, 
  initialStepId = 'start' 
}) => {
  const [currentStepId, setCurrentStepId] = useState<string>(initialStepId);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [history, setHistory] = useState<string[]>([initialStepId]);

  // 現在のステップを取得
  const currentStep = steps.find(step => step.id === currentStepId);
  
  // 次のステップに進む処理
  const handleNext = () => {
    if (currentStep?.next) {
      const nextStep = currentStep.next;
      setCurrentStepId(nextStep);
      setHistory([...history, nextStep]);
    }
  };
  
  // オプションを選択したときの処理
  const handleOptionSelect = (nextStepId: string) => {
    setCurrentStepId(nextStepId);
    setHistory([...history, nextStepId]);
  };
  
  // チェックリストの項目をトグル
  const toggleChecklist = (index: number) => {
    const itemKey = `${currentStepId}-${index}`;
    setCheckedItems({
      ...checkedItems,
      [itemKey]: !checkedItems[itemKey]
    });
  };
  
  // 戻るボタンの処理
  const handleBack = () => {
    if (history.length > 1) {
      const newHistory = [...history];
      newHistory.pop(); // 現在のステップを削除
      const previousStepId = newHistory[newHistory.length - 1];
      setCurrentStepId(previousStepId);
      setHistory(newHistory);
    }
  };
  
  // フローをリセット
  const handleReset = () => {
    setCurrentStepId(initialStepId);
    setCheckedItems({});
    setHistory([initialStepId]);
  };
  
  // 現在のステップがチェックリストを持っているかどうか
  const hasChecklist = currentStep?.checklist && currentStep.checklist.length > 0;
  
  // 現在のステップが選択肢を持っているかどうか
  const hasOptions = currentStep?.options && currentStep.options.length > 0;
  
  // 次へボタンが有効かどうか（チェックリストがすべてチェックされているか）
  const isNextButtonEnabled = !hasChecklist || 
    (currentStep?.checklist?.every((_, index) => 
      checkedItems[`${currentStepId}-${index}`]));
  
  // 終了ステップかどうか
  const isEndStep = currentStep?.end;
  
  if (!currentStep) {
    return <div className="text-center p-4">ステップ "{currentStepId}" が見つかりません</div>;
  }
  
  return (
    <Card className="max-w-xl mx-auto shadow-lg">
      <CardHeader className="bg-blue-50">
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg">トラブルシューティングプレビュー</CardTitle>
          <Badge variant="outline" className="font-mono">
            {currentStepId}
          </Badge>
        </div>
        <CardDescription>
          現在編集中の内容をリアルタイムでプレビューします。編集内容がすぐに反映されます。
        </CardDescription>
      </CardHeader>
      
      <CardContent className="pt-6 pb-4">
        <div className="space-y-6">
          {/* ステップのメッセージ表示 */}
          <div className="prose">
            {currentStep.message.split('\n').map((line, idx) => (
              <p key={idx} className={idx === 0 ? "font-medium text-lg" : "text-gray-700"}>
                {line}
              </p>
            ))}
          </div>
          
          {/* チェックリスト表示 */}
          {hasChecklist && (
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-md font-medium mb-3">確認事項:</h3>
              <div className="space-y-2">
                {currentStep.checklist?.map((item, index) => (
                  <div 
                    key={index}
                    className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded-md cursor-pointer"
                    onClick={() => toggleChecklist(index)}
                  >
                    <div className={`w-5 h-5 flex items-center justify-center border rounded-sm 
                      ${checkedItems[`${currentStepId}-${index}`] ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}>
                      {checkedItems[`${currentStepId}-${index}`] && <Check className="h-4 w-4 text-white" />}
                    </div>
                    <span className={checkedItems[`${currentStepId}-${index}`] ? 'line-through text-gray-500' : ''}>
                      {item}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* 選択肢表示 */}
          {hasOptions && (
            <div className="space-y-2">
              {currentStep.options?.map((option, index) => (
                <Button
                  key={index}
                  variant="outline"
                  className="w-full justify-start text-left h-auto py-3 px-4"
                  onClick={() => handleOptionSelect(option.next)}
                >
                  <div className="flex gap-2 items-start">
                    <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      {index + 1}
                    </div>
                    <span>{option.label}</span>
                  </div>
                </Button>
              ))}
            </div>
          )}
          
          {/* 次へボタン（選択肢がない場合のみ表示） */}
          {!hasOptions && !isEndStep && currentStep.next && (
            <div className="pt-4">
              <Button 
                className="w-full"
                onClick={handleNext}
                disabled={!isNextButtonEnabled}
              >
                次へ進む
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}
          
          {/* 終了メッセージ */}
          {isEndStep && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <h3 className="text-green-800 font-medium mb-2">トラブルシューティングが完了しました</h3>
              <p className="text-green-700 text-sm">お疲れ様でした。問題は解決しましたか？</p>
            </div>
          )}
          
          {/* ナビゲーションコントロール */}
          <div className="flex justify-between pt-6 border-t">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              disabled={history.length <= 1}
            >
              戻る
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
            >
              最初からやり直す
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default TroubleshootingPreview;
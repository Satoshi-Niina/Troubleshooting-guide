import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, Tag } from 'lucide-react';

interface KeywordSuggestionsProps {
  onKeywordClick: (keyword: string) => void;
}

/**
 * 代表的な検索キーワードを表示するコンポーネント
 */
const KeywordSuggestions: React.FC<KeywordSuggestionsProps> = ({ onKeywordClick }) => {
  // 代表的なキーワードリスト
  const keywords = [
    { id: 'engine', label: 'エンジン', color: 'bg-blue-100 text-blue-800 hover:bg-blue-200' },
    { id: 'torque', label: 'トルコン', color: 'bg-green-100 text-green-800 hover:bg-green-200' },
    { id: 'brake', label: 'ブレーキ', color: 'bg-red-100 text-red-800 hover:bg-red-200' },
    { id: 'air-circuit', label: 'エアー回路', color: 'bg-purple-100 text-purple-800 hover:bg-purple-200' },
  ];

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-md flex items-center">
          <Search className="h-4 w-4 mr-2 text-gray-500" />
          <span>代表的な検索キーワード</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {keywords.map((keyword) => (
            <Button
              key={keyword.id}
              variant="outline"
              size="sm"
              className={`flex items-center ${keyword.color} border-0`}
              onClick={() => onKeywordClick(keyword.label)}
            >
              <Tag className="h-3 w-3 mr-1" />
              {keyword.label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default KeywordSuggestions;
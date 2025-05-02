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
    // Note: Previous keywords have been removed as requested
  ];

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-md flex items-center">
          <Search className="h-4 w-4 mr-2 text-gray-500" />
          <span>検索</span>
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
import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search } from 'lucide-react';

interface KeywordSuggestionsProps {
  onKeywordClick: (keyword: string) => void;
}

/**
 * 検索コンポーネント
 */
const KeywordSuggestions: React.FC<KeywordSuggestionsProps> = ({ onKeywordClick }) => {
  // カスタムキーワード入力用の状態
  const [customKeyword, setCustomKeyword] = React.useState('');
  
  // カスタムキーワード検索の実行
  const handleCustomSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (customKeyword.trim()) {
      onKeywordClick(customKeyword);
      setCustomKeyword('');
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-md flex items-center">
          <Search className="h-4 w-4 mr-2 text-gray-500" />
          <span>検索</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleCustomSearch} className="flex items-center space-x-2">
          <input
            type="text"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="キーワードを入力..."
            value={customKeyword}
            onChange={(e) => setCustomKeyword(e.target.value)}
          />
          <Button type="submit" size="sm">検索</Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default KeywordSuggestions;
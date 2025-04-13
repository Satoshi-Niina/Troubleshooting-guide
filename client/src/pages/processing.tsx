import { useAuth } from "@/context/auth-context";
import { Database } from "lucide-react";
import UnifiedDataProcessor from "@/components/knowledge/unified-data-processor";

export default function Processing() {
  const { user } = useAuth();

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="p-4 border-b border-neutral-200 bg-gradient-to-r from-blue-50 to-indigo-50">
        <h2 className="font-semibold text-lg text-indigo-600">統合データ処理・ナレッジベース管理</h2>
        <p className="text-sm text-neutral-500">文書のアップロードと処理により、AIナレッジベース、画像検索、Q&Aデータを一度に生成します</p>
      </div>
      
      <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
        <div className="mx-auto max-w-5xl">
          <div className="mb-4 flex items-center">
            <Database className="text-blue-600 h-6 w-6 mr-2" />
            <h3 className="font-semibold text-blue-700 text-xl">データ処理サービス</h3>
          </div>
          
          {/* 統合データ処理コンポーネント */}
          <UnifiedDataProcessor />
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import TroubleshootingFlow from "./troubleshooting-flow";
import { useToast } from "@/hooks/use-toast";

// トラブルシューティングフローの型定義
interface TroubleshootingFlow {
  id: string;
  description: string;
  trigger?: string[];
}

interface TroubleshootingSelectorProps {
  initialSearchKeyword?: string;
}

export default function TroubleshootingSelector({
  initialSearchKeyword = "",
}: TroubleshootingSelectorProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [flows, setFlows] = useState<TroubleshootingFlow[]>([]);
  const [searchTerm, setSearchTerm] = useState(initialSearchKeyword || "");
  const [filteredFlows, setFilteredFlows] = useState<TroubleshootingFlow[]>([]);
  const [selectedFlow, setSelectedFlow] = useState<string | null>(null);

  // トラブルシューティングフローのリストを取得
  useEffect(() => {
    const fetchFlows = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/troubleshooting");
        if (!response.ok) {
          throw new Error(`Error ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        setFlows(data);
        setFilteredFlows(data);
      } catch (error) {
        console.error(
          "トラブルシューティングデータの取得に失敗しました:",
          error,
        );
        toast({
          title: "エラー",
          description: "トラブルシューティングデータの取得に失敗しました",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchFlows();
  }, [toast]);

  // 初期キーワードがある場合は自動検索を実行
  useEffect(() => {
    if (
      initialSearchKeyword &&
      initialSearchKeyword.trim() &&
      flows.length > 0
    ) {
      // 自動検索を実行
      const term = initialSearchKeyword.toLowerCase();
      const filtered = flows.filter(
        (flow) =>
          flow.id.toLowerCase().includes(term) ||
          flow.description.toLowerCase().includes(term) ||
          (flow.trigger &&
            flow.trigger.some((trigger) =>
              trigger.toLowerCase().includes(term),
            )),
      );

      setFilteredFlows(filtered);

      // 検索結果が1つだけの場合は自動選択
      if (filtered.length === 1) {
        setSelectedFlow(filtered[0].id);
      }
    }
  }, [initialSearchKeyword, flows]);

  // 検索条件でフローをフィルタリング
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredFlows(flows);
      return;
    }

    const term = searchTerm.toLowerCase();
    const filtered = flows.filter(
      (flow) =>
        flow.id.toLowerCase().includes(term) ||
        flow.description.toLowerCase().includes(term) ||
        (flow.trigger &&
          flow.trigger.some((trigger) => trigger.toLowerCase().includes(term))),
    );

    setFilteredFlows(filtered);
  }, [searchTerm, flows]);

  // フローを選択
  const handleSelectFlow = (id: string) => {
    setSelectedFlow(id);
  };

  // フローの表示をキャンセル
  const handleCancelFlow = () => {
    setSelectedFlow(null);
  };

  // フローが完了した場合
  const handleFlowComplete = () => {
    toast({
      title: "完了",
      description: "トラブルシューティングが完了しました",
    });
    setSelectedFlow(null);
  };

  // 検索条件のクリア
  const handleClearSearch = () => {
    setSearchTerm("");
  };

  // キーワードによる検索実行
  const handleSearch = async () => {
    if (!searchTerm.trim()) return;

    try {
      setLoading(true);
      const response = await fetch("/api/troubleshooting/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: searchTerm }),
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setFilteredFlows(data);
    } catch (error) {
      console.error("トラブルシューティング検索に失敗しました:", error);
      toast({
        title: "エラー",
        description: "検索処理に失敗しました",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // 特定のフローが選択されている場合はそのフローを表示
  if (selectedFlow) {
    return (
      <div className="w-full max-w-4xl mx-auto p-4">
        <TroubleshootingFlow
          id={selectedFlow}
          onComplete={handleFlowComplete}
          onExit={handleCancelFlow}
        />
      </div>
    );
  }

  return (
    <Card className="w-full max-w-3xl mx-auto">
      <CardHeader>
        <CardTitle className="text-xl">応急処置ガイド</CardTitle>
      </CardHeader>

      <CardContent>
        <div className="mb-6">
          <p className="mb-4 text-sm text-gray-600">
            以下から症状を選択するか、キーワードで検索してください。
          </p>

          <div className="flex gap-2 mb-4">
            <Input
              placeholder="キーワードで検索..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSearch();
                }
              }}
              className="flex-1"
            />
            <Button variant="outline" onClick={handleClearSearch}>
              クリア
            </Button>
            <Button onClick={handleSearch}>検索</Button>
          </div>

          {/* 代表的なキーワードボタン */}
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="text-sm text-gray-600 self-center mr-1">
              代表的なキーワード:
            </span>
            {["エンジン", "トルコン", "ブレーキ", "エアー", "バッテリー"].map(
              (keyword) => (
                <Button
                  key={keyword}
                  variant="outline"
                  size="sm"
                  className="bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
                  onClick={() => {
                    setSearchTerm(keyword);
                    // キーワード設定後すぐに検索を実行
                    setTimeout(() => handleSearch(), 0);
                  }}
                >
                  {keyword}
                </Button>
              ),
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        ) : filteredFlows.length > 0 ? (
          <div className="grid grid-cols-1 gap-3">
            {filteredFlows.map((flow) => (
              <Button
                key={flow.id}
                variant="outline"
                className="justify-start h-auto py-3 px-4 text-left"
                onClick={() => handleSelectFlow(flow.id)}
              >
                <div className="w-full">
                  <div className="flex justify-between items-center">
                    <p className="font-medium">{flow.description}</p>
                    <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                      {flow.id.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {flow.trigger && flow.trigger.slice(0, 3).join(", ")}
                    {flow.trigger && flow.trigger.length > 3 ? " など" : ""}
                  </p>
                </div>
              </Button>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-500">
              検索結果がありません。別のキーワードで試してください。
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

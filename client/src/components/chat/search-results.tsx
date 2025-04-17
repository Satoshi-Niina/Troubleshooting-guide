import { FileText, MessageCircle } from "lucide-react";
import { useOrientation } from "@/hooks/use-orientation";
import { useIsMobile } from "@/hooks/use-mobile";
import { useEffect } from "react";
import { cancelSearch } from "@/lib/image-search";

// 画像パスを修正するヘルパー関数 - パスを適切に変換
function fixImagePath(path: string | undefined): string {
  if (!path) return '';
  
  // knowledge-base/images/ パスを持っていれば変更しない
  if (path.includes('/knowledge-base/images/')) {
    return path;
  }
  
  // /uploads/images/ から始まる場合は /knowledge-base/images/ に変換
  if (path.includes('/uploads/images/')) {
    return path.replace('/uploads/images/', '/knowledge-base/images/');
  }
  
  // /images/ から始まる場合は /knowledge-base/images/ に変換
  if (path.startsWith('/images/')) {
    return path.replace('/images/', '/knowledge-base/images/');
  }
  
  // /uploads/ から始まるがサブフォルダが不明確な場合
  if (path.startsWith('/uploads/') && !path.includes('/uploads/data/') && !path.includes('/uploads/json/')) {
    const parts = path.split('/');
    const fileName = parts.pop(); // 最後の部分（ファイル名）を取得
    if (fileName) {
      return `/knowledge-base/images/${fileName}`;
    }
  }
  
  // 単なるファイル名の場合（パスがない）
  if (!path.includes('/') && (path.endsWith('.svg') || path.endsWith('.png') || path.endsWith('.jpg') || path.endsWith('.jpeg'))) {
    return `/knowledge-base/images/${path}`;
  }
  
  return path;
}

interface SearchResult {
  id: number | string;
  title: string;
  type: string; // 'image' | 'svg-image' | 'text' | 'ai-response' | string
  url?: string;
  pngFallbackUrl?: string; // SVG画像の代替PNG URL
  content?: string;
  relevance?: number;
  timestamp?: Date;
  metadata_json?: string;
  all_slides?: string[];
  details?: string;
}

interface SearchResultsProps {
  results: SearchResult[];
  onClear: () => void;
}

export default function SearchResults({ results, onClear }: SearchResultsProps) {
  const orientation = useOrientation();
  const { isMobile } = useIsMobile();
  
  // 検索結果を表示したら検索処理を停止（点滅問題解決）
  useEffect(() => {
    if (results && results.length > 0) {
      // 検索結果が表示されたら、実行中の検索をキャンセルして点滅を防止
      cancelSearch();
    }
  }, [results]);

  // デバイスに応じたレイアウトクラス
  // iPhoneの場合は特別なスタイルを適用
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  
  // 画面方向に応じたスタイルの設定
  const isLandscape = orientation === 'landscape';
  
  // モバイル&横向きの場合は全画面表示、それ以外は通常表示
  const containerClass = isMobile && isLandscape
    ? "fixed inset-0 z-50 bg-transparent p-4 overflow-auto chat-controls-container"
    : "p-4";

  return (
    <div className={containerClass}>
      {/* モバイル表示時のみタイトルを表示 */}
      {isMobile && (
        <div className="sticky top-0 bg-blue-600 text-white p-2 z-10 mb-3">
          <div className="flex justify-between items-center">
            <h2 className="font-medium text-lg">関係画像</h2>
            <button 
              onClick={onClear}
              className="text-white hover:text-blue-200"
            >
              ✕
            </button>
          </div>
        </div>
      )}
      
      {/* サムネイル縦一列表示 */}
      <div className="flex flex-col gap-4">
        {results.map((result) => (
          <div 
            key={result.id} 
            className="thumbnail-item rounded-lg overflow-hidden bg-transparent shadow-sm w-full hover:bg-blue-50 transition-colors"
            onClick={() => {
              // イメージプレビューモーダルを表示
              window.dispatchEvent(new CustomEvent('preview-image', { 
                detail: { 
                  url: fixImagePath(result.url),
                  pngFallbackUrl: fixImagePath(result.pngFallbackUrl),
                  title: result.title,
                  content: result.content,
                  metadata_json: result.metadata_json,
                  all_slides: result.all_slides?.map(slide => fixImagePath(slide))
                } 
              }));
            }}
          >
            {result.url ? (
              // 画像サムネイル (テキストなしのカードスタイル)
              <div className="flex justify-center items-center w-full bg-transparent border border-blue-200 rounded-lg">
                <div className="relative w-full h-24 flex-shrink-0 overflow-hidden">
                  {/* バックアップ画像を先にロードして隠しておく（SVG読み込み失敗時の高速切り替え用） */}
                  {result.pngFallbackUrl && (
                    <img 
                      src={fixImagePath(result.pngFallbackUrl)}
                      alt="バックアップ画像"
                      className="hidden" 
                      style={{ display: 'none' }}
                      loading="eager"
                      decoding="async"
                    />
                  )}
                  
                  {/* メイン画像 - PNG代替があるならそちらを優先表示（より信頼性が高いため） */}
                  <img 
                    src={fixImagePath(result.pngFallbackUrl || result.url)} 
                    alt={result.title || "応急復旧サポート"} 
                    className="w-full h-full object-contain bg-white p-1"
                    style={{ minHeight: '96px', minWidth: '96px' }} // 最小サイズを設定して白い画像問題を防止
                    loading="eager" // 急いで読み込んで点滅を防止
                    decoding="async" // 非同期デコードで表示を高速化
                    // 画像読み込みエラー時の単純化したフォールバック
                    onError={(e) => {
                      const imgElement = e.currentTarget;
                      const originalSrc = imgElement.src;
                      
                      // SVGとPNG間の拡張子切替でフォールバック
                      if (originalSrc.endsWith('.svg')) {
                        // SVGが読み込めない場合はPNGに変更
                        const pngPath = originalSrc.replace('.svg', '.png');
                        imgElement.src = pngPath;
                      } else if (originalSrc.endsWith('.png')) {
                        // PNGが読み込めない場合はSVGに変更
                        const svgPath = originalSrc.replace('.png', '.svg');
                        imgElement.src = svgPath;
                      }
                    }}
                  />
                  {/* 画像説明テキストは非表示 */}
                </div>
              </div>
            ) : (
              // テキストコンテンツとドキュメント (横長スタイル)
              <div className="flex h-24 w-full bg-transparent border border-blue-200 rounded-lg">
                <div className="relative w-24 h-24 flex-shrink-0 flex items-center justify-center bg-blue-50">
                  {result.type === 'ai-response' ? (
                    <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center">
                      <span className="material-icons text-white">smart_toy</span>
                    </div>
                  ) : result.type === 'text' ? (
                    <MessageCircle className="h-12 w-12 text-blue-600" />
                  ) : (
                    <FileText className="h-12 w-12 text-blue-600" />
                  )}
                </div>
                <div className="flex-1 p-2 flex flex-col justify-center">
                  <h3 className="text-sm font-bold text-blue-700">{result.title || (result.type === 'ai-response' ? "AI応答" : "ドキュメント")}</h3>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

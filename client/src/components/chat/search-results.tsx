import { FileText, MessageCircle } from "lucide-react";
import { useOrientation } from "@/hooks/use-orientation";
import { useIsMobile } from "@/hooks/use-mobile";
import { useEffect } from "react";
import { cancelSearch } from "@/lib/image-search";

// 画像パスを修正するヘルパー関数
function fixImagePath(path: string | undefined): string {
  if (!path) return '';
  
  // すでに knowledge-base パスを持っていれば変更しない
  if (path.includes('/knowledge-base/images/')) {
    return path;
  }
  
  // /uploads/images/ のパスを /knowledge-base/images/ に変換
  // ファイル名だけ保持して新しいパスにする
  if (path.includes('/uploads/images/')) {
    const fileName = path.split('/').pop();
    if (fileName) {
      console.log('画像パス変換:', path, ' -> ', `/knowledge-base/images/${fileName}`);
      return `/knowledge-base/images/${fileName}`;
    }
  }
  
  // /uploads/ から始まるがサブフォルダが不明確な場合
  if (path.startsWith('/uploads/') && !path.includes('/uploads/data/') && !path.includes('/uploads/json/')) {
    const parts = path.split('/');
    const fileName = parts.pop(); // 最後の部分（ファイル名）を取得
    if (fileName) {
      console.log('汎用パス変換:', path, ' -> ', `/knowledge-base/images/${fileName}`);
      return `/knowledge-base/images/${fileName}`;
    }
  }
  
  // 単なるファイル名の場合（パスがない）
  if (!path.includes('/') && (path.endsWith('.svg') || path.endsWith('.png') || path.endsWith('.jpg') || path.endsWith('.jpeg'))) {
    console.log('単純ファイル名からパス生成:', path, ' -> ', `/knowledge-base/images/${path}`);
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
                    // SVG対PNGの相互バックアップ
                    onError={(e) => {
                      const imgElement = e.currentTarget;
                      const originalSrc = imgElement.src;
                      
                      // 現在の画像が読み込めない場合、別のフォーマットを試す
                      if (result.url && result.pngFallbackUrl) {
                        // もし現在PNGを表示していて、SVGが利用可能ならSVGにフォールバック
                        const fixedPngPath = fixImagePath(result.pngFallbackUrl);
                        const fixedSvgPath = fixImagePath(result.url);
                        
                        if (originalSrc.includes('.png')) {
                          console.log('PNG読み込みエラー、SVG代替に切り替え:', originalSrc, '->', fixedSvgPath);
                          imgElement.src = fixedSvgPath;
                        } 
                        // もし現在SVGを表示していて、PNGが利用可能ならPNGにフォールバック
                        else if (originalSrc.includes('.svg')) {
                          console.log('SVG読み込みエラー、PNG代替に切り替え:', originalSrc, '->', fixedPngPath);
                          imgElement.src = fixedPngPath;
                        }
                        // それでもだめなら古いパスを試す
                        else if (fixedPngPath.includes('/knowledge-base/')) {
                          const oldStylePath = fixedPngPath.replace('/knowledge-base/', '/uploads/');
                          console.log('最終フォールバック、古いパスを試行:', originalSrc, '->', oldStylePath);
                          imgElement.src = oldStylePath;
                        }
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

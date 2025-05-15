import Fuse from 'fuse.js';
import { apiRequest } from './queryClient';

// 画像検索用の専用インターフェース定義
interface ImageSearchItem {
  id: string | number;
  file: string;  // PNG形式のパス（SVGは使用しない）
  title: string;
  category: string;
  keywords: string[];
  description: string;
  metadata?: any;
  all_slides?: string[];
  details?: string;
  searchText?: string;   // 検索用の追加テキストフィールド
}

// 画像検索用データ
let imageSearchData: ImageSearchItem[] = [];

// 画像検索専用JSONデータを読み込む
async function loadImageSearchData() {
  try {
    // 最新のJSON ファイルを取得する
    const timestamp = new Date().getTime();
    
    // 最新のmetadataJSONを探す
    const dirResponse = await fetch(`/api/tech-support/list-json-files?t=${timestamp}`);
    let metadataFile = 'mc_1744105287766_metadata.json'; // デフォルトファイル
    
    if (dirResponse.ok) {
      const fileList = await dirResponse.json();
      if (Array.isArray(fileList) && fileList.length > 0) {
        // 最新のメタデータファイルを選択
        metadataFile = fileList[0];
        console.log(`最新のメタデータファイルを使用します: ${metadataFile}`);
      }
    }
    
    // knowledge-baseからJSONファイルを読み込む
    let metadata;
    try {
      const response = await fetch(`/knowledge-base/json/${metadataFile}?t=${timestamp}`);
      if (!response.ok) {
        console.warn(`メタデータファイルが見つかりません: ${metadataFile}`);
        return []; // 空の配列を返す
      }
      metadata = await response.json();
    } catch (error) {
      console.warn("メタデータJSONの読み込みに失敗しました:", error);
      return []; // エラー時は空の配列を返す
    }
    
    // 既存データをクリア
    imageSearchData = [];
    
    if (metadata && metadata.slides && Array.isArray(metadata.slides)) {
      console.log(`メタデータJSONを読み込みました: ${metadata.slides.length}件のスライド`);
      
      // メタデータの検証とデータ品質チェック用カウンター
      let validSlideCount = 0;
      let invalidPathCount = 0;
      let missingTitleCount = 0;
      
      // スライドからImageSearchItem形式に変換（PNGファイルを優先）
      const slidesData = metadata.slides.map((slide: any) => {
        // 検証: スライド番号が存在するか確認
        if (!slide['スライド番号'] && slide['スライド番号'] !== 0) {
          console.warn(`スライド番号が欠落しているスライドがあります`);
          // 欠落している場合は代替IDを生成
          slide['スライド番号'] = `unknown_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        }
        
        // 画像パスを取得し、検証
        let imagePath = "";
        if (slide['画像テキスト'] && Array.isArray(slide['画像テキスト']) && slide['画像テキスト'].length > 0) {
          const imageText = slide['画像テキスト'][0];
          if (imageText && typeof imageText === 'object' && '画像パス' in imageText) {
            imagePath = imageText['画像パス'] || "";
          }
        }
        
        // 画像パスがない場合はログ
        if (!imagePath) {
          invalidPathCount++;
          console.warn(`スライド ${slide['スライド番号']} に有効な画像パスがありません`);
        }
        
        // 画像パスの参照を knowledge-base/images に統一
        if (imagePath) {
          // ファイル名だけを抽出
          const fileName = imagePath.split('/').pop();
          if (fileName) {
            // 知識ベースの画像ディレクトリに統一
            imagePath = `/knowledge-base/images/${fileName}`;
          }
        }
        
        // 画像を常にPNG形式に変換する
        if (imagePath && !imagePath.toLowerCase().endsWith('.png')) {
          // PNGパスに変換
          const basePath = imagePath.substring(0, imagePath.lastIndexOf('.') !== -1 ? 
                                              imagePath.lastIndexOf('.') : imagePath.length);
          imagePath = `${basePath}.png`;
        }
        
        // タイトルの検証
        const slideTitle = slide['タイトル'] || `スライド ${slide['スライド番号']}`;
        if (!slide['タイトル']) {
          missingTitleCount++;
        }
        
        // キーワードを生成（本文とタイトルから）- 検証付き
        const keywords = [];
        
        // タイトルをキーワードに追加
        if (slideTitle && typeof slideTitle === 'string' && slideTitle.trim() !== '') {
          keywords.push(slideTitle.trim());
        }
        
        // 本文をキーワードに追加
        if (slide['本文'] && Array.isArray(slide['本文'])) {
          slide['本文'].forEach((text: any) => {
            if (text && typeof text === 'string' && text.trim() !== '') {
              keywords.push(text.trim());
            }
          });
        }
        
        // 検索を容易にするための追加の検索テキストフィールド
        const searchTextParts = [
          slideTitle,
          ...(slide['本文'] || []),
          "保守用車マニュアル" // カテゴリも検索できるように
        ].filter(Boolean);
        
        validSlideCount++;
        
        return {
          id: `slide_${slide['スライド番号']}`,
          file: imagePath,
          title: slideTitle,
          category: "保守用車マニュアル",
          keywords: keywords,
          description: "", // テキスト表示を削除
          details: "", // テキスト表示を削除
          searchText: searchTextParts.join(' ') // 検索用の追加フィールド
        };
      });
      
      // 品質チェック結果をログ
      console.log(`スライド処理結果: 有効=${validSlideCount}, 無効なパス=${invalidPathCount}, タイトル欠落=${missingTitleCount}`);
      
      // 有効な画像パスを持つスライドのみを追加し、データの整合性を確保
      slidesData
        .filter((item: any) => {
          const hasValidPath = item.file && typeof item.file === 'string' && item.file.length > 0;
          const hasValidTitle = item.title && typeof item.title === 'string';
          const hasValidKeywords = Array.isArray(item.keywords) && item.keywords.length > 0;
          
          return hasValidPath && hasValidTitle && hasValidKeywords;
        })
        .forEach((item: any) => imageSearchData.push(item));
      
      // 埋め込み画像もデータに追加 (PNGを優先) - 強化版
      if (metadata.embeddedImages && Array.isArray(metadata.embeddedImages)) {
        console.log(`${metadata.embeddedImages.length}件の埋め込み画像を処理します`);
        
        // 画像処理の統計を追跡
        let validImageCount = 0;
        let invalidPathCount = 0;
        
        // 埋め込み画像の検証とマッピング
        const embeddedImages = metadata.embeddedImages
          // 有効な抽出パスを持つ画像のみフィルタリング
          .filter((img: any) => {
            const isValid = img && typeof img === 'object' && 
                           '抽出パス' in img && 
                           img['抽出パス'] && 
                           typeof img['抽出パス'] === 'string';
            
            if (!isValid) {
              invalidPathCount++;
            }
            
            return isValid;
          })
          .map((img: any, index: number) => {
            let imagePath = img['抽出パス'];
            
            // 画像パスの参照を knowledge-base ディレクトリに統一
            if (imagePath) {
              // ファイル名だけを抽出
              const fileName = imagePath.split('/').pop();
              if (fileName) {
                imagePath = `/knowledge-base/images/${fileName}`;
              }
            }
            
            // すべての画像形式をPNGに統一
            if (!imagePath.toLowerCase().endsWith('.png')) {
              const basePath = imagePath.substring(0, 
                imagePath.lastIndexOf('.') !== -1 ? 
                imagePath.lastIndexOf('.') : imagePath.length);
              const pngPath = `${basePath}.png`;
              imagePath = pngPath;
            }
            
            // メタデータから追加情報を抽出（あれば）
            let title = `部品画像 ${index+1}`;
            let category = "部品写真";
            let additionalKeywords: string[] = [];
            
            // 元のファイル名から情報を抽出
            if (img['元のファイル名'] && typeof img['元のファイル名'] === 'string') {
              const originalName = img['元のファイル名'];
              
              // ファイル名からより具体的なタイトルを生成
              if (originalName.includes('エンジン') || originalName.includes('engine')) {
                title = `エンジン部品 ${index+1}`;
                category = "エンジン部品";
                additionalKeywords.push("エンジン", "動力系", "駆動部");
              } else if (originalName.includes('冷却') || originalName.includes('ラジエーター')) {
                title = `冷却系統 ${index+1}`;
                category = "冷却系統";
                additionalKeywords.push("冷却", "ラジエーター", "水冷");
              } else if (originalName.includes('ブレーキ') || originalName.includes('brake')) {
                title = `ブレーキ部品 ${index+1}`;
                category = "ブレーキ系統";
                additionalKeywords.push("ブレーキ", "制動装置");
              } else if (originalName.includes('ホイール') || originalName.includes('wheel')) {
                title = `車輪部品 ${index+1}`;
                category = "足回り";
                additionalKeywords.push("ホイール", "車輪", "タイヤ");
              }
            }
            
            // 基本キーワードと追加キーワードを結合
            const keywords = ["保守用車", "部品", "写真", ...additionalKeywords];
            
            // 検索用の統合テキスト
            const searchText = [title, category, ...keywords].join(' ');
            
            validImageCount++;
            
            return {
              id: `img_${index+1}`,
              file: imagePath,
              title: title,
              category: category,
              keywords: keywords,
              description: "", // テキスト表示を削除
              details: "", // テキスト表示を削除
              searchText: searchText // 検索用の統合テキスト
            };
          });
        
        console.log(`埋め込み画像処理結果: 有効=${validImageCount}, 無効パス=${invalidPathCount}`);
          
        // 有効な画像のみを追加（PNG形式に統一）
        embeddedImages
          .filter((item: any) => {
            // 有効なパスであることを確認
            const hasValidPath = item.file && 
                                typeof item.file === 'string' && 
                                item.file.length > 0 &&
                                item.file.toLowerCase().endsWith('.png');
            
            // 有効なタイトルがあることを確認
            const hasValidTitle = item.title && typeof item.title === 'string';
            
            // 有効なキーワードがあることを確認
            const hasValidKeywords = Array.isArray(item.keywords) && item.keywords.length > 0;
            
            return hasValidPath && hasValidTitle && hasValidKeywords;
          })
          .forEach((item: any) => imageSearchData.push(item));
      }
      
      console.log(`検索用データを準備完了: ${imageSearchData.length}件`);
    } else {
      throw new Error('メタデータのフォーマットが無効です');
    }
  } catch (error) {
    console.error("画像検索データの読み込みに失敗しました:", error);
    
    // エラーを報告し、サーバーに画像検索データの再生成をリクエスト
    try {
      const initResponse = await fetch('/api/tech-support/init-image-search-data', {
        method: 'POST'
      });
      
      if (initResponse.ok) {
        const initData = await initResponse.json();
        console.log("画像検索データを初期化しました:", initData);
        
        // knowledge-baseから再度データを読み込み
        try {
          // knowledge-base/dataディレクトリから読み込む（一元化）
          const kbReloadResponse = await fetch(`/knowledge-base/data/image_search_data.json?t=${Date.now()}`);
          if (kbReloadResponse.ok) {
            const reloadedData = await kbReloadResponse.json();
            if (Array.isArray(reloadedData)) {
              console.log(`再読み込みした画像検索データ: ${reloadedData.length}件`);
              imageSearchData = reloadedData;
              return;
            }
          } else {
            throw new Error('knowledge-baseのデータ読み込みに失敗しました');
          }
        } catch (error) {
          console.warn(`knowledge-base/dataからの読み込みに失敗しました:`, error);
          console.error(`画像検索データ読み込みに失敗しました:`, error);
        }
      }
    } catch (initError) {
      console.error("画像検索データの初期化に失敗:", initError);
    }
    
    // 直接knowledge-baseからJSONファイルを読み込む（エラーハンドリング用）
    console.log("knowledge-baseからJSONの読み込みを試みます");
    try {
      // knowledge-baseパスのみ使用（一元化）
      const knowledgeBasePath = '/knowledge-base/data/image_search_data.json';
      
      let directData = null;
      
      try {
        const directFetch = await fetch(`${knowledgeBasePath}?t=${Date.now()}`, { 
          cache: 'no-store',  // キャッシュを無視
          headers: { 'pragma': 'no-cache', 'cache-control': 'no-cache' }
        });
        
        if (directFetch.ok) {
          const fetchedData = await directFetch.json();
          if (Array.isArray(fetchedData) && fetchedData.length > 0) {
            console.log(`知識ベースから画像検索データを読み込みました: ${fetchedData.length}件`);
            directData = fetchedData;
          }
        }
      } catch (pathError) {
        console.warn(`知識ベースからの読み込みに失敗:`, pathError);
      }
      
      // いずれかのパスから読み込めたら使用
      if (directData) {
        imageSearchData = directData;
        return;
      } else {
        // 初期化APIを直接実行して再読み込みを試みる
        try {
          const reinitResp = await fetch('/api/tech-support/init-image-search-data', { 
            method: 'POST',
            cache: 'no-store'
          });
          
          if (reinitResp.ok) {
            const initData = await reinitResp.json();
            console.log('画像検索データを初期化しました:', initData);
            
            // 少し待機して再試行
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // 初期化後は知識ベースから試行
            const retryPaths = [
              '/knowledge-base/data/image_search_data.json'
            ];
            
            let retryData = null;
            for (const retryPath of retryPaths) {
              try {
                const retryFetch = await fetch(`${retryPath}?t=${Date.now()}`, {
                  cache: 'no-store'
                });
                
                if (retryFetch.ok) {
                  const data = await retryFetch.json();
                  if (Array.isArray(data) && data.length > 0) {
                    console.log(`初期化後、パス ${retryPath} からの再読み込みに成功: ${data.length}件`);
                    retryData = data;
                    break;
                  }
                }
              } catch (retryErr) {
                console.warn(`初期化後の再読み込み失敗 (${retryPath}):`, retryErr);
              }
            }
            
            if (retryData) {
              console.log(`初期化後、${retryData.length}件のデータを読み込みました`);
              imageSearchData = retryData;
              return;
            }
          }
        } catch (reinitErr) {
          console.error('再初期化に失敗:', reinitErr);
        }
        
        throw new Error("どのパスからもデータを読み込めませんでした");
      }
    } catch (directError) {
      console.error("直接JSONからの読み込みに失敗:", directError);
    }
    
    // サンプルデータは使用せず、空の配列を返す（ユーザー要求により）
    console.log("サンプル画像データを表示しないように設定しました");
    imageSearchData = [];
  }
}

// アプリケーション起動時にデータをロード
loadImageSearchData();

// データを強制的に再読み込む関数を提供
export const reloadImageSearchData = () => {
  console.log('画像検索データを強制的に再読み込みします');
  loadImageSearchData();
};

// 画像検索データが更新されたときにリロードするイベントリスナー
window.addEventListener('image-search-data-updated', () => {
  console.log('画像検索データの更新を検知しました。再読み込みします。');
  loadImageSearchData();
});

// Fuse.js 画像検索用の設定
const fuseOptions = {
  includeScore: true,
  keys: [
    { name: 'title', weight: 0.5 },
    { name: 'category', weight: 0.3 },
    { name: 'description', weight: 0.4 },
    { name: 'keywords', weight: 1.0 }, // キーワードの重みをさらに強化
    { name: 'metadata.documentId', weight: 0.8 }, // ドキュメントIDによる検索を強化
    { name: 'details', weight: 0.6 },
    { name: 'searchText', weight: 1.0 }, // 検索用テキストフィールドを最高の重みで追加
  ],
  threshold: 0.4, // 閾値を高めに設定して、より幅広い一致を許容
  ignoreLocation: true, // 単語の位置を無視して検索
  useExtendedSearch: true, // 拡張検索モード
  minMatchCharLength: 1, // 部分一致の条件を緩和 (1文字一致から検索対象に)
  distance: 1000, // 単語間の距離制限をさらに緩める
  findAllMatches: true, // すべての一致を見つける
  isCaseSensitive: false, // 大文字小文字を区別しない
  shouldSort: true, // 結果をスコア順にソート
  tokenize: true, // 検索文字列をトークン化して部分一致を強化
  matchAllTokens: false, // すべてのトークンが一致する必要はない
};

// 画像検索用のFuseインスタンスを作成するヘルパー関数
function getFuseInstance() {
  return new Fuse(imageSearchData, fuseOptions);
}

// 最後の検索テキスト（連続検索における重複防止用）
let lastSearchText = '';
// 最後の検索結果（連続検索における点滅防止用）
let lastSearchResults: any[] = [];
// 検索中フラグ（同時に複数の検索が走らないようにするため）
let isSearching = false;

/**
 * 検索処理を強制的にキャンセルする関数
 * 検索結果が表示された後に呼び出して点滅を防止する
 */
export const cancelSearch = (): void => {
  isSearching = false;
  console.log('画像検索処理がキャンセルされました');
};

/**
 * テキストクエリに基づいて画像データを検索
 * @param text 検索クエリテキスト
 * @param autoStopAfterResults 結果が見つかったら検索を自動停止するかどうか
 * @returns 検索結果の配列
 */
export const searchByText = async (text: string, autoStopAfterResults: boolean = true): Promise<any[]> => {
  try {
    console.log('画像検索開始:', text);
    
    // 最初にデータが存在することを確認
    if (imageSearchData.length === 0) {
      console.log('画像検索データが読み込まれていないため再ロード');
      await loadImageSearchData();
    }
    
    // クエリの最適化を試みる
    try {
      const response = await apiRequest('POST', '/api/optimize-search-query', { text });
      
      // レスポンスの検証を追加
      if (!response.ok) {
        console.warn(`検索クエリ最適化APIが失敗しました: ${response.status}`);
        return getFuseInstance().search(text); // 元のテキストで検索を続行
      }
      
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.warn(`無効なContent-Type: ${contentType}`);
        return getFuseInstance().search(text); // 元のテキストで検索を続行
      }
      
      const data = await response.json();
      if (!data || typeof data.optimizedQuery !== 'string') {
        console.warn('無効なレスポンス形式');
        return getFuseInstance().search(text); // 元のテキストで検索を続行
      }
      
      const optimizedQuery = data.optimizedQuery || text;
      console.log('検索クエリを最適化:', text, '->', optimizedQuery);
      text = optimizedQuery;
    } catch (error) {
      console.error('検索クエリ最適化エラー:', error);
      // 最適化に失敗した場合は元のテキストを使用
    }
    
    // Fuseインスタンスを取得して検索を実行
    const fuse = getFuseInstance();
    
    // キーワードを分割して検索
    const keywords = text.split(/\s+/).filter(k => k.length > 0);
    let searchResults: any[] = [];
    
    if (keywords.length > 1) {
      console.log(`複数キーワード検索: ${keywords.join(', ')}`);
      // 複数のキーワードがある場合、各キーワードで検索
      for (const keyword of keywords) {
        const results = fuse.search(keyword);
        searchResults.push(...results);
      }
      
      // 重複を除去（IDをキーとして使用）
      const uniqueResults = new Map<string | number, any>();
      searchResults.forEach(result => {
        const existingResult = uniqueResults.get(result.item.id);
        if (!existingResult || (existingResult.score && result.score && result.score < existingResult.score)) {
          uniqueResults.set(result.item.id, result);
        }
      });
      
      searchResults = Array.from(uniqueResults.values());
    } else if (keywords.length === 1) {
      console.log(`単一キーワード検索: ${keywords[0]}`);
      searchResults = fuse.search(keywords[0]);
    } else {
      console.log(`検索キーワードが抽出できなかったため検索をスキップします`);
      searchResults = [];
    }
    
    console.log(`検索結果: ${searchResults.length}件見つかりました`);
    return searchResults;
  } catch (error) {
    console.error('画像検索エラー:', error);
    throw new Error('画像検索に失敗しました');
  }
};
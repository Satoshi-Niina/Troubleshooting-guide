# 応急処置フロー JSON フォーマット仕様

このディレクトリには、応急処置フローを定義するJSONファイルが含まれています。以下の形式に従ってJSONファイルを作成することで、新しい応急処置フローを追加できます。

## 基本構造

```json
{
  "id": "unique_id",
  "title": "応急処置フローのタイトル",
  "description": "応急処置フローの説明文",
  "triggerKeywords": ["キーワード1", "キーワード2", "キーワード3"],
  "steps": [
    {
      "id": "step1",
      "title": "ステップ1のタイトル",
      "message": "ステップ1の詳細説明",
      "imageUrl": "/knowledge-base/images/image1.svg",
      "options": [
        {
          "text": "選択肢1",
          "nextStep": "step2"
        },
        {
          "text": "選択肢2",
          "nextStep": "step3"
        }
      ]
    },
    {
      "id": "step2",
      "title": "ステップ2のタイトル",
      "message": "ステップ2の詳細説明",
      "imageUrl": "/knowledge-base/images/image2.svg",
      "options": [
        {
          "text": "選択肢1",
          "nextStep": "step4"
        },
        {
          "text": "戻る",
          "nextStep": "step1"
        }
      ]
    }
    // 以下、必要なステップを追加
  ]
}
```

## 各フィールドの説明

### トップレベルフィールド

| フィールド名 | 型 | 必須 | 説明 |
|------------|------|-------|------|
| id | 文字列 | 必須 | 一意の識別子 |
| title | 文字列 | 必須 | 応急処置フローのタイトル |
| description | 文字列 | 必須 | 応急処置フローの説明 |
| triggerKeywords | 文字列配列 | 必須 | チャットで反応するキーワード |
| steps | 配列 | 必須 | 処置ステップの配列 |

### ステップフィールド

| フィールド名 | 型 | 必須 | 説明 |
|------------|------|-------|------|
| id | 文字列 | 必須 | ステップの一意の識別子 |
| title | 文字列 | 必須 | ステップのタイトル |
| message | 文字列 | 必須 | ステップの詳細説明 |
| imageUrl | 文字列 | 任意 | 関連する画像のパス (SVG形式) |
| options | 配列 | 必須 | ユーザーの選択肢 |

### 選択肢フィールド

| フィールド名 | 型 | 必須 | 説明 |
|------------|------|-------|------|
| text | 文字列 | 必須 | 選択肢のテキスト |
| nextStep | 文字列 | 必須 | 次に表示するステップのID |

## 画像パスについて

画像パスは必ず `/knowledge-base/images/` ディレクトリ内の SVG ファイルを参照してください。
PNG や JPG などの他の形式は使用しないでください。

例：
```json
"imageUrl": "/knowledge-base/images/engine_trouble.svg"
```

## 特別なステップID

以下の特別なステップIDを使用できます：

- `end`: フローを終了します
- `restart`: フローを最初から再開します

## 例

`engine_trouble.json` ファイルを参考にしてください。
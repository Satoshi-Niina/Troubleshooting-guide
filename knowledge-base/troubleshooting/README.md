# トラブルシューティングJSON形式

このディレクトリには、応急処置ガイドで使用する各種トラブルシューティングフローのJSONファイルが保存されています。

## ファイル形式

各JSONファイルは以下の構造に従ってください：

```json
{
  "id": "一意のID",
  "title": "タイトル",
  "description": "説明文",
  "triggerKeywords": ["キーワード1", "キーワード2"],
  "steps": [
    {
      "id": "ステップID",
      "title": "ステップタイトル",
      "message": "表示メッセージ",
      "options": [
        {
          "text": "選択肢のテキスト",
          "nextStep": "次のステップID"
        }
      ],
      "nextStep": "通常の次ステップID",
      "imageUrl": "/knowledge-base/images/画像パス.svg",
      "checklist": ["チェック項目1", "チェック項目2"],
      "end": false
    }
  ]
}
```

## 必須フィールド

### トップレベル

- `id`: 一意の識別子（ファイル名の基準になります）
- `title`: トラブルシューティングのタイトル
- `description`: 簡単な説明
- `steps`: ステップの配列

### ステップ

- `id`: ステップの一意の識別子
- `message`: ユーザーに表示するメッセージ

## オプションフィールド

### トップレベル

- `triggerKeywords`: 検索でヒットさせるためのキーワード配列

### ステップ

- `title`: ステップのタイトル（省略可）
- `options`: 選択肢の配列（ユーザーに選択してもらう場合）
- `nextStep`: 次のステップID（選択肢がない場合に自動的に進む）
- `imageUrl`: 関連画像のパス
- `checklist`: チェックリスト項目の配列
- `end`: `true`の場合、このステップでフローが終了

## 選択肢

選択肢（`options`）は以下のプロパティを持ちます：

- `text` または `label`: 表示テキスト
- `nextStep`: 選択時に遷移する次のステップID

## 画像パス

画像パスは常に `/knowledge-base/images/` から始まるパスを使用してください。SVG形式を推奨します。

```
/knowledge-base/images/画像ファイル名.svg
```

## 例

```json
{
  "id": "engine_trouble",
  "title": "エンジントラブルシューティング",
  "description": "エンジン関連の問題に対するトラブルシューティングガイド",
  "triggerKeywords": ["エンジン", "始動", "停止", "出力低下"],
  "steps": [
    {
      "id": "start",
      "title": "始動確認",
      "message": "エンジンが始動しない症状ですか？",
      "options": [
        { "text": "はい、まったく始動しない", "nextStep": "check_battery" },
        { "text": "始動するが不安定", "nextStep": "check_fuel" },
        { "text": "始動後すぐに停止する", "nextStep": "check_fuel" }
      ],
      "imageUrl": "/knowledge-base/images/engine_001.svg"
    },
    {
      "id": "end",
      "title": "終了",
      "message": "トラブルシューティングが完了しました。問題が解決しない場合は技術サポートにお問い合わせください。",
      "end": true,
      "imageUrl": "/knowledge-base/images/engine_001.svg"
    }
  ]
}
```
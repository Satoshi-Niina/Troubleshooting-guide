#!/bin/bash

# 知識ベースのドキュメント一覧を取得するテスト
echo "=== ドキュメント一覧取得テスト ==="
curl -s http://localhost:5000/api/data-processor/documents

# 特定のドキュメントIDを設定（実際のIDに置き換えてください）
# 一覧から最初のドキュメントIDを取得（jqなしのバージョン）
DOC_ID=$(curl -s http://localhost:5000/api/data-processor/documents | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "ターゲットドキュメントID: $DOC_ID"

if [ -n "$DOC_ID" ]; then
  # バックアップを作成するテスト
  echo -e "\n=== バックアップ作成テスト ==="
  BACKUP_RESULT=$(curl -s -X POST -H "Content-Type: application/json" -d "{\"docIds\":[\"$DOC_ID\"]}" http://localhost:5000/api/data-processor/backup)
  echo $BACKUP_RESULT
  
  # バックアップパスを取得（簡易版、jqなし）
  BACKUP_PATH=$(echo $BACKUP_RESULT | grep -o '"backupPath":"[^"]*"' | cut -d'"' -f4)
  echo "バックアップパス: $BACKUP_PATH"
  
  # 差分更新のテスト用ファイルを準備（attached_assetsからコピー）
  echo -e "\n=== 差分更新テスト準備 ==="
  cp ./attached_assets/railway_maintenance_knowledge.txt ./test-update.txt
  echo "テキストファイルを準備しました: test-update.txt"
  
  # 差分更新のテスト
  echo -e "\n=== 差分更新テスト ==="
  curl -s -X POST \
    -F "file=@./test-update.txt" \
    -F "targetDocId=$DOC_ID" \
    http://localhost:5000/api/data-processor/merge
    
  # テストファイルを削除
  rm ./test-update.txt
  echo "テストファイルを削除しました"
else
  echo "ドキュメントが見つかりません。先にドキュメントをアップロードしてください。"
fi

echo -e "\nテスト完了"
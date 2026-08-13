# 求人市場ナビ / GitHub Pages MVP

求人ボックス「給料ナビ」から取得した職種別市場データを、本人職種＋周辺職種で検索・比較する静的Webアプリです。

## ファイル構成

```text
/
├─ index.html
├─ styles.css
├─ config.js
├─ app.js
├─ data/
│  ├─ classification.json
│  ├─ tags.json
│  └─ relations.json
└─ tools/
   └─ build_fixed_json.py
```

## データ構成

### 更新データ（Google SheetsのWeb公開CSV）

`config.js` に4本のURLを設定済みです。

- `WEB公開_職種マスタ`
- `WEB公開_都道府県別給与`
- `WEB公開_月別求人数`
- `WEB公開_条件別給与`

Google Sheets側の元データが更新され、WEB公開シートへ反映されると、Webアプリは次回読み込み時に公開CSVを取得します。

### 固定マスタ（リポジトリ内JSON）

- `data/classification.json`：職種分類マスタ 536職種
- `data/tags.json`：職種タグマスタ 2,144行
- `data/relations.json`：職種関連マスタ 139関係

## 画面の流れ

1. フリーワード、または大分類→中分類から職種候補を探す
2. 候補をクリックして「本人職種」を決める
3. 周辺職種の広げ方を選択
   - 1｜厳密：本人＋同義・略称等の強い明示関係
   - 2｜標準：レベル1＋近縁関係＋同じ中分類
   - 3｜広め：レベル2＋関連領域＋同じ大分類
4. 4つの市場データを確認
   - 全国市場
   - 都道府県別給与
   - 月別求人数
   - 条件別給与

## GitHub Pagesへの配置

このフォルダの中身をリポジトリのルートへアップロードしてください。

GitHub側では Pages の公開元を対象ブランチの `/ (root)` に設定します。ビルド処理は不要です。

`index.html` を直接 `file://` で開くとブラウザのFetch制限でJSONを読めないことがあります。動作確認はGitHub Pages、またはローカルHTTPサーバー経由で行ってください。

例:

```bash
python -m http.server 8000
```

## 固定マスタを更新するとき

Google Sheetsの分類・タグ・関連マスタを変更した場合だけJSONを更新します。

スプレッドシートを `.xlsx` でダウンロードし、以下を実行します。

```bash
python tools/build_fixed_json.py "職種別市場データ.xlsx" data
```

出力される3ファイルをそのままコミットしてください。

## 設定変更

公開CSV URLを変更する場合は `config.js` だけを修正します。

## 注意

- 月別求人数CSVはGoogle Sheets側の公開シートで「K（千件）」から実件数へ変換済みです。
- 正社員給与は万円/年、パート・派遣は円/時です。
- 欠損値は画面上 `—` として扱います。
- 周辺職種の判定は `classification.json` と `relations.json` を基準にブラウザ内で行います。

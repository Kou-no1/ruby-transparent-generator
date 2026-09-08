# 透過ルビジェネレーター

小学生向け理科新聞「科学の芽」などで使う、**ルビ付き文章 → 透過PNG** 変換ツールです。

Astra等で作った次の形式のJSONをブラウザに貼り付けると、ルビをHTMLの `<ruby><rt>` で正確に表示し、各文章ブロックを高解像度PNGとして保存できます。

```json
{
  "blocks": [
    {
      "id": "p1_lead",
      "page": 1,
      "section": "導入",
      "type": "lead",
      "title": "はじめに",
      "style": "lead_box",
      "content": [
        {"text": "科学", "ruby": "かがく"},
        {"text": "の", "ruby": null},
        {"text": "芽", "ruby": "め"}
      ]
    }
  ]
}
```

## 主な機能

- JSONを直接貼り付け
- `.json` ファイル読み込み
- HTML rubyによるルビ表示
- 透過PNG保存
- カード背景付きPNG保存
- 2× / 3× / 4× 解像度
- 本文サイズ・行間・文字色調整
- タイトルの有無を選択
- localStorage自動保存
- サーバー不要・完全静的

## GitHub Pagesで公開

このリポジトリのルートにファイルを置いた状態で、GitHubの

`Settings → Pages → Build and deployment → Deploy from a branch`

を選び、`main / (root)` を指定してください。

公開URLは通常、

`https://<GitHubユーザー名>.github.io/<リポジトリ名>/`

になります。

## 構成

```text
/
├─ index.html
├─ 404.html
├─ .nojekyll
├─ README.md
├─ assets/
│  ├─ styles.css
│  └─ app.js
└─ examples/
   └─ sample.json
```

## プライバシー

入力したJSONや文章は外部サーバーへ送信しません。処理はブラウザ内で完結します。

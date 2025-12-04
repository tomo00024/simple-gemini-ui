# プロジェクトセットアップ (setup.md)

このドキュメントは、SvelteKitを使用した静的チャットアプリ（サーバーレス、ローカルストレージ完結）の構築手順をまとめたものです。

## 1. プロジェクトの初期化 (Svelte CLI)

以下の設定でプロジェクトを作成しました。

- **Template**: SvelteKit minimal
- **Type Checking**: TypeScript
- **Add-ons**:
  - Prettier
  - ESLint
  - TailwindCSS
- **Tailwind Plugins**:
  - typography (Markdownの整形用)
  - forms (入力フォームの整形用)
- **Package Manager**: npm

```bash
npx sv create --template minimal --types ts --add eslint tailwindcss="plugins:typography,forms" prettier --install npm ./
```

## 2. 追加ライブラリのインストール

### 開発用依存関係 (Adapter, Type definitions)
npm install -D @sveltejs/adapter-static @types/uuid @types/marked

### 実行用依存関係 (Utils)
npm install uuid marked

### UIライブラリ (Shadcn)
npx shadcn-svelte@latest init
npx shadcn-svelte@latest add dialog label select
npx shadcn-svelte@latest add sheet
npx shadcn-svelte@latest add button input scroll-area separator
npx shadcn-svelte@latest add tabs  
npx shadcn-svelte@latest add switch
npx shadcn-svelte@latest add slider
npx shadcn-svelte@latest add tabs
npx shadcn-svelte@latest add alert-dialog
npx shadcn-svelte@latest add accordion
 
### アイコンyライブラリ (Lucide)
npm install -D lucide-svelte@latest

### モードウォッチャー
npm install mode-watcher

### Google GenAI
npm install @google/genai

### データベース
npm install dexie uuid

### Markdown
npm install marked dompurify highlight.js
npm install -D @types/marked @types/dompurify
npm install marked-highlight

### GitHub Pages用
.nojekyll 
.github/README.md
.github/workflows/deploy.yml
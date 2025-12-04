<!-- src/lib/components/app/MarkdownRenderer.svelte -->
<script lang="ts">
  import { marked } from 'marked';
  import DOMPurify from 'isomorphic-dompurify';

  let { content } = $props<{ content: string }>();

  // GFM (GitHub Flavored Markdown) を無効化して標準マークダウンのみにする
  // breaks: true で改行を <br> に変換する（チャットツールの一般的な挙動）
  const rawHtml = marked.parse(content, { 
    async: false,
    gfm: false,
    breaks: true 
  });

  // マークダウンをHTMLに変換し、DOMPurifyでサニタイズする派生ステート
  let safeHtml = $derived.by(() => {
    // 1. マークダウン -> HTML変換 (Promiseではなく同期的に文字列を返すparseを使用)
    const rawHtml = marked.parse(content, { async: false }) as string;
    
    // 2. XSS対策 (scriptタグや危険な属性を除去)
    return DOMPurify.sanitize(rawHtml);
  });

  // リンククリック時の挙動を制御する関数
  function handleClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    // クリックされた要素、またはその親要素がaタグかどうかを確認
    const anchor = target.closest('a');
    
    if (anchor) {
      // リンクの場合は遷移を無効化
      event.preventDefault();
      // 必要であればここに「リンクをコピーしました」などの処理を追加可能
    }
  }
</script>

<div 
  class="prose prose-sm max-w-none wrap-break-word dark:prose-invert custom-prose"
  onclick={handleClick}
  role="presentation" 
>
  {@html safeHtml}
</div>

<style>
  /* 
    :global を使って埋め込まれたHTML要素に直接スタイルを適用します。
    !important を付けることで prose のデフォルトスタイルを確実に無効化します。
  */

  /* 一番上の要素の上余白を完全削除 */
  :global(.custom-prose > *:first-child) {
    margin-top: 0 !important;
  }

  /* 一番下の要素の下余白を完全削除 */
  :global(.custom-prose > *:last-child) {
    margin-bottom: 0 !important;
  }

  /* 段落(p)タグの上下余白を最小限にする */
  :global(.custom-prose p) {
    margin-top: 0.25em !important;
    margin-bottom: 0.25em !important;
    line-height: 1.5 !important;
  }

  /* リストなどの余白も詰める */
  :global(.custom-prose ul), 
  :global(.custom-prose ol), 
  :global(.custom-prose li) {
    margin-top: 0.25em !important;
    margin-bottom: 0.25em !important;
  }
  
  /* 引用などの余白も詰める */
  :global(.custom-prose blockquote) {
    margin-top: 0.5em !important;
    margin-bottom: 0.5em !important;
  }
</style>
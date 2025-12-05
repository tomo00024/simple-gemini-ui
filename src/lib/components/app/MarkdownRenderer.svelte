<!-- src/lib/components/app/MarkdownRenderer.svelte -->
<script lang="ts">
  import { marked } from 'marked';
  import DOMPurify from 'isomorphic-dompurify';
  import type { Action } from 'svelte/action';
   import { Image } from 'lucide-svelte';
  import { mount } from 'svelte';

  let { content } = $props<{ content: string }>();

  // マークダウン変換ロジック（元のコードと同じ）
  let safeHtml = $derived.by(() => {
    const escapedContent = content.replace(/^(\s*)(\d+)\./gm, '$1$2\\.');
    const rawHtml = marked.parse(escapedContent, { 
      async: false,
      gfm: false,
      breaks: true
    }) as string;
    return DOMPurify.sanitize(rawHtml);
  });

  function handleClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const anchor = target.closest('a');
    if (anchor) {
      event.preventDefault();
    }
  }

  // 画像エラーハンドリング用のアクション
 const handleImgError: Action = (node) => {
    const errorHandler = (event: Event) => {
      const target = event.target as HTMLElement;
      
      if (target.tagName === 'IMG') {
        const img = target as HTMLImageElement;
        
        // 1. ラッパーを作成
        const wrapper = document.createElement('span');
        wrapper.style.display = 'inline-flex';
        wrapper.style.alignItems = 'baseline';
        wrapper.style.gap = '0.3em';
        
        // 2. アイコンを表示するコンテナを作成
        const iconContainer = document.createElement('span');
        // 位置調整（ベースライン合わせ）
        iconContainer.style.transform = 'translateY(0.15em)'; 
        
        // 3. Lucideのコンポーネントを手動でマウント
        // Vanilla JSのDOM要素の中にSvelteコンポーネントを描画します
        mount(Image, { 
          target: iconContainer,
          props: { 
            size: '1em',        // 文字サイズに合わせる
            strokeWidth: 2      // 線の太さ
          }
        });

        // 4. テキスト部分を作成
        const textSpan = document.createElement('span');
        textSpan.textContent = img.alt || '画像';

        // 5. 結合してimgタグと置換
        wrapper.appendChild(iconContainer);
        wrapper.appendChild(textSpan);
        
        img.replaceWith(wrapper);
      }
    };
    // キャプチャフェーズ(true)でイベントを捕まえるのが重要
    node.addEventListener('error', errorHandler, true);

    return {
      destroy() {
        node.removeEventListener('error', errorHandler, true);
      }
    };
  };
</script>

<div 
  class="prose prose-sm max-w-none wrap-break-word dark:prose-invert custom-prose"
  onclick={handleClick}
  use:handleImgError
  role="presentation" 
>
  {@html safeHtml}
</div>

<style>
  /* 元のスタイル定義のみ維持 */
  :global(.custom-prose > *:first-child) { margin-top: 0 !important; }
  :global(.custom-prose > *:last-child) { margin-bottom: 0 !important; }
  :global(.custom-prose p) {
    margin-top: 0.25em !important;
    margin-bottom: 0.25em !important;
    line-height: 1.5 !important;
  }
  :global(.custom-prose ul), 
  :global(.custom-prose ol), 
  :global(.custom-prose li) {
    margin-top: 0.25em !important;
    margin-bottom: 0.25em !important;
  }
  :global(.custom-prose blockquote) {
    margin-top: 0.5em !important;
    margin-bottom: 0.5em !important;
  }
</style>
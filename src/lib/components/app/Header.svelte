<script lang="ts">
  import { Input } from "$lib/components/ui/input";
  import { Scale } from "lucide-svelte";
  import ChatHistorySheet from "./ChatHistorySheet.svelte";
  import SettingsSheet from "./SettingsSheet.svelte";
  import type { AppSettings } from "$lib/types";
  
  let { 
    title = $bindable(), 
    settings = $bindable(), 
    currentSessionId, 
    tokenCount = 0,
    isCounting = false,
    onSelectSession, 
    onNewChat,
    // 追加: タイトル確定時のコールバック
    onTitleConfirm 
  } = $props<{ 
    title: string, 
    settings: AppSettings,
    currentSessionId: string,
    tokenCount?: number,
    isCounting?: boolean,
    onSelectSession: (id: string) => void,
    onNewChat: () => void,
    onTitleConfirm?: () => void
  }>();

  // Enterキーでフォーカスを外す（結果的にblurイベントが発火して保存される）
  // あるいは明示的に保存を呼ぶ
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      (e.currentTarget as HTMLInputElement).blur();
    }
  }

  // フォーカスが外れたら保存
  function handleBlur() {
    onTitleConfirm?.();
  }
</script>

<header class="flex h-12 shrink-0 items-center justify-between border-b px-4 bg-background/95 backdrop-blur z-10">
  
  <ChatHistorySheet 
    {currentSessionId} 
    {onSelectSession} 
    {onNewChat} 
  />

  <div class="ml-6 mr-2 flex-1 max-w-sm">
    <Input 
      bind:value={title} 
      onkeydown={handleKeyDown}
      onblur={handleBlur}
      class="h-9 text-center text-lg font-semibold border-none shadow-none focus-visible:ring-0 bg-transparent px-0 placeholder:text-muted-foreground/50"
      placeholder="チャットタイトル"
    />
  </div>

  <div class="flex items-center gap-1">
   {#if settings.ui.showTokenCount}
       <div
  class="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground mr-1 transition-opacity duration-300"
  class:opacity-50={isCounting}
  title="現在のコンテキスト（履歴＋入力）の概算トークン数"
>
  <Scale class="w-3.5 h-3.5 shrink-0 relative top-[-2px] sm:top-0" />
  <span class="tabular-nums font-medium">
    {tokenCount.toLocaleString()}
  </span>
  {#if isCounting}
    <span class="animate-pulse">...</span>
  {/if}
</div>

    {/if}

    <SettingsSheet bind:settings />
  </div>

</header>
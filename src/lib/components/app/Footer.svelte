<!-- src/lib/components/app/Footer.svelte -->
<script lang="ts">
  import { LayoutGrid, Paperclip, ArrowUp, X, Square } from "lucide-svelte"; // Xアイコン追加
  import { Button } from "$lib/components/ui/button";
  import { Textarea } from "$lib/components/ui/textarea";
  import QuickSettingsDrawer from "./QuickSettingsDrawer.svelte";

  // propsの型定義を拡張する必要があるが、親からのbindを受け取るだけなら変更不要な場合も。
  // ここでは親(page.svelte)が chat.inputMessage と chat.isLoading を渡してくる。
  // 追加で chat オブジェクトそのものか、addFiles/removeAttachment/attachments を受け取る必要がある。
  // 設計上、Footerはdumbコンポーネント寄りにしてイベントをdispatchするか、
  // あるいはバインドされた値を受け取るか。
  // 既存コードでは bind:value={chat.inputMessage} としている。
  
  // 要件変更: Footerコンポーネント内でファイル操作を行うため、
  // 必要なpropsを追加します。
  
  let { 
    value = $bindable(""), 
    isLoading = false,
    attachments = [], // 追加: 表示用配列
    onSend,
    onStop,
    onAddFiles,      // 追加: ファイル追加コールバック
    onRemoveFile     // 追加: ファイル削除コールバック
  } = $props<{ 
    value: string, 
    isLoading?: boolean,
    attachments?: { id: string, name: string }[],
    onSend: () => void,
    onStop: () => void,
    onAddFiles?: (files: File[]) => void,
    onRemoveFile?: (id: string) => void
  }>();

  let fileInput: HTMLInputElement;
 let isQuickSettingsOpen = $state(false);
  function handleKeydown(e: KeyboardEvent) {
    const isMobile = window.innerWidth < 768; 
    if (isMobile) return;

    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault(); 
      onSend();           
    }
  }

  function handleFileSelect(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0 && onAddFiles) {
        onAddFiles(Array.from(target.files));
    }
    // リセットして同じファイルを再度選べるようにする
    target.value = '';
  }

  function triggerFileSelect() {
      fileInput?.click();
  }
   // アイコン切り替えとアクション分岐
  function handleMainButtonClick() {
    if (isLoading) {
      onStop?.();
    } else {
      onSend();
    }
  }
</script>
<QuickSettingsDrawer bind:open={isQuickSettingsOpen} />
<footer class="shrink-0 border-t bg-background/95 backdrop-blur px-2">
  <!-- 添付ファイルリスト表示エリア -->
  {#if attachments && attachments.length > 0}
    <div class="px-4 py-2 flex flex-wrap gap-2 border-b border-border/50">
      {#each attachments as file (file.id)}
        <div class="flex items-center gap-1 bg-secondary text-secondary-foreground px-3 py-1 rounded-full text-xs animate-in fade-in slide-in-from-bottom-1">
          <span class="truncate max-w-[150px]">{file.name}</span>
          {#if onRemoveFile}
            <button onclick={() => onRemoveFile(file.id)} class="ml-1 hover:text-destructive focus:outline-none">
              <X class="h-3 w-3" />
            </button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <div class="px-2 py-1.5 pb-[max(0.35rem,env(safe-area-inset-bottom))]">
    <div class="mx-auto flex max-w-3xl items-end gap-2">
       <Button 
        variant="ghost" 
        size="icon" 
        class="text-muted-foreground -translate-y-0.5 translate-x-0.5"
        onclick={() => isQuickSettingsOpen = true}
      >
        <LayoutGrid class="h-5 w-5" />
      </Button>
      
      <!-- ファイル選択ボタン -->
      <input 
        type="file" 
        multiple 
        class="hidden" 
        bind:this={fileInput} 
        onchange={handleFileSelect} 
      />
       <div class="ml-1 mr-1.5 relative flex-1 min-w-0">
        <!-- ファイル選択ボタン (絶対配置で内部へ移動) -->
        <Button 
          variant="ghost" 
          size="icon" 
          class="absolute left-1 bottom-1 h-8 w-8 text-muted-foreground z-10 hover:bg-transparent" 
          onclick={triggerFileSelect}
          disabled={isLoading}
        >
          <Paperclip class="h-4.5 w-4.5" />
        </Button>

        <!-- テキストエリア -->
        <!-- pl-10 を追加して左側にアイコン分の余白を確保 -->
        <Textarea 
          bind:value={value} 
          class="flex-1 text-base py-2 pl-10 min-h-[40px] max-h-[160px] rounded-xl border-0 bg-secondary/50 shadow-none focus-visible:ring-0 resize-none" 
          placeholder="メッセージを入力..." 
          onkeydown={handleKeydown}
        />
      </div>

       <Button 
        size="icon" 
        variant="outline" 
        class="rounded-full transition-all duration-200 -translate-x-1 -translate-y-0.5" 
        onclick={handleMainButtonClick} 
        disabled={!isLoading && (!value.trim() && attachments?.length === 0)}
      >
        {#if isLoading}
          <Square class="h-5 w-5 fill-current text-foreground/95" />
        {:else}
          <ArrowUp class="h-5 w-5" />
        {/if}
      </Button>
    </div>
  </div>
</footer>
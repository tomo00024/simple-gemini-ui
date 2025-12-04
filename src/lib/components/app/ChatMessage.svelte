<!-- src/lib/components/app/ChatMessage.svelte -->
<script lang="ts">
  import { slide, fade } from "svelte/transition";
  import { 
    Trash2, Copy, Pencil, RefreshCw, Info, Check, ChevronRight, ChevronLeft, CircuitBoard
  } from "lucide-svelte";
  
  import { Button } from "$lib/components/ui/button";
  import { Textarea } from "$lib/components/ui/textarea";
  import { cn } from "$lib/utils";
  import type { LogWithSessionId } from "$lib/types";
  import { DiceService } from "$lib/services/dice";
  import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "$lib/components/ui/accordion";

  // マークダウンレンダラーのインポート
  import MarkdownRenderer from "./MarkdownRenderer.svelte";
  import { appSettings } from "$lib/settings.svelte";
  import * as Dialog from "$lib/components/ui/dialog";

  let { log, onUpdate, onDelete, onRegenerate, onSwitchBranch, getSiblingInfo } = $props<{ 
    log: LogWithSessionId;
    onUpdate: (id: string, newText: string) => void;
    onDelete: (id: string) => void;
    onRegenerate: (id: string) => void; 
    getSiblingInfo: (id: string) => { current: number, total: number, hasPrev: boolean, hasNext: boolean };
    onSwitchBranch: (id: string, direction: 'prev' | 'next') => void;
  }>();

  let siblingInfo = $derived(getSiblingInfo(log.id));
  let isMenuOpen = $state(false);
  let container = $state<HTMLElement | null>(null);
  let isEditing = $state(false);
  let editText = $state("");
  let isCopied = $state(false);
  
  let isMetadataOpen = $state(false);
  let isDeleteDialogOpen = $state(false);
  let displayText = $derived(DiceService.extractDisplayText(log.text));

  // カスタムフォント設定
  let customFontStyle = $derived(
    appSettings.value.ui.useCustomFontSize
      ? "font-size: var(--chat-font-size); line-height: 1.6;" 
      : undefined
  );

  function toggleMenu() {
    if (isEditing) return;
    isMenuOpen = !isMenuOpen;
  }

  function handleOutsideClick(event: MouseEvent) {
    if (isMenuOpen && container && !container.contains(event.target as Node)) {
      isMenuOpen = false;
    }
  }

  function startEditing() {
    editText = displayText;
    isEditing = true;
    isMenuOpen = false;
  }

  async function handleCopy() {
    const text = displayText;
    let success = false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        success = true;
      } catch (err) {
        console.warn("navigator.clipboard failed", err);
      }
    }
    if (!success) {
      try {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        success = document.execCommand('copy');
        document.body.removeChild(textArea);
      } catch (err) {
        console.error("Copy failed:", err);
      }
    }
    if (success) {
      isCopied = true;
      setTimeout(() => isCopied = false, 2000);
    }
  }

  function cancelEditing() {
    isEditing = false;
    editText = "";
  }

  function saveEditing() {
    const newFullText = DiceService.mergeHiddenAndDisplay(log.text, editText);
    onUpdate(log.id, newFullText);
    isEditing = false;
  }

  function handleBranchSwitch(e: Event, dir: 'prev' | 'next') {
    e.stopPropagation();
    onSwitchBranch(log.id, dir);
  }

  function openMetadata() {
    isMetadataOpen = true;
    isMenuOpen = false;
  }
  // 削除ダイアログを開く処理
  function openDeleteDialog() {
    isDeleteDialogOpen = true;
    isMenuOpen = false; // メニューは閉じる
  }
  const menuItemClass = "h-8 w-8 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors";
</script>

<svelte:window onclick={handleOutsideClick} />

<div bind:this={container} class="group relative flex flex-col transition-all">
  <span class="text-xs font-bold text-muted-foreground opacity-80 capitalize ml-1">
    {log.speaker}
  </span>
 {#if log.speaker === 'model' && log.thoughtProcess}
    <div class="mb-2 max-w-full border-b px-2">
      <Accordion type="single">
        <AccordionItem value="thought-process" class="border-b-0">
          <AccordionTrigger class="py-2 text-xs text-muted-foreground hover:no-underline">
            <div class="flex items-center gap-2">
              <CircuitBoard class="h-3.5 w-3.5" />
              <span>思考プロセス</span>
              {#if log.tokenUsage?.thinking}
                <span class="ml-1 opacity-70">({log.tokenUsage.thinking} tokens)</span>
              {/if}
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div class="pt-2 pb-4 text-sm text-muted-foreground/90">
                <!-- 思考プロセスもMarkdownでレンダリング -->
                <MarkdownRenderer content={log.thoughtProcess} />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  {/if}
  {#if isEditing}
    <!-- 編集モード -->
    <div class="relative rounded-2xl border bg-background p-2 shadow-sm">
      <Textarea 
        bind:value={editText} 
        class="min-h-[60px] resize-none border-0 focus-visible:ring-0 bg-transparent p-2"
        style={customFontStyle}
        autofocus
      />
      <div class="flex justify-end gap-2 mt-2">
        <Button variant="ghost" size="sm" onclick={cancelEditing} title="キャンセル">キャンセル</Button>
        <Button variant="outline" size="sm" onclick={saveEditing} title="保存">保存</Button>
      </div>
    </div>
  {:else}
    <!-- 表示モード -->
    <button 
      type="button"
      class={cn("relative text-left text-base leading-relaxed whitespace-pre-wrap wrap-break-word rounded-2xl px-4 transition-colors duration-200 border border-transparent")} 
      style={customFontStyle}
      onclick={toggleMenu}
    >
      {#if displayText}
        <MarkdownRenderer content={displayText} />
      {:else if log.speaker === 'user'}
        <span class="opacity-70">(ダイスロールのみ)</span>
      {/if}
    </button>
  {/if}

  <!-- 分岐ナビゲーション -->
  {#if !isEditing && siblingInfo.total > 1}
    <div transition:fade={{ duration: 150 }} class="absolute -bottom-4 left-0 right-0 z-10 mx-auto flex w-fit items-center gap-0.5 bg-background/90 px-1 py-0.5 shadow-sm backdrop-blur select-none">
        <button type="button" class="rounded hover:bg-muted disabled:opacity-30 p-0.5" disabled={!siblingInfo.hasPrev} onclick={(e) => handleBranchSwitch(e, 'prev')}>
            <ChevronLeft class="h-3 w-3" />
        </button>
        <span class="mx-1 min-w-8 text-center text-[10px] font-medium leading-none tabular-nums text-muted-foreground">
            {siblingInfo.current} / {siblingInfo.total}
        </span>
        <button type="button" class="rounded hover:bg-muted disabled:opacity-30 p-0.5" disabled={!siblingInfo.hasNext} onclick={(e) => handleBranchSwitch(e, 'next')}>
            <ChevronRight class="h-3 w-3" />
        </button>
    </div>
  {/if}

  <!-- メニュー -->
  {#if isMenuOpen && !isEditing}
    <div transition:fade={{ duration: 150 }} class="absolute -bottom-5 right-2 z-10 flex items-center gap-1 rounded-full border bg-background/95 p-1 shadow-lg backdrop-blur supports-backdrop-filter:bg-background/60">
       <Button variant="ghost" size="icon" class={menuItemClass} title={isCopied ? "コピーしました" : "コピー"} onclick={handleCopy}>
        {#if isCopied} <Check class="h-4 w-4" /> {:else} <Copy class="h-4 w-4" /> {/if}
      </Button>
      <Button variant="ghost" size="icon" class={menuItemClass} title="編集" onclick={startEditing}>
        <Pencil class="h-4 w-4" />
      </Button>
       <Button variant="ghost" size="icon" class={menuItemClass} title="再生成" onclick={() => onRegenerate(log.id)}>
        <RefreshCw class="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" class={menuItemClass} title="詳細 (Metadata)" onclick={openMetadata}>
        <Info class="h-4 w-4" />
      </Button>
      <div class="mx-1 h-4 w-px bg-border"></div>

      <!-- 削除ボタン: ここでは状態を変更するだけにする -->
      <Button variant="ghost" size="icon" class={menuItemClass} title="削除" onclick={openDeleteDialog}>
        <Trash2 class="size-4" />
      </Button>
    </div>
  {/if}
</div>

<Dialog.Root bind:open={isMetadataOpen}>
  <Dialog.Content class="max-w-4xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
    <Dialog.Header class="p-4 pb-2 border-b">
      <Dialog.Title>Metadata: {log.speaker === 'user' ? 'Request Payload' : 'Response Body'}</Dialog.Title>
      <Dialog.Description>
        ID: <span class="font-mono text-xs">{log.id}</span>
      </Dialog.Description>
    </Dialog.Header>
    <div class="flex-1 overflow-auto">
      {#if log.metadata}
        <pre class="text-xs">{JSON.stringify(log.metadata, null, 2)}</pre>
      {:else}
        <div class="flex h-full items-center justify-center text-muted-foreground">
          <p>メタデータが存在しません</p>
        </div>
      {/if}
    </div>
  </Dialog.Content>
</Dialog.Root>

<!-- 削除確認ダイアログ: メニューの外に出し、状態変数で制御 -->
<Dialog.Root bind:open={isDeleteDialogOpen}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>本当に削除しますか？</Dialog.Title>
      <Dialog.Description>
        この操作は取り消せません。<br/>履歴から完全に削除されます。
      </Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer>
      <!-- キャンセルボタンに閉じる処理を追加 -->
      <Button variant="ghost" onclick={() => isDeleteDialogOpen = false}>
        キャンセル
      </Button>
      
      <!-- 削除実行 -->
      <Button variant="outline" onclick={() => onDelete(log.id)}>
        削除
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
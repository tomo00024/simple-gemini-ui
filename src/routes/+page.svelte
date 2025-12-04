<!-- src/routes/+page.svelte -->
<script lang="ts">
  import { onMount, tick } from "svelte";
  import { liveQuery } from "dexie";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  
  import Header from "$lib/components/app/Header.svelte";
  import Footer from "$lib/components/app/Footer.svelte";
  import ChatMessage from "$lib/components/app/ChatMessage.svelte";

  import { appSettings } from "$lib/settings.svelte";
  import { createChatSession } from "$lib/state/chat.svelte";
  import { ChatRepository } from "$lib/db/repository";
  import { db } from "$lib/db";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { FONT_FAMILY_OPTIONS, DEFAULT_FONT_FAMILY_ID } from "$lib/constants";

  let chatTitle = $state("新しいチャット");
  const chat = createChatSession();
  const repo = new ChatRepository();

  let viewportHeight = $state("100dvh");
  let scrollSaveTimer: ReturnType<typeof setTimeout> | undefined;

  // ★修正箇所: onMount から async を外し、内部処理を整理
  onMount(() => {
    // 1. チャット初期化（非同期だが待たずに実行）
    chat.init();
    
    // 2. スクロールイベントリスナーを追加
    const viewport = document.querySelector('[data-slot="scroll-area-viewport"]');
    if (viewport) {
      viewport.addEventListener('scroll', handleScroll);
    } else {
      setTimeout(() => {
        const retryViewport = document.querySelector('[data-slot="scroll-area-viewport"]');
        if (retryViewport) {
          retryViewport.addEventListener('scroll', handleScroll);
        }
      }, 500);
    }

    // 3. スマホのキーボード開閉に合わせて高さを調整する処理
    if (window.visualViewport) {
      const handleResize = () => {
        viewportHeight = `${window.visualViewport!.height}px`;
      };

      window.visualViewport.addEventListener("resize", handleResize);
      window.visualViewport.addEventListener("scroll", handleResize);

      // 初回実行
      handleResize();

      // クリーンアップ関数を返す（同期的に返す必要がある）
      return () => {
        const viewport = document.querySelector('[data-slot="scroll-area-viewport"]');
        if (viewport) {
          viewport.removeEventListener('scroll', handleScroll);
        }
        window.visualViewport?.removeEventListener("resize", handleResize);
        window.visualViewport?.removeEventListener("scroll", handleResize);
      };
    }

    // スクロールイベントリスナーのクリーンアップのみの場合
    return () => {
      const viewport = document.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        viewport.removeEventListener('scroll', handleScroll);
      }
    };
  });

  $effect(() => {
    const currentId = chat.sessionId;
    const observable = liveQuery(() => db.sessions.get(currentId));
    const subscription = observable.subscribe({
      next: (session) => {
        if (session) {
          chatTitle = session.title;
        } else {
          chatTitle = "新しいチャット";
        }
      },
      error: (err) => console.error(err)
    });

    return () => subscription.unsubscribe();
  });

  async function handleTitleConfirm() {
    if (!chat.sessionId || !chatTitle.trim()) return;
    await repo.updateSessionTitle(chat.sessionId, chatTitle);
  }

  // セッション切り替え時やログ更新時にスクロール位置を復元
  $effect(() => {
    const currentSessionId = chat.sessionId;
    const logsLength = chat.logs.length;
    
    setTimeout(() => {
      restoreScrollPosition();
    }, 100);
  });

  function handleScroll() {
    clearTimeout(scrollSaveTimer);
    scrollSaveTimer = setTimeout(() => {
      saveScrollPosition();
    }, 500);
  }

  function saveScrollPosition() {
    const viewport = document.querySelector('[data-slot="scroll-area-viewport"]');
    if (viewport && chat.sessionId) {
      const scrollTop = viewport.scrollTop;
      localStorage.setItem(`scroll_position_${chat.sessionId}`, scrollTop.toString());
    }
  }

  function restoreScrollPosition() {
    const viewport = document.querySelector('[data-slot="scroll-area-viewport"]');
    if (viewport && chat.sessionId) {
      const savedPosition = localStorage.getItem(`scroll_position_${chat.sessionId}`);
      if (savedPosition) {
        viewport.scrollTop = parseInt(savedPosition, 10);
      }
    }
  }

  // --- スタイル関連 ---
  let mainStyle = $derived(
    appSettings.value.ui.useCustomFontSize
      ? `--chat-font-size: ${appSettings.value.ui.chatFontSize}px;`
      : undefined
  );

   $effect(() => {
    if (!appSettings.value.ui.useCustomFontSize) {
      document.body.style.fontFamily = '';
      return;
    }

    const fontId = appSettings.value.ui.fontFamily || DEFAULT_FONT_FAMILY_ID;
    const fontDef = FONT_FAMILY_OPTIONS.find(f => f.id === fontId);
    const cssValue = fontDef ? fontDef.value : FONT_FAMILY_OPTIONS[0].value;

    document.body.style.fontFamily = cssValue;
  });
</script>

<svelte:head>
  <style>
    :global(pre, code, kbd, samp) {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
    }
  </style>
</svelte:head>

<div 
  class="flex flex-col bg-background text-foreground overflow-hidden" 
  style="height: {viewportHeight}; {mainStyle ? mainStyle : ''}"
>
  <Header 
    bind:title={chatTitle} 
    bind:settings={appSettings.value}
    currentSessionId={chat.sessionId}
    tokenCount={chat.tokenCounter.count}
    isCounting={chat.tokenCounter.isLoading}
    onSelectSession={(id) => chat.load(id)} 
    onNewChat={() => chat.load()}
    onTitleConfirm={handleTitleConfirm}
  />

  <main class="flex-1 min-h-0 relative">
    <ScrollArea class="h-full">
      <div class="mx-auto flex max-w-3xl flex-col pb-10 pl-6 pr-4 pt-4">
        {#each chat.logs as log (log.id)}
          <ChatMessage 
            {log}
            onUpdate={(id, txt) => chat.updateLog(id, txt)} 
            onDelete={(id) => chat.deleteLog(id)}
            onRegenerate={(id) => chat.regenerate(id)}
            getSiblingInfo={(id) => chat.getSiblingInfo(id)}
            onSwitchBranch={(id, dir) => chat.switchBranch(id, dir)}
          />
        {/each}
        {#if chat.isLoading}
           <div class="pl-1 text-sm text-muted-foreground animate-pulse">{chat.retryStatus}</div>
        {/if}
        <div class="h-4"></div>
      </div>
    </ScrollArea>
  </main>

 <Footer 
    bind:value={chat.inputMessage} 
    isLoading={chat.isLoading} 
    attachments={chat.attachments} 
    onSend={() => chat.sendMessage()}
    onStop={() => chat.stopGeneration()}
    onAddFiles={(files) => chat.addFiles(files)}
    onRemoveFile={(id) => chat.removeAttachment(id)}
  />

  <Dialog.Root bind:open={chat.alertState.isOpen}>
    <Dialog.Content>
      <Dialog.Header>
        <Dialog.Title>使用量アラート</Dialog.Title>
        <Dialog.Description>
          本日のAPI使用料（概算）が、設定されたしきい値 
          <span class="font-bold text-foreground">
            ${chat.alertState.threshold.toFixed(2)}
          </span> 
          を超えました。
        </Dialog.Description>
      </Dialog.Header>
      <Dialog.Footer>
        <Button variant="outline" onclick={() => chat.alertState.isOpen = false}>
          確認
        </Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Root>
  
  <Dialog.Root 
    open={chat.errorAlertState.isOpen} 
    onOpenChange={(isOpen) => {
      if (!isOpen) {
        chat.errorAlertState.onCancel();
      }
    }}
  >
    <Dialog.Content>
      <Dialog.Header>
        <Dialog.Title>エラー発生</Dialog.Title>
        <Dialog.Description class="whitespace-pre-wrap">
          {chat.errorAlertState.message}
        </Dialog.Description>
      </Dialog.Header>
      
      <Dialog.Footer>
        {#if chat.errorAlertState.showCancel}
          <Button variant="ghost" onclick={chat.errorAlertState.onCancel}>
            キャンセル
          </Button>
        {/if}
        
        <Button variant="outline" onclick={chat.errorAlertState.onConfirm}>
          OK
        </Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Root>
</div>
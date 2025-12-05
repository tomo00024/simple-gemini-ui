<script lang="ts">
  import { liveQuery } from "dexie";
  import { Menu, MessageSquare, Plus, Loader2, Copy, Trash2 } from "lucide-svelte";
  import { Button, buttonVariants } from "$lib/components/ui/button";
  import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "$lib/components/ui/sheet";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import * as Dialog from "$lib/components/ui/dialog";
  import { db } from "$lib/db";
  import { ChatRepository } from "$lib/db/repository"; // 追加
  import type { SessionMeta } from "$lib/types";
  import { cn } from "$lib/utils";

  let { 
    currentSessionId, 
    onSelectSession, 
    onNewChat 
  } = $props<{ 
    currentSessionId: string, 
    onSelectSession: (id: string) => void,
    onNewChat: () => void 
  }>();

  let isOpen = $state(false);
  let sessions = $state<SessionMeta[]>([]);
  let isLoading = $state(true);

  // 削除確認ダイアログの状態管理
  let deleteTargetId = $state<string | null>(null);
  let isDeleteDialogOpen = $state(false);
  let deleteTargetSession = $derived(sessions.find(s => s.id === deleteTargetId));

  const repo = new ChatRepository();

  $effect(() => {
    const observable = liveQuery(() => 
      db.sessions.orderBy('lastUpdatedAt').reverse().toArray()
    );

    const subscription = observable.subscribe({
      next: (result) => {
        sessions = result;
        isLoading = false;
      },
      error: (err) => console.error(err)
    });

    return () => subscription.unsubscribe();
  });
 $effect(() => {
    if (isOpen) {
      history.pushState(null, "", "");
      let isBack = false;

      const handlePopState = () => {
        isBack = true;
        isOpen = false;
      };

      window.addEventListener("popstate", handlePopState);

      return () => {
        window.removeEventListener("popstate", handlePopState);
        if (!isBack) {
          history.back();
        }
      };
    }
  });
  function handleSelect(id: string) {
    onSelectSession(id);
    isOpen = false;
  }

  function handleNew() {
    onNewChat();
    isOpen = false;
  }

  // 複製処理
  async function handleDuplicate(e: Event, id: string) {
    e.stopPropagation(); // 行クリック（セッション選択）の発火を防ぐ
    try {
      await repo.duplicateSession(id);
      // 複製後は自動でリスト更新されます（liveQueryのため）
      // 必要であれば複製したセッションへ移動する処理を書いても良いですが、
      // ここでは「複製を作成」にとどめます。
    } catch (err) {
      console.error("Failed to duplicate session:", err);
    }
  }

  // 削除ボタンクリック（ダイアログを開く）
  function openDeleteDialog(e: Event, id: string) {
    e.stopPropagation();
    deleteTargetId = id;
    isDeleteDialogOpen = true;
  }

  // 削除実行
  async function handleDeleteConfirm() {
    if (!deleteTargetId) return;
    
    const targetId = deleteTargetId;
    
    // 現在開いているセッションを削除する場合のフラグ
    const isCurrent = targetId === currentSessionId;

    try {
      await repo.deleteSession(targetId);
      
      // 現在開いているセッションだった場合、空のチャットへ遷移
      if (isCurrent) {
        onNewChat();
      }
    } catch (err) {
      console.error("Failed to delete session:", err);
    } finally {
        isDeleteDialogOpen = false;
        deleteTargetId = null;
    }
  }
</script>

<Sheet bind:open={isOpen}>
  <SheetTrigger class={buttonVariants({ variant: "ghost", size: "icon" })}>
    <Menu class="h-5 w-5" />
  </SheetTrigger>
  <!-- 変更1: h-full flex flex-col gap-0 を追加 -->
  <SheetContent side="left" class="w-[300px] sm:w-[350px] p-0 h-full flex flex-col gap-0">
    
    <!-- ヘッダーは固定 (flex-none) -->
    <SheetHeader class="p-4 pb-2 border-b text-left flex-none border-muted-foreground/60">
      <SheetTitle>履歴</SheetTitle>
      <SheetDescription class="sr-only">過去のチャット履歴</SheetDescription>
    </SheetHeader>
    
    <!-- 変更2: ラッパーを h-full ではなく flex-1 min-h-0 にする -->
    <!-- これによりヘッダー以外の「残り」の高さに収まります -->
    <div class="flex flex-col flex-1 min-h-0 py-2">
      
      <!-- 新規チャットボタン (固定) -->
      <div class="px-3 mb-2 flex-none">
        <Button variant="outline" class="w-full justify-start gap-2 h-10 shadow-sm" onclick={handleNew}>
          <Plus class="h-4 w-4" />新しいチャット
        </Button>
      </div>
      
      <!-- 変更3: ScrollArea に h-full を追加 -->
      <!-- 親(flex-1)の高さ限界まで広がり、中身が溢れたらスクロールします -->
      <ScrollArea class="h-full px-3">
        <div class="flex flex-col gap-1 pb-4">
          {#if isLoading}
             <div class="flex justify-center p-4"><Loader2 class="h-4 w-4 animate-spin"/></div>
          {:else if sessions.length === 0}
             <div class="text-sm text-muted-foreground p-4 text-center">履歴はありません</div>
          {:else}
            {#each sessions as session (session.id)}
              <div class={cn(
                  "group flex items-center w-full rounded-md transition-colors gap-1",
                  currentSessionId === session.id ? "bg-secondary" : "hover:bg-muted"
                )}
              >
                <button
                  type="button"
                  class={cn(
                    "flex-1 flex items-center h-9 px-4 py-2 text-sm font-normal truncate outline-none rounded-l-md",
                    currentSessionId === session.id && "font-medium"
                  )}
                  onclick={() => handleSelect(session.id)}
                >
                    <MessageSquare class="mr-2 h-4 w-4 opacity-70 shrink-0" />
                    <span class="truncate text-left">{session.title}</span>
                </button>

                <div class="flex items-center gap-0.5 pr-1 opacity-70 group-hover:opacity-100 transition-opacity">
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        class="h-7 w-7 text-muted-foreground hover:text-foreground"
                        title="複製"
                        onclick={(e) => handleDuplicate(e, session.id)}
                    >
                        <Copy class="h-3.5 w-3.5" />
                    </Button>
                    
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        class="h-7 w-7 text-muted-foreground hover:text-foreground"
                        title="削除"
                        onclick={(e) => openDeleteDialog(e, session.id)}
                    >
                        <Trash2 class="h-3.5 w-3.5" />
                    </Button>
                </div>
              </div>
            {/each}
          {/if}
        </div>
      </ScrollArea>
    </div>
  </SheetContent>
</Sheet>

<Dialog.Root bind:open={isDeleteDialogOpen}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>チャットを削除しますか？</Dialog.Title>
      <Dialog.Description class="text-muted-foreground">
      {#if deleteTargetSession}
        <span class="block font-semibold text-foreground mb-2">
          「{deleteTargetSession.title}」
        </span>
      {/if}
      この操作は取り消せません。<br/>履歴から完全に削除されます。
    </Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer>
      <!-- キャンセル: ghost (メインページのエラーダイアログに準拠) -->
      <Button variant="ghost" onclick={() => isDeleteDialogOpen = false}>
        キャンセル
      </Button>
      
      <!-- 削除: outline (メインページのOK/確認ボタンに準拠) -->
      <Button variant="outline" onclick={handleDeleteConfirm}>
        削除
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
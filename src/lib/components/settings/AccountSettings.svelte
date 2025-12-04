<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import { Switch } from "$lib/components/ui/switch";
  import type { AppSettings } from "$lib/types";
  import { backupManager } from "$lib/services/backup.svelte";
  import { dropboxService } from "$lib/services/dropbox";
  import { db } from "$lib/db";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { 
    Loader2, 
    FileText, 
    Calendar, 
    HardDriveDownload, 
    CheckSquare, 
    Square, 
    Clock, 
    History // アイコン追加
  } from "lucide-svelte";
    import DangerZone from "$lib/components/settings/DangerZone.svelte";

  let { settings = $bindable() } = $props<{ settings: AppSettings }>();

  // --- State ---
  let isDialogOpen = $state(false); 
  let isRestoring = $state(false);
  let isLoadingFiles = $state(false); 

  let availableDates: string[] = $state([]);
  let selectedDate = $state("");
  let availableSessions: { name: string, path: string }[] = $state([]); // APIから取得した生のリスト
  let selectedPaths: string[] = $state([]);

  // --- Derived: グループ化ロジック ---
  // --- Derived: グループ化ロジック (許容範囲付き) ---
  let groupedSessions = $derived.by(() => {
    // ★設定: 何ミリ秒以内のズレなら同じバックアップとみなすか (ここでは60秒)
    const MERGE_THRESHOLD_MS = 60 * 1000; 

    type Group = {
        id: string;
        label: string;
        type: 'auto' | 'manual';
        time: number; // ソート・比較用の基準時間
        files: typeof availableSessions;
    };

    // 1. 自動バックアップ用グループ初期化
    const autoGroup: Group = {
        id: 'auto',
        label: '自動バックアップ (最新状態)',
        type: 'auto',
        time: Number.MAX_SAFE_INTEGER, // 常に先頭にするため最大値
        files: []
    };

    // 2. ファイルを「自動」と「手動(時刻付き)」に解析してリスト化
    const manualItems: { file: typeof availableSessions[0], time: number }[] = [];

    for (const file of availableSessions) {
        const manualMatch = file.name.match(/_manual_(\d{6})\.json$/);
        
        if (manualMatch) {
            const timeStr = manualMatch[1]; // 例: "212037"
            
            // 比較用にDateオブジェクト化 (日付は現在日固定、時刻のみ解析)
            const d = new Date();
            d.setHours(parseInt(timeStr.slice(0, 2), 10));
            d.setMinutes(parseInt(timeStr.slice(2, 4), 10));
            d.setSeconds(parseInt(timeStr.slice(4, 6), 10));
            d.setMilliseconds(0);
            
            manualItems.push({ 
                file, 
                time: d.getTime() 
            });
        } else {
            autoGroup.files.push(file);
        }
    }

    // 3. 手動バックアップを「新しい順」にソート
    manualItems.sort((a, b) => b.time - a.time);

    // 4. 近い時間のものをグループ化
    const manualGroups: Group[] = [];
    
    for (const item of manualItems) {
        // 作成済みの最新グループを取得
        const latestGroup = manualGroups[manualGroups.length - 1];

        // 最新グループが存在し、かつ時間の差が閾値以内なら同じグループに入れる
        if (latestGroup && Math.abs(latestGroup.time - item.time) <= MERGE_THRESHOLD_MS) {
            latestGroup.files.push(item.file);
        } else {
            // 新しいグループを作成
            const dateObj = new Date(item.time);
            // 表示用の時刻フォーマット
            const timeLabel = dateObj.toLocaleTimeString('ja-JP', { 
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit' 
            });
            
            manualGroups.push({
                id: `manual_${item.time}`,
                label: `手動バックアップ (${timeLabel} 付近)`, // "付近"として範囲であることを示唆
                type: 'manual',
                time: item.time, // グループの基準時間
                files: [item.file]
            });
        }
    }

    // 5. 自動グループと手動グループを結合して返す
    const result = [];
    if (autoGroup.files.length > 0) result.push(autoGroup);
    
    // 手動グループは既に新しい順になっているのでそのまま結合
    return [...result, ...manualGroups];
  });

  // --- Actions ---

  function handleAuthToggle() {
    if (backupManager.isLoggedIn) {
      backupManager.logout();
    } else {
      backupManager.login();
    }
  }

  async function handleManualBackup() {
    await backupManager.forceBackupAll();
  }

  async function selectDate(date: string) {
    selectedDate = date;
    isLoadingFiles = true;
    availableSessions = [];
    selectedPaths = [];
    try {
        availableSessions = await dropboxService.listSessionsInDate(date);
    } finally {
        isLoadingFiles = false;
    }
  }

  function toggleFileSelection(path: string) {
    if (selectedPaths.includes(path)) {
      selectedPaths = selectedPaths.filter(p => p !== path);
    } else {
      selectedPaths = [...selectedPaths, path];
    }
  }

  // グループごとの一括選択
  function toggleGroupSelection(files: typeof availableSessions) {
    const pathsInGroup = files.map(f => f.path);
    const allSelected = pathsInGroup.every(p => selectedPaths.includes(p));

    if (allSelected) {
        // 解除
        selectedPaths = selectedPaths.filter(p => !pathsInGroup.includes(p));
    } else {
        // 追加（重複防ぐ）
        const newPaths = pathsInGroup.filter(p => !selectedPaths.includes(p));
        selectedPaths = [...selectedPaths, ...newPaths];
    }
  }

  function toggleSelectAll() {
    if (selectedPaths.length === availableSessions.length && availableSessions.length > 0) {
      selectedPaths = [];
    } else {
      selectedPaths = availableSessions.map(s => s.path);
    }
  }

  async function restoreSelectedSessions() {
    isRestoring = true;
    let successCount = 0;
    let failCount = 0;

    try {
      for (const path of selectedPaths) {
        try {
          const backup = await dropboxService.downloadSession(path);
          await db.sessions.put(backup.meta);
          await db.transaction('rw', db.logs, async () => {
             await db.logs.where('sessionId').equals(backup.meta.id).delete();
             await db.logs.bulkPut(backup.logs);
          });
          successCount++;
        } catch (e) {
          console.error(`Failed to restore ${path}`, e);
          failCount++;
        }
      }
      
      if (failCount > 0) {
        alert(`${successCount} 件復元しましたが、${failCount} 件の復元に失敗しました。`);
      }
      
      isDialogOpen = false;
      selectedPaths = [];

    } catch (e) {
      console.error(e);
      alert("復元処理中にエラーが発生しました。");
    } finally {
      isRestoring = false;
    }
  }

  async function openRestoreDialog() {
    isDialogOpen = true;
    selectedDate = "";
    availableSessions = [];
    selectedPaths = [];
    availableDates = await dropboxService.listDateFolders();
    if (availableDates.length > 0) {
        await selectDate(availableDates[0]);
    }
  }
</script>

<div class="space-y-8">
  <!-- メイン設定画面 -->
  <div class="space-y-6">
    <h3 class="font-medium text-lg border-b border-muted-background">Dropbox バックアップ</h3>
    
    <div>
      <Button 
        variant="outline"
        onclick={handleAuthToggle}
      >
        {backupManager.isLoggedIn ? "ログアウト" : "ログイン"}
      </Button>
    </div>

    {#if backupManager.isLoggedIn}
      <div class="flex items-center justify-between space-x-2">
        <Label for="backupEnabled">バックアップ機能を有効化</Label>
        <Switch id="backupEnabled" bind:checked={settings.backup.isEnabled} />
      </div>

      <div class="flex gap-2 items-center">
        <Button variant="secondary" size="sm" onclick={handleManualBackup}>
          今すぐバックアップ
        </Button>
        
        <Button variant="outline" size="sm" onclick={openRestoreDialog}>
          <HardDriveDownload class="mr-2 h-4 w-4" />
          復元する
        </Button>
        
        <Label class="text-sm text-muted-foreground ml-auto">
          最終: {settings.backup.lastBackupAt ? new Date(settings.backup.lastBackupAt).toLocaleString() : "未実行"}
        </Label>
      </div>

      <!-- 復元ダイアログ -->
      <Dialog.Root bind:open={isDialogOpen}>
        <Dialog.Content class="max-w-3xl h-[80vh] flex flex-col p-0 gap-0 overflow-hidden">
          <Dialog.Header class="p-6 pb-4 border-b shrink-0">
            <Dialog.Title>バックアップから復元</Dialog.Title>
            <Dialog.Description>
              日付とスナップショットを選択して復元します。
            </Dialog.Description>
          </Dialog.Header>

          <div class="flex flex-1 min-h-0">
            <!-- 左側: 日付リスト -->
            <div class="w-1/3 border-r bg-muted/30 flex flex-col overflow-hidden">
              <div class="p-4 py-3 border-b text-xs font-semibold text-muted-foreground bg-muted/50">
                バックアップ日付
              </div>
                <div class="flex-1 min-h-0">
                  <ScrollArea class="h-full">
                    <div class="p-2 space-y-1">
                      {#each availableDates as date}
                        <!-- (中身はそのまま) -->
                        <button
                          class="w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2
                          {selectedDate === date ? 'bg-primary text-primary-foreground' : 'hover:bg-accent hover:text-accent-foreground'}"
                          onclick={() => selectDate(date)}
                        >
                          <Calendar class="h-4 w-4 opacity-70" />
                          {date}
                        </button>
                      {/each}
                      {#if availableDates.length === 0}
                        <div class="p-4 text-xs text-muted-foreground text-center">バックアップが見つかりません</div>
                      {/if}
                    </div>
                  </ScrollArea>
              </div>
            </div>
            <!-- 右側: ファイルリスト（グループ表示） -->
            <div class="flex-1 flex flex-col bg-background overflow-hidden">
              <!-- リストヘッダー -->
              <div class="p-4 py-3 border-b text-xs font-semibold text-muted-foreground bg-muted/50 flex items-center shrink-0">
                 <!-- (ヘッダーの中身はそのまま) -->

                 <span class="flex-1">{selectedDate ? `${selectedDate}` : '日付を選択'}</span>
                 <span>
                    {#if selectedPaths.length > 0}
                        {selectedPaths.length} 選択中
                    {:else}
                        {availableSessions.length} ファイル
                    {/if}
                 </span>
              </div>
              
              <!-- ★修正: ラッパーを追加し、ScrollAreaをh-fullに -->
              <div class="flex-1 min-h-0">
                  <ScrollArea class="h-full p-2">
                      {#if isLoadingFiles}
                          <!-- (ローディング表示) -->
                          <div class="flex items-center justify-center h-40 text-muted-foreground">
                              <Loader2 class="h-6 w-6 animate-spin mr-2" />
                              読み込み中...
                          </div>
                      {:else if selectedDate && groupedSessions.length > 0}
                          <!-- (リスト表示) -->
                          <div class="space-y-6 pb-4">
                            {#each groupedSessions as group}
                              <!-- (グループ表示のループ中身はそのまま) -->
                              <div class="space-y-2">
                                <div class="flex items-center gap-2 px-2 py-1">
                                    <button 
                                        class="text-muted-foreground hover:text-primary transition-colors"
                                        onclick={() => toggleGroupSelection(group.files)}
                                    >
                                        {#if group.files.every(f => selectedPaths.includes(f.path))}
                                            <CheckSquare class="h-3.5 w-3.5" />
                                        {:else}
                                            <Square class="h-3.5 w-3.5" />
                                        {/if}
                                    </button>
    
                                    <div class="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex-1">
                                        {#if group.type === 'auto'}
                                            <History class="h-3.5 w-3.5" />
                                        {:else}
                                            <Clock class="h-3.5 w-3.5" />
                                        {/if}
                                        {group.label}
                                        <span class="ml-auto font-normal normal-case opacity-50 text-[10px]">{group.files.length} 件</span>
                                    </div>
                                </div>
                                <div class="bg-muted/30 h-px w-full mx-2 mb-2"></div>
    
                                <div class="grid gap-1 px-1">
                                    {#each group.files as file}
                                        <button
                                            class="flex items-center w-full p-2 pl-3 rounded-md border border-transparent hover:border-border hover:bg-accent text-left group transition-all text-sm"
                                            onclick={() => toggleFileSelection(file.path)}
                                            disabled={isRestoring}
                                        >
                                            <div class="mr-3 text-muted-foreground group-hover:text-primary transition-colors">
                                                {#if selectedPaths.includes(file.path)}
                                                    <CheckSquare class="h-4 w-4 text-primary" />
                                                {:else}
                                                    <Square class="h-4 w-4" />
                                                {/if}
                                            </div>
    
                                            <div class="h-8 w-8 rounded bg-primary/10 flex items-center justify-center mr-3 text-primary shrink-0">
                                                <FileText class="h-4 w-4" />
                                            </div>
                                            <div class="flex-1 min-w-0">
                                                <div class="font-medium truncate leading-tight">
                                                    {file.name
                                                        .replace(/_manual_\d{6}/, '')
                                                        .replace(/_\w{8,}-\w{4}-\w{4}-\w{4}-\w{12}/, '')
                                                        .replace('.json', '')
                                                        .replace(/_/g, ' ')}
                                                </div>
                                                <div class="text-[10px] text-muted-foreground truncate opacity-60">
                                                    {file.name}
                                                </div>
                                            </div>
                                        </button>
                                    {/each}
                                </div>
                              </div>
                            {/each}
                          </div>
                      {:else if selectedDate}
                          <div class="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm">
                              <FileText class="h-8 w-8 mb-2 opacity-20" />
                              この日のバックアップファイルはありません
                          </div>
                      {/if}
                  </ScrollArea>
              </div>
            </div>
        </div>
          <!-- フッター -->
          <div class="p-4 border-t flex justify-end items-center gap-2 bg-muted/10 shrink-0">
              <Button variant="ghost" onclick={() => isDialogOpen = false} disabled={isRestoring}>
                  キャンセル
              </Button>

              <AlertDialog.Root>
                <AlertDialog.Trigger>
                  {#snippet child({ props })}
                    <Button 
                        variant="outline"
                        disabled={selectedPaths.length === 0 || isRestoring} 
                        {...props}
                    >
                        {#if isRestoring}
                            <Loader2 class="mr-2 h-4 w-4 animate-spin" />
                            復元中...
                        {:else}
                            選択した {selectedPaths.length} 件を復元
                        {/if}
                    </Button>
                  {/snippet}
                </AlertDialog.Trigger>
                <AlertDialog.Content>
                    <AlertDialog.Header>
                        <AlertDialog.Title>復元の確認</AlertDialog.Title>
                        <AlertDialog.Description>
                            現在選択されている <span class="font-bold text-foreground">{selectedPaths.length}</span> 件のセッションを復元します。<br>
                            ローカルの同IDのセッションは上書きされます。よろしいですか？
                        </AlertDialog.Description>
                    </AlertDialog.Header>
                    <AlertDialog.Footer>
                        <AlertDialog.Cancel>キャンセル</AlertDialog.Cancel>
                        <AlertDialog.Action onclick={restoreSelectedSessions}>
                            復元を実行
                        </AlertDialog.Action>
                    </AlertDialog.Footer>
                </AlertDialog.Content>
              </AlertDialog.Root>
          </div>
        </Dialog.Content>
      </Dialog.Root>
    {/if}
  </div>

  <!-- メタデータ設定 -->
  <div class="space-y-6">
    <h3 class="font-medium text-lg border-b border-muted-background">メタデータ設定</h3>
    <div class="grid gap-6">
      <div class="flex items-center justify-between">
        <Label for="save-minimal-metadata-switch" class="cursor-pointer">
          送信メタデータを省略して保存する
        </Label>
        <Switch 
          id="save-minimal-metadata-switch"
          bind:checked={settings.assist.saveMinimalMetadata} 
        />
      </div>
    </div>
  </div>
    <DangerZone />

</div>
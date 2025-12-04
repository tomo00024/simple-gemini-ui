<script lang="ts">
  import * as Accordion from "$lib/components/ui/accordion";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { db } from "$lib/db";
  import { AlertTriangle, Trash2, RefreshCw, Loader2 } from "lucide-svelte";
  
  // --- State ---
  let isResetSettingsOpen = $state(false);
  let isFactoryResetOpen = $state(false);
  let isProcessing = $state(false);
  
  // Factory Reset用の入力確認ステート
  let deleteConfirmInput = $state("");
  const DELETE_KEYWORD = "delete";
  let isDeleteConfirmValid = $derived(deleteConfirmInput === DELETE_KEYWORD);

  // --- Actions ---

  /**
   * 設定のみを初期化 (appSettings削除)
   */
  function handleResetSettings() {
    isProcessing = true;
    try {
      localStorage.removeItem("appSettings");
      // UI反映のためリロード
      window.location.reload();
    } catch (e) {
      console.error("Failed to reset settings:", e);
      isProcessing = false;
      isResetSettingsOpen = false;
    }
  }

  /**
   * 全データ削除 (Factory Reset)
   * DB削除 + LocalStorage全削除
   */
  async function handleFactoryReset() {
    if (!isDeleteConfirmValid) return;
    
    isProcessing = true;
    try {
      // 1. Dexie DBの削除
      await db.delete();
      
      // 2. LocalStorageの全クリア
      localStorage.clear();

      // 3. リロードして初期状態に戻す
      window.location.reload();
    } catch (e) {
      console.error("Failed to factory reset:", e);
      alert("データの削除中にエラーが発生しました。");
      isProcessing = false;
      isFactoryResetOpen = false;
    }
  }
</script>

<div class="mt-8 border-b-destructive/40 border-b pt-4">
  <Accordion.Root type="single"  class="w-full">
    <Accordion.Item value="danger-zone" class="">
      <Accordion.Trigger class="text-destructive hover:text-destructive/80 hover:no-underline py-4">
        <div class="flex items-center gap-2 font-semibold">
          <AlertTriangle class="h-4 w-4" />
          危険な設定 (Danger Zone)
        </div>
      </Accordion.Trigger>
      
      <Accordion.Content>
        <div class="space-y-6 py-4 px-1">
          
          <!-- 1. 設定リセット -->
          <div class="flex items-center justify-between gap-4 p-4 border rounded-md bg-muted/20">
            <div class="space-y-1">
              <h4 class="text-sm font-medium leading-none">設定を初期化</h4>
              <p class="text-xs text-muted-foreground">
                APIキーやUI設定、プロンプトプリセット等を初期状態に戻します。<br>
                チャットの履歴データは削除されません。
              </p>
            </div>
            
            <AlertDialog.Root bind:open={isResetSettingsOpen}>
              <AlertDialog.Trigger>
                {#snippet child({ props })}
                   <Button variant="outline" size="sm" {...props}>
                    <RefreshCw class="h-4 w-4 mr-2" />
                    設定をリセット
                  </Button>
                {/snippet}
              </AlertDialog.Trigger>
              <AlertDialog.Content>
                <AlertDialog.Header>
                  <AlertDialog.Title>設定を初期化しますか？</AlertDialog.Title>
                  <AlertDialog.Description>
                    保存されているAPIキーや表示設定がすべて失われます。この操作は元に戻せません。<br>
                    （チャット履歴は保持されます）
                  </AlertDialog.Description>
                </AlertDialog.Header>
                <AlertDialog.Footer>
                  <AlertDialog.Cancel>キャンセル</AlertDialog.Cancel>
                  <AlertDialog.Action 
                    class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onclick={handleResetSettings}
                    disabled={isProcessing}
                  >
                    {#if isProcessing}
                      <Loader2 class="mr-2 h-4 w-4 animate-spin" />
                    {/if}
                    初期化を実行
                  </AlertDialog.Action>
                </AlertDialog.Footer>
              </AlertDialog.Content>
            </AlertDialog.Root>
          </div>

          <!-- 2. 完全削除 (Factory Reset) -->
          <div class="flex items-center justify-between gap-4 p-4 border border-destructive/30 rounded-md bg-destructive/5">
            <div class="space-y-1">
              <h4 class="text-sm font-medium leading-none text-destructive">すべてのデータを削除</h4>
              <p class="text-xs text-muted-foreground">
                チャット履歴、設定、ログを含むすべてのローカルデータを完全に削除します。<br>
                アプリはインストール直後の状態に戻ります。
              </p>
            </div>

            <AlertDialog.Root bind:open={isFactoryResetOpen}>
              <AlertDialog.Trigger>
                 {#snippet child({ props })}
                  <Button variant="destructive" size="sm" {...props}>
                    <Trash2 class="h-4 w-4 mr-2" />
                    全データを削除
                  </Button>
                 {/snippet}
              </AlertDialog.Trigger>
              <AlertDialog.Content>
                <AlertDialog.Header>
                  <AlertDialog.Title>すべてのデータを削除しますか？</AlertDialog.Title>
                  <AlertDialog.Description>
                    この操作は<span class="font-bold text-destructive">取り消すことができません</span>。<br>
                    全てのチャット履歴、設定、APIキーが端末から永久に削除されます。<br><br>
                    実行するには下の入力欄に 
                    <span class="font-mono bg-muted px-1 py-0.5 rounded select-all">{DELETE_KEYWORD}</span>
                    と入力してください。
                  </AlertDialog.Description>
                </AlertDialog.Header>
                
                <div class="py-4">
                  <Label for="confirm-delete" class="mb-2 block text-xs">確認キーワード</Label>
                  <Input 
                    id="confirm-delete" 
                    bind:value={deleteConfirmInput} 
                    placeholder="「{DELETE_KEYWORD}」と入力"
                    autocomplete="off"
                  />
                </div>

                <AlertDialog.Footer>
                  <AlertDialog.Cancel onclick={() => deleteConfirmInput = ""}>キャンセル</AlertDialog.Cancel>
                  <Button 
                    variant="destructive"
                    onclick={handleFactoryReset}
                    disabled={!isDeleteConfirmValid || isProcessing}
                  >
                    {#if isProcessing}
                      <Loader2 class="mr-2 h-4 w-4 animate-spin" />
                      削除中...
                    {:else}
                      すべてのデータを削除
                    {/if}
                  </Button>
                </AlertDialog.Footer>
              </AlertDialog.Content>
            </AlertDialog.Root>
          </div>

        </div>
      </Accordion.Content>
    </Accordion.Item>
  </Accordion.Root>
</div>
<script lang="ts">
  import { Plus, Trash2, Copy, CheckSquare, Square } from "lucide-svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Switch } from "$lib/components/ui/switch";
  import { Checkbox } from "$lib/components/ui/checkbox"; // 追加
  import type { AppSettings, DiceRoll } from "$lib/types";

  let { settings = $bindable() } = $props<{ settings: AppSettings }>();

  function generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // 新規追加
  function addDiceRoll() {
    if (!settings.diceRolls) {
      settings.diceRolls = [];
    }
    const newDice: DiceRoll = {
      id: generateId(),
      isEnabled: true,
      instructionText: "1d100。数値は内緒にしてください。",
      diceCount: 1,
      diceType: 100
    };
    settings.diceRolls.push(newDice);
  }

  // 複製機能
  function duplicateDiceRoll(dice: DiceRoll) {
    if (!settings.diceRolls) return;
    
    const index = settings.diceRolls.findIndex((d: DiceRoll) => d.id === dice.id);
    
    const newDice: DiceRoll = {
      ...dice,
      id: generateId(),
      instructionText: dice.instructionText + " (コピー)"
    };

    if (index !== -1) {
        settings.diceRolls.splice(index + 1, 0, newDice);
        settings.diceRolls = [...settings.diceRolls];
    } else {
        settings.diceRolls.push(newDice);
    }
  }

  // 削除機能
  function removeDiceRoll(id: string) {
    if (!settings.diceRolls) return;
    settings.diceRolls = settings.diceRolls.filter((d: DiceRoll) => d.id !== id);
  }

   let hasActiveDice = $derived(
    settings.diceRolls?.some((d: DiceRoll) => d.isEnabled) ?? false
  );
function setAllDiceStatus(isChecked: boolean) {
    if (!settings.diceRolls) return;
    
    // SwitchのON/OFFに合わせて全てのダイス設定を更新
    settings.diceRolls.forEach((d: DiceRoll) => d.isEnabled = isChecked);
    
    // 配列の参照を更新してリアクティビティをトリガー
    settings.diceRolls = [...settings.diceRolls];
  }
</script>

<div class="space-y-8">
  <div class="space-y-6">
         <h3 class="font-medium text-lg border-b border-muted-background">アシスト機能</h3>
       <div class="flex items-center justify-between space-x-2">
           <Label for="autoCorrectUrl" class="flex flex-col space-y-1">
               URL自動補正
           </Label>
           <Switch id="autoCorrectUrl" bind:checked={settings.assist.autoCorrectUrl} />
       </div>
       </div>
  <!-- ダイスロール設定セクション -->
<div class="space-y-6">
    <!-- タイトル -->
    <h3 class="font-medium text-lg border-b border-muted-background">簡易ダイスロール設定</h3>

    <!-- 一括有効化スイッチ -->
    {#if settings.diceRolls && settings.diceRolls.length > 0}
      <div class="flex items-center justify-between space-x-2">
        <Label for="diceRolls" class="flex flex-col space-y-1">
          ダイスロールを有効にする
        </Label>
        <Switch 
          id="diceRolls"
          checked={hasActiveDice} 
          onCheckedChange={setAllDiceStatus}
        />
      </div>
    {/if}
<!-- 複数ダイスを辞めてみる
        <Button variant="outline" size="sm" onclick={addDiceRoll}>
          <Plus class="h-4 w-4 mr-2" /> 追加
        </Button>-->
    
    <!-- ダイス設定リスト -->
    {#if settings.diceRolls && settings.diceRolls.length > 0}
      <div class="space-y-4">
        {#each settings.diceRolls as dice (dice.id)}
          <div class="flex items-center gap-4">
            <!-- 複数ダイスを辞めてみる
            <div class="flex items-center justify-center w-8">
              <Checkbox bind:checked={dice.isEnabled} />
            </div>
            -->

            <!-- 名前と設定値の入力エリア -->
            <div class="flex-1 flex items-center gap-4 min-w-0">
                <Input 
                  type="text" 
                  class="flex-1 bg-background min-w-0"
                  bind:value={dice.instructionText} 
                  placeholder="例: 1d6" 
                />
                
                <div class="flex items-center gap-2 shrink-0">
                  <Input 
                    type="number" 
                    class="w-16 bg-background px-2"
                    min="1" 
                    bind:value={dice.diceCount} 
                  />
                  <span class="text-sm text-muted-foreground font-medium">d</span>
                  <Input 
                    type="number" 
                    class="w-16 bg-background  px-2"
                    min="2" 
                    bind:value={dice.diceType} 
                  />
                </div>
            </div>

            <!-- 複数ダイスを辞めてみる
            <div class="flex items-center gap-2 shrink-0">
                <Button variant="ghost" size="icon" onclick={() => removeDiceRoll(dice.id)} title="削除">
                  <Trash2 class="size-4" />
                </Button>
            </div>
            -->

          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- マーカー設定セクション -->
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <Label>ダイス結果を独立したパートとして送信</Label>
      <Switch bind:checked={settings.diceRollMarkers.useMultipart} />
    </div>
    {#if settings.diceRollMarkers}
      <div class="flex items-center justify-between">
        <Label>マーカー機能の有効化</Label>
        <Switch bind:checked={settings.diceRollMarkers.isEnabled} />
      </div>

               <div class=" gap-6 pl-4 transition-opacity duration-200 {settings.diceRollMarkers.isEnabled ? '' : 'opacity-50 pointer-events-none'}">

               <div class="flex items-center justify-between space-x-2">

                  <Label class="text-xs text-muted-foreground w-24">開始マーカー</Label>
                  <Input class="bg-background w-full" bind:value={settings.diceRollMarkers.start} />
              </div>
              <div class="flex items-center justify-between space-x-2">
                  <Label class="text-xs text-muted-foreground w-24">終了マーカー</Label>
                  <Input class="bg-background w-full" bind:value={settings.diceRollMarkers.end} />
              </div>
          </div>

    {/if}                  
</div>
</div>
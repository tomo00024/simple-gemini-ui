<script lang="ts">
  import * as Drawer from "$lib/components/ui/drawer";
  import { Button } from "$lib/components/ui/button";
  import { Cpu, User, Bot, Dices, ChevronUp, ChevronDown } from "lucide-svelte";
  import { appSettings } from "$lib/settings.svelte";

  let { open = $bindable(false) } = $props<{ open: boolean }>();

  function toggleSetting(key: 'systemPrompt' | 'dummyUserPrompt' | 'dummyModelPrompt') {
    const config = appSettings.value[key];
    config.isEnabled = !config.isEnabled;
    appSettings.save();
  }
   // 1. ダイスが有効かどうか判定する (Svelte 5のderivedを使用)
  // ダイス設定配列の中に1つでもisEnabledがtrueのものがあれば「ON」とみなす
  let isDiceEnabled = $derived(
    appSettings.value.diceRolls?.some((d: any) => d.isEnabled) ?? false
  );

  // 2. ダイスを一括切り替えする関数 (Drawer専用)
  function toggleDice() {
    if (!appSettings.value.diceRolls) return;

    // 今の状態を反転
    const newState = !isDiceEnabled;
    
    // 全てのダイス設定を上書き
    appSettings.value.diceRolls.forEach((d: any) => {
      d.isEnabled = newState;
    });
    
    appSettings.save();
  }

  // 3. スクロール位置を移動する関数
  function scrollToTop() {
    const viewport = document.querySelector('[data-slot="scroll-area-viewport"]');
    if (viewport) {
      viewport.scrollTop = 0;
    }
    open = false;
  }

  function scrollToBottom() {
    const viewport = document.querySelector('[data-slot="scroll-area-viewport"]');
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
    open = false;
  }
</script>

<Drawer.Root bind:open>
  <Drawer.Content>
    <div class="mx-auto w-full max-w-md">
      <Drawer.Header>
        <Drawer.Title>クイックメニュー</Drawer.Title>
      </Drawer.Header>

      <div class="p-4 pt-0">
        <div class="grid grid-cols-4 gap-4">
          <!-- 1. システムプロンプト -->
 <Button
            variant="ghost"
            class={[
              "h-auto flex-col gap-2",
              appSettings.value.systemPrompt.isEnabled 
                ? "border-foreground text-foreground" 
                : "border-transparent text-muted-foreground opacity-50"
            ].join(" ")}
            onclick={() => toggleSetting('systemPrompt')}
          >
            <div class="rounded-full bg-background p-1">
              <Cpu class="h-10! w-10!" />
            </div>
            <span class="text-xs font-medium text-center leading-tight">System<br/>Prompt</span>
          </Button>

          <!-- 2. ダミーユーザー -->
          <Button
            variant="ghost"
            class={[
              "h-auto flex-col gap-2",
              appSettings.value.dummyUserPrompt.isEnabled 
                ? "border-foreground text-foreground" 
                : "border-transparent text-muted-foreground opacity-50"
            ].join(" ")}
            onclick={() => toggleSetting('dummyUserPrompt')}
          >
            <div class="rounded-full bg-background p-1">
              <User class="h-10! w-10!" />
            </div>
            <span class="text-xs font-medium text-center leading-tight">Dummy<br/>User</span>
          </Button>

          <!-- 3. ダミーモデル -->
          <Button
            variant="ghost"
            class={[
              "h-auto flex-col gap-2",
              appSettings.value.dummyModelPrompt.isEnabled 
                ? "border-foreground text-foreground" 
                : "border-transparent text-muted-foreground opacity-50"
            ].join(" ")}
            onclick={() => toggleSetting('dummyModelPrompt')}
          >
            <div class="rounded-full bg-background p-1">
              <Bot class="h-10! w-10!" />
            </div>
            <span class="text-xs font-medium text-center leading-tight">Dummy<br/>Model</span>
          </Button>
           <Button
            variant="ghost"
            class={[
              "h-auto flex-col gap-2",
              isDiceEnabled // ONなら色をつける
                ? "border-foreground text-foreground" 
                : "border-transparent text-muted-foreground opacity-50"
            ].join(" ")}
            onclick={toggleDice}
          >
            <div class="rounded-full bg-background p-1">
              <Dices class="h-10! w-10!" />
            </div>
            <span class="text-xs font-medium text-center leading-tight">Dice<br/>Roll</span>
          </Button>

          <!-- 5. 一番上に移動 -->
          <Button
            variant="ghost"
            class="h-auto flex-col gap-2 border-transparent text-muted-foreground opacity-50"
            onclick={scrollToTop}
          >
            <div class="rounded-full bg-background p-1">
              <ChevronUp class="h-10! w-10!" />
            </div>
            <span class="text-xs font-medium text-center leading-tight">Scroll<br/>Top</span>
          </Button>

          <!-- 6. 一番下に移動 -->
          <Button
            variant="ghost"
            class="h-auto flex-col gap-2 border-transparent text-muted-foreground opacity-50"
            onclick={scrollToBottom}
          >
            <div class="rounded-full bg-background p-1">
              <ChevronDown class="h-10! w-10!" />
            </div>
            <span class="text-xs font-medium text-center leading-tight">Scroll<br/>Bottom</span>
          </Button>
        </div>
      </div>
    </div>
  </Drawer.Content>
</Drawer.Root>
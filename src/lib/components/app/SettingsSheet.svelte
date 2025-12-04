<script lang="ts">
  import { Settings2 } from "lucide-svelte";
  import { Button, buttonVariants } from "$lib/components/ui/button";
  import * as Tabs from "$lib/components/ui/tabs";
  import { 
    Sheet, 
    SheetContent, 
    SheetHeader, 
    SheetTitle, 
    SheetTrigger, 
    SheetDescription 
  } from "$lib/components/ui/sheet";
  
  import type { AppSettings } from "$lib/types";

  // 子コンポーネント
  import ApiSettings from "../settings/ApiSettings.svelte";
  import DiceSettings from "../settings/DiceSettings.svelte";
  import GenerationSettings from "../settings/GenerationSettings.svelte";
  import InterfaceSettings from "../settings/InterfaceSettings.svelte";
  import UsageSettings from "../settings/UsageSettings.svelte";
  import AccountSettings from "../settings/AccountSettings.svelte";

  let { settings = $bindable(), open = $bindable(false) } = $props<{ 
    settings: AppSettings, 
    open?: boolean 
  }>();

  function handleSave() {
    console.log("Saving settings...", settings);
    open = false;
  }
</script>

<Sheet bind:open>
  <SheetTrigger class={buttonVariants({ variant: "ghost", size: "icon" })}>
    <Settings2 class="h-5 w-5" />
  </SheetTrigger>
  

<SheetContent side="right" class="
  w-screen max-w-none sm:max-w-[600px] h-dvh
  flex flex-col gap-0 p-0 border-none shadow-none bg-background z-50
  outline-none
">
    
    <Tabs.Root value="api" class="flex flex-col h-full w-full">
        
        <SheetHeader class="border-b px-4 py-2 shrink-0 border-muted-foreground/60 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 text-left space-y-0">
          <div class="flex flex-col sm:flex-row items-center justify-between gap-1">
            <SheetTitle class="text-lg font-semibold shrink-0 mt-1">設定</SheetTitle>
            
            <Tabs.List class="w-full sm:w-auto overflow-x-auto flex justify-start sm:justify-end -mx-4 px-4 sm:mx-0 sm:pl-4 sm:pr-12 no-scrollbar">
                <Tabs.Trigger value="api">API・モデル</Tabs.Trigger>
                <Tabs.Trigger value="generation">生成</Tabs.Trigger>
                <Tabs.Trigger value="interface">UI</Tabs.Trigger>
                <Tabs.Trigger value="dice">簡易機能</Tabs.Trigger>
                <Tabs.Trigger value="usage">使用量</Tabs.Trigger>
                <Tabs.Trigger value="account">アカウント</Tabs.Trigger>
            </Tabs.List>
          </div>
        </SheetHeader>
        
        <div class="flex-1 overflow-y-auto bg-background/10 p-4 sm:p-6 -mt-2">
          <div class="mx-auto max-w-3xl pb-10">
            <SheetDescription class="sr-only">設定を変更します</SheetDescription>
            
            <Tabs.Content value="api" class="mt-0 outline-none">
                <ApiSettings bind:settings />
            </Tabs.Content>

            <Tabs.Content value="generation" class="mt-0 outline-none">
                <GenerationSettings bind:settings />
            </Tabs.Content>

            <Tabs.Content value="interface" class="mt-0 outline-none">
                <InterfaceSettings bind:settings />
            </Tabs.Content>

            <Tabs.Content value="dice" class="mt-0 outline-none">
                <DiceSettings bind:settings />
            </Tabs.Content>

            <Tabs.Content value="usage" class="mt-0 outline-none">
                <UsageSettings bind:settings />
            </Tabs.Content>

            <Tabs.Content value="account" class="mt-0 outline-none">
                <AccountSettings bind:settings />
            </Tabs.Content>

          </div>
        </div>

    </Tabs.Root>

  </SheetContent>
</Sheet>
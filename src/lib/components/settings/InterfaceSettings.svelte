<script lang="ts">
  import { Label } from "$lib/components/ui/label";
  import { Switch } from "$lib/components/ui/switch";
  import { Input } from "$lib/components/ui/input";
  import * as Select from "$lib/components/ui/select";
  
  import { FONT_FAMILY_OPTIONS } from "$lib/constants";
  import type { AppSettings } from "$lib/types";

  let { settings = $bindable() } = $props<{ settings: AppSettings }>();
</script>

<div class="space-y-8">
    <div class="space-y-8">
       <h3 class="font-medium text-lg border-b border-muted-background">基本表示設定</h3>
       <div class="grid gap-6">
           <div class="flex items-center justify-between space-x-2">
               <Label for="showTokenCount">トークン数を表示</Label>
               <Switch id="showTokenCount" bind:checked={settings.ui.showTokenCount} />
           </div>
           
           <div class="flex items-center justify-between space-x-2">
               <div class="space-y-1">
                   <Label for="enterToSend">Enterキーで送信</Label>
               </div>
               <Switch id="enterToSend" bind:checked={settings.ui.enterToSend} />
           </div>
<!-- 
           <div class="flex items-center justify-between space-x-2">
               <Label for="showSpeakerName">話者名を表示</Label>
               <Switch id="showSpeakerName" bind:checked={settings.ui.showSpeakerNameInTranscript} />
           </div>
-->
           <!-- フォント設定エリア -->
           <div class="space-y-3">
               <!-- スイッチ行 -->
               <div class="flex items-center justify-between space-x-2">
                   <Label for="customFont">フォント・文字サイズをカスタマイズ</Label>
                   <Switch id="customFont" bind:checked={settings.ui.useCustomFontSize} />
               </div>

               <div class="grid grid-cols-2 gap-6 pl-4 transition-opacity duration-200 {settings.ui.useCustomFontSize ? '' : 'opacity-50 pointer-events-none'}">
                    <!-- 文字サイズ設定 (インデントなし) -->
               <div class="flex items-center justify-between space-x-2">
                   <Label for="chatFontSize">文字サイズ</Label>
                   <Input 
                        id="chatFontSize"
                        type="number" 
                        class="bg-background w-24"
                        bind:value={settings.ui.chatFontSize} 
                    />    
               </div>
                   <!-- フォント選択 (幅を自動で埋める) -->
                    <div class="flex items-center justify-between space-x-2">
                   <div class="space-y-1">
                       <Label class="w-16">フォント</Label>
                   </div>
                   
                   <Select.Root type="single" bind:value={settings.ui.fontFamily}>
                       <Select.Trigger class="w-48">
                           {FONT_FAMILY_OPTIONS.find(f => f.id === settings.ui.fontFamily)?.label ?? "標準"}
                       </Select.Trigger>
                       <Select.Content>
                           {#each FONT_FAMILY_OPTIONS as font}
                               <Select.Item value={font.id} label={font.label}>
                                   <span style="font-family: {font.value};">
                                       {font.label}
                                   </span>
                               </Select.Item>
                           {/each}
                       </Select.Content>
                   </Select.Root>
               </div>

              
               </div>
           </div>
       </div>
    </div>

    <div class="space-y-6">

       <!--
       <div class="space-y-4">
           <div class="flex items-center justify-between space-x-2">
                <Label for="summarize" class="flex flex-col space-y-1">
                   トークン超過時の自動要約
               </Label>
               <Switch id="summarize" bind:checked={settings.assist.summarizeOnTokenOverflow} />
           </div>
           <div class="flex items-center justify-between space-x-2">
                <Label>要約開始しきい値 (Tokens)</Label>
                <Input type="number" class="bg-background w-24" bind:value={settings.assist.tokenThreshold} />
           </div>
       </div>-->
    </div>
    
</div>
<script lang="ts">
  import { Plus, Trash2, RefreshCw, Loader2, Circle, CircleCheckBig } from "lucide-svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Switch } from "$lib/components/ui/switch";
  import { Slider } from "$lib/components/ui/slider";
  import { Checkbox } from "$lib/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "$lib/components/ui/radio-group";
  import { Select, SelectContent, SelectItem, SelectTrigger } from "$lib/components/ui/select";
  
  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
  } from "$lib/components/ui/alert-dialog";
  
  import type { AppSettings, ApiKey } from "$lib/types";
  import { GoogleGenAI } from "@google/genai";

  let { settings = $bindable() } = $props<{ settings: AppSettings }>();
  let isRefreshing = $state(false);

  function generateId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

function addApiKey() {
    const newId = generateId();

    // 既存の名前から "API Key " の後ろの数字を抽出して最大値を探す
    const baseName = "Key"; // ここを変えたい名称にする
    
    // Fix: Explicitly type 'max' as number and 'key' as ApiKey
    const maxNum = settings.apiKeys.reduce((max: number, key: ApiKey) => {
      // 正規表現で "API Key " + 数字 の形式にマッチするか確認
      const match = key.name.match(new RegExp(`^${baseName}\\s*(\\d+)$`));
      if (match) {
        const num = parseInt(match[1], 10);
        return num > max ? num : max;
      }
      return max;
    }, 0);

    const newName = `${baseName} ${maxNum + 1}`;

    const newKey = { id: newId, name: newName, key: "" };
    settings.apiKeys = [...settings.apiKeys, newKey];
    if (settings.apiKeys.length === 1) settings.activeApiKeyId = newId;
  }
  
  function removeApiKey(id: string) {
    settings.apiKeys = settings.apiKeys.filter((k: ApiKey) => k.id !== id);
    if (settings.activeApiKeyId === id) {
        settings.activeApiKeyId = settings.apiKeys[0]?.id || null;
    }
  }

  function setActiveKey(id: string) {
    settings.activeApiKeyId = id;
  }

  async function refreshModels() {
    const activeKey = settings.apiKeys.find((k: ApiKey) => k.id === settings.activeApiKeyId)?.key;
    if (!activeKey) {
      alert("APIキーが選択されていません。");
      return;
    }
    isRefreshing = true;
    try {
      const ai = new GoogleGenAI({ apiKey: activeKey });
      const listResponse = await ai.models.list();
      const foundModels: string[] = [];
      for await (const model of listResponse) {
        const m = model as any; 
        if (m.name?.toLowerCase().includes("gemini")) {
          foundModels.push(m.name.replace(/^models\//, ""));
        }
      }
      foundModels.sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }));
      if (foundModels.length > 0) {
        settings.availableModelList = foundModels;
        if (!foundModels.includes(settings.model)) settings.model = foundModels[0];
      } else {
        alert("Geminiモデルが見つかりませんでした。");
      }
    } catch (e) {
      alert(`モデルリスト取得失敗: ${e instanceof Error ? e.message : "不明なエラー"}`);
    } finally {
      isRefreshing = false;
    }
  }
</script>

<div class="space-y-8">
<!-- APIキー管理 -->
    <div class="space-y-4">
        <div class="flex items-center justify-between border-b border-muted-background">
            <h3 class="font-medium text-lg">APIキー管理</h3>
            <Button variant="outline" size="sm" onclick={addApiKey}>
                <Plus class="h-4 w-4 mr-2" /> 追加
            </Button>
        </div>

<RadioGroup bind:value={settings.activeApiKeyId} class="space-y-2">
    {#each settings.apiKeys as apiKey (apiKey.id)}
        <div class="flex items-center gap-4">
            <Label
                for={apiKey.id}
                class="flex h-8 w-15 cursor-pointer items-center justify-center transition-colors"
            >
                <!-- RadioGroupItem自体は非表示にし、Labelとの連携のみに利用 -->
                <RadioGroupItem value={apiKey.id} id={apiKey.id} class="sr-only" />

                <!-- bind:valueの値と現在のアイテムのidを比較してアイコンを切り替え -->
                {#if settings.activeApiKeyId === apiKey.id}
                    <CircleCheckBig class="size-5 text-primary" />
                {:else}
                    <Circle class="size-5 text-muted-foreground" />
                {/if}
            </Label>

            <Input
                bind:value={apiKey.name}
                class="h-9 w-1/3 bg-background"
                placeholder="キーの名前"
            />
            <Input
                bind:value={apiKey.key}
                type="password"
                class="h-9 flex-1 bg-background font-mono"
                placeholder="sk-..."
            />

            <AlertDialog>
                <AlertDialogTrigger>
                    {#snippet child({ props })}
                        <Button variant="ghost" size="icon" {...props}>
                            <Trash2 class="size-4" />
                        </Button>
                    {/snippet}
                </AlertDialogTrigger>
  <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>本当に削除しますか？</AlertDialogTitle>
                            <AlertDialogDescription>
                                この操作は取り消せません。<br>
                                APIキー「<span class="font-mono text-foreground">{apiKey.name}</span>」をリストから完全に削除します。
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>キャンセル</AlertDialogCancel>
                            <AlertDialogAction onclick={() => removeApiKey(apiKey.id)}>
                                削除
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        {/each}
    </RadioGroup>

        {#if settings.apiKeys.length === 0}
            <div class="p-2 text-center border border-dashed rounded-md text-muted-foreground">
                <p class="text-sm">APIキーが設定されていません</p>
                <Button variant="link" size="sm" onclick={addApiKey}>新しいキーを追加する</Button>
            </div>
        {/if}
    </div>

  <!-- モデル設定 -->
  <div class="space-y-4">
    <h3 class="font-medium text-lg border-b border-muted-background">モデル設定</h3>
    <div class="grid gap-4">
      <div class="flex items-center gap-4">
        <div class="flex-1">
          <Select type="single" bind:value={settings.model}>
            <SelectTrigger class="w-full">
              {settings.model}
            </SelectTrigger>
            <SelectContent class="max-h-[300px]"> 
              {#each settings.availableModelList as model}
                <SelectItem value={model} label={model}>{model}</SelectItem>
              {/each}
            </SelectContent>
          </Select>
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          onclick={refreshModels} 
          disabled={isRefreshing}
        >
          {#if isRefreshing}
            <Loader2 class="h-4 w-4 animate-spin" />
          {:else}
            <RefreshCw class="h-4 w-4" />
          {/if}
        </Button>
      </div>
    </div>
  </div>

  <!-- リトライ設定 -->
  <div class="space-y-6">
    <h3 class="font-medium text-lg border-b border-muted-background">リトライ設定</h3>
    <div class="grid gap-6 ">
       <div class="flex items-center justify-between">
           <Label for="auto-rotate-switch" class="cursor-pointer ">
             429エラー時のキーローテーション
           </Label>
           <Switch 
             id="auto-rotate-switch"
             bind:checked={settings.apiErrorHandling.loopApiKeys} 
           />
       </div>
          <div class="flex items-center justify-between">
      <Label for="retry-enabled-switch" class="cursor-pointer">
        自動リトライを有効にする(指数バックオフ)
      </Label>
      <Switch 
        id="retry-enabled-switch"
        bind:checked={settings.apiErrorHandling.exponentialBackoff} 
      />
    </div>

    <!-- リトライ有効時の詳細設定 -->
               <div class="grid grid-cols-2 gap-4 pl-4 transition-opacity duration-200 {settings.apiErrorHandling.exponentialBackoff ? '' : 'opacity-50 pointer-events-none'}">
    <!-- 左側: 最大リトライ回数 -->
               <div class="flex items-center justify-between space-x-2">
      <Label for="max-retries" class="whitespace-nowrap">最大リトライ回数</Label>
      <Input 
        id="max-retries"
        type="number" 
        min="1" 
        max="10"
        class="bg-background w-24"
        bind:value={settings.apiErrorHandling.maxRetries} 
      />
    </div>

    <!-- 右側: 初回待機時間 -->
               <div class="flex items-center justify-between space-x-2">
      <Label for="initial-wait" class="whitespace-nowrap">初回待機時間 (ms)</Label>
      <Input 
        id="initial-wait"
        type="number" 
        min="100" 
        step="100"
        class="bg-background flex-1"
        bind:value={settings.apiErrorHandling.initialWaitTime} 
        placeholder="例: 3000"
      />
    </div>
  </div>
    </div>
  </div>
 
</div>

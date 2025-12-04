<script lang="ts">
  import { onMount } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import { Switch } from "$lib/components/ui/switch";
  import { Input } from "$lib/components/ui/input";
  import * as Select from "$lib/components/ui/select";
  import type { AppSettings } from "$lib/types";
  import { TokenCostService } from "$lib/services/token-cost";
  import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "$lib/components/ui/alert-dialog";
  import { ExchangeRateService } from "$lib/services/exchange-rate"; 

  let { settings = $bindable() } = $props<{ settings: AppSettings }>();
let isAlertOpen = $state(false);
  // --- State ---
  let selectedModel = $state("all");
  let selectedRange = $state<"today" | "week" | "month" | "all">("today");
  let stats = $state<Awaited<ReturnType<typeof TokenCostService.getStats>> | null>(null);

  // 初期値は "全てのモデル" のみ。mount時にDBから取得して追加
  let modelOptions = $state<{ value: string; label: string }[]>([
    { value: "all", label: "全てのモデル" }
  ]);

  let currentCurrency = $derived(settings.currency ?? "USD");
  let currentRate = $derived(settings.exchangeRate ?? 153.5);

  const rangeOptions = [
    { value: "today", label: "今日" },
    { value: "week", label: "過去7日間" },
    { value: "month", label: "過去30日間" },
    { value: "all", label: "全期間" }
  ];

  // --- Actions ---

  async function loadStats() {
    stats = await TokenCostService.getStats(selectedRange, selectedModel);
  }

  // マウント時にモデル一覧を取得
  onMount(async () => {
    await ExchangeRateService.updateIfNeeded(settings);

    // 1. 履歴にあるモデルIDを取得
    const existingModels = await TokenCostService.getExistingModels();
    
    // 2. そのまま選択肢にする (整形なし)
    const dynamicOptions = existingModels.map(modelId => ({
      value: modelId,
      label: modelId 
    }));

    // 3. "All" と結合
    modelOptions = [
      { value: "all", label: "全てのモデル" },
      ...dynamicOptions
    ];

    await loadStats();
  });

  // フィルタ変更時に再ロード
  $effect(() => {
    loadStats();
  });

async function handleClearHistory() {
    await TokenCostService.clearAll();
    
    // 履歴削除後はモデルリストもリセット
    modelOptions = [{ value: "all", label: "全てのモデル" }];
    selectedModel = "all";
    await loadStats();

    // 追加: 処理完了後にダイアログを閉じる
    isAlertOpen = false;
  }
function formatCost(costUSD: number) {
    if (currentCurrency === "JPY") {
      const jpy = costUSD * currentRate;
      // JPYの場合: 100円を超えたら小数は不要、それ以下なら2桁まで表示など
      const isLargeJpy = jpy >= 100;
      return `¥${jpy.toLocaleString(undefined, { 
        maximumFractionDigits: isLargeJpy ? 0 : 2 
      })}`;
    }
    
    // USDの場合
    // 1ドル以上のときは、通常の通貨形式 (小数点2桁固定)
    // 1ドル未満のときは、細かい数値が見えるように (最大6桁)
    const isLargeUsd = costUSD >= 1;

    return `$${costUSD.toLocaleString(undefined, { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: isLargeUsd ? 2 : 4 
    })}`;
  }
</script>

<div class="space-y-8">
  <!-- 使用量通知 -->
  <div class="space-y-6">
    <h3 class="font-medium text-lg border-b border-muted-background">使用量通知</h3>
    <div class="grid gap-6 sm:grid-cols-2">
      {#if settings.tokenUsageAlert}
        <div class="flex items-center justify-between space-x-2">
          <Label for="alertEnabled">1日の使用料がしきい値を超えた際に通知</Label>
          <Switch id="alertEnabled" bind:checked={settings.tokenUsageAlert.isEnabled} />
        </div>
        <div class="flex items-center justify-between space-x-2">
          <Label>通知しきい値 (USD)</Label>
          <Input
            type="number"
            class="w-24"
            step="0.01"
            bind:value={settings.tokenUsageAlert.thresholdUSD}
          />
        </div>
      {/if}
    </div>
  </div>

  <!-- トークン使用履歴 -->
  <div class="space-y-6">
    <h3 class="font-medium text-lg border-b border-muted-background">トークン使用履歴</h3>
    <div class="flex flex-col gap-4">
      <!-- 1行目: 通貨設定 -->
<div class="flex items-center justify-between">
        
        <!-- 左側: ラベルとレート -->
        <div class="flex items-center gap-4">
          <Label>表示通貨</Label>
          <p class="text-muted-foreground">
              USD/JPY = {settings.exchangeRate ?? 153.5} 
          </p>
        </div>
        
        <!-- 右側: 通貨選択エリア -->
        <div class="flex gap-2">
             {#if currentCurrency === 'JPY'}
                <Input type="number" class="w-24 text-right" bind:value={settings.exchangeRate} placeholder="Rate" />
             {/if}

            <Select.Root type="single" bind:value={settings.currency}>
            <Select.Trigger class="w-24">
                {settings.currency ?? "通貨を選択"}
            </Select.Trigger>
            <Select.Content>
                <Select.Item value="USD" label="USD">USD</Select.Item>
                <Select.Item value="JPY" label="JPY">JPY</Select.Item>
            </Select.Content>
            </Select.Root>
        </div>
      </div>
      <!-- 2行目: フィルタリング -->
      <div class="flex items-center justify-between space-x-2">
        <Select.Root type="single" bind:value={selectedModel}>
          <Select.Trigger class="w-full">
            <!-- ラベル表示ロジック: 一致するものがなければ値をそのまま表示 -->
            {modelOptions.find((o) => o.value === selectedModel)?.label ?? selectedModel}
          </Select.Trigger>
          <Select.Content>
            {#each modelOptions as option}
              <Select.Item value={option.value} label={option.label}
                >{option.label}</Select.Item
              >
            {/each}
          </Select.Content>
        </Select.Root>
        
        <Select.Root type="single" bind:value={selectedRange}>
          <Select.Trigger class="w-full">
            {rangeOptions.find((o) => o.value === selectedRange)?.label ?? "期間選択"}
          </Select.Trigger>
          <Select.Content>
            {#each rangeOptions as option}
              <Select.Item value={option.value} label={option.label}
                >{option.label}</Select.Item
              >
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
    </div>

    <!-- 集計カード -->
    {#if stats}
      <div class="rounded-lg border border-border bg-card p-4">
        <div class="mb-4 flex items-baseline justify-between">
          <div class="text-sm font-medium text-muted-foreground">
            集計期間: <span class="text-foreground">{stats.periodLabel}</span>
          </div>
          <div class="text-right">
            <span class="text-sm text-muted-foreground">概算費用:</span>
            <span class="ml-2 text-xl font-bold text-foreground">
              {formatCost(stats.estimatedCostUSD)}
            </span>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <!-- 入力 -->
          <div class="rounded-md p-3">
            <div class="text-xs text-muted-foreground">入力</div>
            <div class="mt-1 text-lg font-semibold text-foreground">
              {stats.input.toLocaleString()}
            </div>
          </div>
          <!-- 出力 -->
          <div class="rounded-md p-3">
            <div class="text-xs text-muted-foreground">出力 (うち思考)</div>
            <div class="mt-1 text-lg font-semibold text-foreground">
              {stats.output.toLocaleString()}
              <span class="ml-0.5 text-sm font-normal opacity-80">
                ({stats.thinking.toLocaleString()})
              </span>
            </div>
          </div>
          <!-- キャッシュ -->
          <div class="relative overflow-hidden rounded-md p-3">
            <div class="text-xs text-muted-foreground">入力キャッシュ (割合)</div>
            <div class="mt-1 text-lg font-semibold text-foreground">
              {stats.cached.toLocaleString()}
              <span class="ml-0.5 text-sm font-normal opacity-80">
                ({stats.cacheRate.toFixed(1)}%)
              </span>
            </div>
          </div>
          <!-- 内訳金額 -->
          <div class="rounded-md p-3">
            <div class="text-xs text-muted-foreground">入力/出力 (金額)</div>
            <div class="mt-1 text-base font-semibold text-foreground">
              {formatCost(stats.inputCost + stats.cacheCost)} / {formatCost(stats.outputCost)}
            </div>
          </div>
        </div>
      </div>
    {:else}
      <div class="p-4 text-center text-sm text-muted-foreground">データ読み込み中...</div>
    {/if}

    <div class="rounded-lg text-xs text-muted-foreground bg-muted/50 p-3">
      <p class="mb-1">
        <span class="font-bold text-muted-foreground">● 注意:</span>
        金額は2025年11月30日時点の公式価格に基づく概算であり、実際の請求額を保証するものではありません。
        レート制限(RPM)の計算とは異なり、ここでのコスト計算にはキャッシュ割引が適用されています。
      </p>
      <p class="mb-1">
        <span class="font-bold text-muted-foreground">● 200kティア:</span>
        Gemini Proモデルで入力プロンプトが200kトークンを超えた場合、そのリクエスト全体（入力・出力・キャッシュ）に対し高い単価レートが適用されて計算されています。
      </p>
    </div>
    <div class="flex justify-end">
<AlertDialog bind:open={isAlertOpen}>
  <AlertDialogTrigger>
    {#snippet child({ props })}
       <Button variant="destructive" {...props}>履歴を削除</Button>
    {/snippet}
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>本当に削除しますか？</AlertDialogTitle>
      <AlertDialogDescription>
        この操作は取り消せません。<br>
        トークン使用履歴を完全に削除します。
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>キャンセル</AlertDialogCancel>
      <AlertDialogAction onclick={handleClearHistory}>
        削除
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
</div>    </div>
</div>
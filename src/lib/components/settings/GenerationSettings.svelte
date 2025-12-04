<script lang="ts">
  import { Label } from "$lib/components/ui/label";
  import { Switch } from "$lib/components/ui/switch";
  import { Input } from "$lib/components/ui/input";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Button } from "$lib/components/ui/button";
  import * as Select from "$lib/components/ui/select";
  import { Plus, Copy, Trash2 } from "lucide-svelte";
  import type { AppSettings, PromptPreset, TemplatePromptConfig } from "$lib/types";

  let { settings = $bindable() } = $props<{ settings: AppSettings }>();

  // 操作対象の識別用型
  type PromptType = 'system' | 'user' | 'model';

  // ID生成
  function generateId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }

  // --- ヘルパー関数: タイプに応じた設定オブジェクトを取得 ---
  function getConfig(type: PromptType): TemplatePromptConfig {
    switch (type) {
      case 'user': return settings.dummyUserPrompt;
      case 'model': return settings.dummyModelPrompt;
      case 'system': default: return settings.systemPrompt;
    }
  }

   // --- 1. システムプロンプト用の状態 ---
  let systemPresets = $derived(Array.isArray(settings.systemPrompt.presets) ? settings.systemPrompt.presets : []);
  let activeSystemPresetIndex = $derived(
    systemPresets.findIndex((p: PromptPreset) => p.id === settings.systemPrompt.activePresetId)
  );
  let activeSystemPreset = $derived(
    activeSystemPresetIndex !== -1 ? systemPresets[activeSystemPresetIndex] : undefined
  );

  // --- 2. ダミーユーザープロンプト用の状態 (追加) ---
  let dummyUserPresets = $derived(Array.isArray(settings.dummyUserPrompt.presets) ? settings.dummyUserPrompt.presets : []);
  let activeDummyUserPresetIndex = $derived(
    dummyUserPresets.findIndex((p: PromptPreset) => p.id === settings.dummyUserPrompt.activePresetId)
  );
  let dummyUserPreset = $derived(
    activeDummyUserPresetIndex !== -1 ? dummyUserPresets[activeDummyUserPresetIndex] : undefined
  );

  // --- 3. ダミーモデルプロンプト用の状態 (追加) ---
  let dummyModelPresets = $derived(Array.isArray(settings.dummyModelPrompt.presets) ? settings.dummyModelPrompt.presets : []);
  let activeDummyModelPresetIndex = $derived(
    dummyModelPresets.findIndex((p: PromptPreset) => p.id === settings.dummyModelPrompt.activePresetId)
  );
  let dummyModelPreset = $derived(
    activeDummyModelPresetIndex !== -1 ? dummyModelPresets[activeDummyModelPresetIndex] : undefined
  );


  // --- アクション関数 ---

  // 新規プリセット作成
  function addPreset(type: PromptType) {
    const config = getConfig(type);
    if (!Array.isArray(config.presets)) config.presets = [];

    const newId = generateId();
    const newPreset: PromptPreset = {
      id: newId,
      title: "新規プロンプト",
      text: ""
    };
    
    config.presets = [...config.presets, newPreset];
    config.activePresetId = newId;
  }

  // 複製
  function duplicatePreset(type: PromptType) {
    const config = getConfig(type);
    const presets = Array.isArray(config.presets) ? config.presets : [];
    const activeItem = presets.find(p => p.id === config.activePresetId);

    if (!activeItem) return;

    const newId = generateId();
    const newPreset: PromptPreset = {
      id: newId,
      title: activeItem.title + " (コピー)",
      text: activeItem.text
    };
    
    config.presets = [...config.presets, newPreset];
    config.activePresetId = newId;
  }

  // 削除
  function deletePreset(type: PromptType) {
    const config = getConfig(type);
    const currentPresets = Array.isArray(config.presets) ? config.presets : [];
    
    // 現在選択中のプリセットを取得
    const activeItem = currentPresets.find(p => p.id === config.activePresetId);

    // 残り1つなら削除せずクリア
    if (currentPresets.length <= 1) {
      if (activeItem) {
        activeItem.text = "";
        activeItem.title = "Default";
      }
      return;
    }

    // 削除実行
    const newPresets = currentPresets.filter(p => p.id !== config.activePresetId);
    config.presets = newPresets;

    // 削除後の選択ロジック
    if (newPresets.length > 0) {
      config.activePresetId = newPresets[0].id;
    } else {
      config.activePresetId = "";
    }
  }

  // スイッチ切り替え時のハンドラ
  function onEnableChange(checked: boolean, type: PromptType) {
    const config = getConfig(type);
    config.isEnabled = checked;
    
    if (checked) {
      const currentPresets = config.presets ?? [];
      if (!Array.isArray(currentPresets) || currentPresets.length === 0) {
        addPreset(type);
      } else {
        const isValidId = currentPresets.some(p => p.id === config.activePresetId);
        if (!isValidId) {
            config.activePresetId = currentPresets[0].id;
        }
      }
    }
  }
</script>

{#snippet promptEditor(
  label: string, 
  type: PromptType, 
  config: TemplatePromptConfig, 
  presets: PromptPreset[], 
  activePreset: PromptPreset | undefined,
  placeholder: string
)}
  <div class="space-y-6">
    <!-- ヘッダー行 -->
    <div class="flex items-center justify-between">
      <Label>{label}有効化</Label>
      <Switch 
        checked={config.isEnabled} 
        onCheckedChange={(checked) => onEnableChange(checked, type)} 
      />
    </div>

    {#if config.isEnabled}
      <div class="space-y-4">
        <!-- 選択＆追加行 -->
        <div class="flex items-center gap-4">
          <div class="flex-1 w-0">
            <Select.Root type="single" bind:value={config.activePresetId}>
              <Select.Trigger class="w-full">
                <span class="truncate text-left flex-1 min-w-0">
                  {activePreset?.title ?? "プリセットを選択"}
                </span>
              </Select.Trigger>
              <Select.Content>
                {#each presets as preset (preset.id)}
                  <Select.Item value={preset.id} label={preset.title}>{preset.title}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
          <!-- Systemプロンプトのデザインに合わせて「追加」テキスト付きボタンに統一 -->
          <Button variant="outline" size="sm" onclick={() => addPreset(type)} title="新規プリセット作成">
            <Plus class="h-4 w-4 mr-2" /> 追加
          </Button>
        </div>

        <!-- 編集エリア（カード形式） -->
        {#if activePreset}
          <div class="flex flex-col rounded-md border border-input bg-background">
            <!-- ヘッダー：タイトル編集＆操作ボタン -->
            <div class="flex items-center gap-2 border-b px-3 bg-card"> 
              <span class="text-sm font-medium whitespace-nowrap text-muted-foreground">
                タイトル:
              </span>
              <Input 
                class="flex-1 h-8 border-none shadow-none focus-visible:ring-0 bg-transparent! font-medium px-2" 
                placeholder="タイトルを入力..." 
                bind:value={activePreset.title} 
              />
              <div class="flex items-center pl-2 gap-4 ml-auto">
                <Button variant="ghost" size="icon" class="h-8 w-8 hover:text-foreground" onclick={() => duplicatePreset(type)} title="複製">
                  <Copy class="size-4" />
                </Button>
                <Button variant="ghost" size="icon" class="h-8 w-8 hover:text-destructive" onclick={() => deletePreset(type)} title="削除">
                  <Trash2 class="size-4" />
                </Button>
              </div>
            </div>
            
            <!-- コンテンツ：テキストエリア -->
            <Textarea 
              class="min-h-[200px] resize-y rounded-none rounded-b-md border-0 shadow-none focus-visible:ring-0 font-mono text-sm leading-relaxed p-4 bg-transparent" 
              placeholder={placeholder}
              bind:value={activePreset.text}
            />
          </div>
        {:else}
          <div class="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            プリセットデータが読み込めませんでした。再度「追加」を押すか、スイッチを入れ直してください。
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/snippet}

<div class="space-y-8">
  <!-- 1. システムプロンプト設定セクション -->
  <div>
    <h3 class="font-medium text-lg mb-6 border-b border-muted-background">システムプロンプト設定</h3>
    {@render promptEditor(
      "システムプロンプト", 
      'system', 
      settings.systemPrompt, 
      systemPresets, 
      activeSystemPreset,
      "あなたは親切なアシスタントです..."
    )}
  </div>

  <!-- 2. ダミーユーザープロンプト -->
  <div>
    {@render promptEditor(
      "ダミーユーザープロンプト", 
      'user', 
      settings.dummyUserPrompt, 
      dummyUserPresets, 
      dummyUserPreset,
      "（例）これまでの会話の流れを忘れて、新しい話題について話しましょう。"
    )}
  </div>

  <!-- 3. ダミーモデルプロンプト -->
  <div>
    {@render promptEditor(
      "ダミーモデルプロンプト", 
      'model', 
      settings.dummyModelPrompt, 
      dummyModelPresets, 
      dummyModelPreset,
      "（例）はい、承知いたしました。ご質問の内容について..."
    )}
  </div>

  <!-- 生成パラメータセクション -->
  <div class="space-y-6 pt-4 ">
    <h3 class="font-medium text-lg border-b border-muted-background">生成パラメータ</h3>
    <div class="grid gap-4 grid-cols-1">
      <div class="space-y-2">
        <div class="flex justify-between">
          <Label for="temperature" class="whitespace-nowrap">Temperature</Label>
          <Input 
            id="temperature"
            type="number" 
            min="0" 
            max="2"
            step="0.1"
            class="bg-background w-24"
            bind:value={settings.generation.temperature} 
          />
        </div>
      </div>
      <div class="space-y-2">
        <div class="flex justify-between">
          <Label for="top-p" class="whitespace-nowrap">Top P</Label>
          <Input 
            id="top-p"
            type="number" 
            min="0" 
            max="1"
            step="0.1"
            class="bg-background w-24"
            bind:value={settings.generation.topP} 
          />
        </div>
      </div>
      <div class="space-y-2">
        <div class="flex justify-between">
          <Label for="top-k" class="whitespace-nowrap">Top K</Label>
          <Input 
            id="top-k"
            type="number" 
            min="0" 
            max="100"
            class="bg-background w-24"
            bind:value={settings.generation.topK} 
          />
        </div>
      </div>
      <div class="space-y-2">
        <div class="flex justify-between">
          <Label for="max-tokens" class="whitespace-nowrap">Max Output Tokens</Label>
          <Input 
            id="max-tokens"
            type="number" 
            class="bg-background w-24"
            bind:value={settings.generation.maxOutputTokens} 
          />      
        </div>
      </div>
      <div class="space-y-2">
        <div class="flex justify-between">
          <Label for="thinking-budget" class="whitespace-nowrap">Thinking Budget</Label>
          <Input 
            id="thinking-budget"
            type="number" 
            class="bg-background w-24"
            bind:value={settings.generation.thinkingBudget} 
          />      
        </div>
      </div>
      <div class="flex items-center justify-between space-x-2">
        <Label for="includeThoughts" class="whitespace-nowrap">思考プロセスの出力</Label>
        <Switch id="includeThoughts" bind:checked={settings.generation.includeThoughts} />
      </div>
    </div>
  </div>
</div>
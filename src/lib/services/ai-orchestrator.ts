// src/lib/services/ai-orchestrator.ts
import { GeminiService } from '$lib/services/gemini';
import { TokenCostService } from '$lib/services/token-cost';
import type { AppSettings } from '$lib/types';

export interface AiGenerationResult {
    responseText: string;
    thoughtProcess?: string; // 追加
    metadata: any;
    requestPayload: any;
    tokenUsage: any;
    costAlertTriggered: boolean;
    costThreshold?: number;
    finishReason?: string;
}

export class AiOrchestrator {
    async generate(
        apiHistory: Array<{ role: string, parts: any[] }>,
        messageContent: string | Array<{ text: string }>,
        settings: AppSettings,
        signal?: AbortSignal
    ): Promise<AiGenerationResult> {

        const activeKey = settings.apiKeys.find(k => k.id === settings.activeApiKeyId);
        if (!activeKey?.key) throw new Error("APIキーが設定されていません。");

        const systemPrompt = settings.systemPrompt.isEnabled
            ? settings.systemPrompt.presets.find(p => p.id === settings.systemPrompt.activePresetId)?.text
            : undefined;

        // ダミープロンプト処理... (省略)
        const dummyUserText = settings.dummyUserPrompt.isEnabled ? settings.dummyUserPrompt.presets.find(p => p.id === settings.dummyUserPrompt.activePresetId)?.text : undefined;
        const dummyModelText = settings.dummyModelPrompt.isEnabled ? settings.dummyModelPrompt.presets.find(p => p.id === settings.dummyModelPrompt.activePresetId)?.text : undefined;

        const service = new GeminiService(activeKey.key, settings.model, systemPrompt);
        service.startChat(apiHistory);

        // 生成設定に includeThoughts を反映
        const generationConfig = {
            ...settings.generation,
            // settings.generation.includeThoughts が true なら反映される想定
        };

        const { result, requestPayload } = await service.sendMessage(
            messageContent,
            generationConfig,
            { user: dummyUserText, model: dummyModelText },
            signal
        );

        // --- 思考プロセスと回答の分離ロジック ---
        let responseText = "";
        let thoughtProcess = "";

        const candidate = result.candidates?.[0];
        if (candidate?.content?.parts) {
            for (const part of candidate.content.parts) {
                // Gemini 2.5 Pro: thoughtプロパティが true なら思考
                // ※ SDKの型定義が追いついていない場合は (part as any).thought でアクセス
                if ((part as any).thought === true) {
                    thoughtProcess += part.text || "";
                } else {
                    responseText += part.text || "";
                }
            }
        }

        // もし分離できなかった場合（古いモデルや text() 頼りの場合）のフォールバック
        if (!responseText && !thoughtProcess) {
            responseText = result.text || "(応答なし)";
        } else if (!responseText && thoughtProcess) {
            // 思考のみで回答がないケースへの保険
            // 何もしない、または responseText = "(回答なし)"
        }

        // コスト計算... (省略: 変更なし)
        let costAlertTriggered = false;
        let costThreshold = undefined;
        if (result.usageMetadata) {
            const alertSettings = settings.tokenUsageAlert;
            costThreshold = (alertSettings?.isEnabled && alertSettings?.thresholdUSD > 0) ? alertSettings.thresholdUSD : undefined;
            const didCross = await TokenCostService.trackUsage(settings.model, result.usageMetadata, costThreshold);
            if (didCross && costThreshold !== undefined) costAlertTriggered = true;
        }

        let metaToSave = requestPayload;
        if (settings.assist.saveMinimalMetadata) {
            metaToSave = { ...requestPayload, contents: requestPayload.contents.slice(-3) };
        }

        return {
            responseText: responseText.trim(),
            thoughtProcess: thoughtProcess.trim() || undefined, // 空文字なら undefined
            metadata: JSON.parse(JSON.stringify(result)),
            requestPayload: metaToSave,
            tokenUsage: result.usageMetadata,
            costAlertTriggered,
            costThreshold
        };
    }
}
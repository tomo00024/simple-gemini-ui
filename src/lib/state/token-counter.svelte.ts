// src/lib/state/token-counter.svelte.ts
import type { LogWithSessionId, AttachedFile } from '$lib/types';
import { appSettings } from '$lib/settings.svelte';
import { MessageComposer } from '$lib/logic/message-composer';
import { GeminiService } from '$lib/services/gemini';

export class TokenCounterState {
    count = $state(0);
    isLoading = $state(false);

    private composer = new MessageComposer();
    private debounceTimer: ReturnType<typeof setTimeout> | undefined;
    private readonly DEBOUNCE_MS = 1000;

    constructor() { }

    requestCount(historyLogs: LogWithSessionId[], inputMessage: string, attachments: AttachedFile[] = []) {
        // ★追加: 設定で非表示なら計算しない
        if (!appSettings.value.ui.showTokenCount) {
            return;
        }

        if (this.debounceTimer) clearTimeout(this.debounceTimer);

        if (!inputMessage && historyLogs.length === 0 && attachments.length === 0) {
            this.count = 0;
            return;
        }

        this.isLoading = true;

        this.debounceTimer = setTimeout(async () => {
            await this._performCount(historyLogs, inputMessage, attachments);
        }, this.DEBOUNCE_MS);
    }

    private async _performCount(historyLogs: LogWithSessionId[], inputMessage: string, attachments: AttachedFile[] = []) {
        const settings = appSettings.value;
        const apiKey = settings.apiKeys.find(k => k.id === settings.activeApiKeyId)?.key;

        // 修正済: modelはsettings直下
        const model = settings.model;

        if (!apiKey) {
            this.isLoading = false;
            return;
        }

        // 修正済: システムプロンプトの取得ロジック
        let systemInstruction: string | undefined;
        if (settings.systemPrompt.isEnabled) {
            const activePreset = settings.systemPrompt.presets.find(p => p.id === settings.systemPrompt.activePresetId);
            if (activePreset) {
                systemInstruction = activePreset.text;
            }
        }

        try {
            const apiHistory = this.composer.formatHistoryForApi(historyLogs);

            const { textToSave } = this.composer.compose(inputMessage, settings);
            const apiContentRaw = this.composer.createApiPayload(textToSave, settings, attachments);

            let parts: { text: string }[];
            if (typeof apiContentRaw === 'string') {
                parts = [{ text: apiContentRaw }];
            } else {
                parts = apiContentRaw;
            }

            // 修正済: systemInstructionを渡す
            const service = new GeminiService(apiKey, model, systemInstruction);

            service.startChat(apiHistory);

            const historyContents = apiHistory.map(h => ({
                role: h.role === 'user' ? 'user' : 'model',
                parts: h.parts
            }));
            const currentContent = { role: 'user', parts: parts };

            const fullContents = [...historyContents, currentContent];

            const result = await service.countTokens(fullContents as any);
            this.count = result.totalTokens;

        } catch (err) {
            console.error('Token count error:', err);
        } finally {
            this.isLoading = false;
        }
    }
}
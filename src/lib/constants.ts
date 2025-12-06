// src/lib/constants.ts
import type { AppSettings } from "$lib/types";

export const DEFAULT_SETTINGS: AppSettings = {
    apiKeys: [],
    activeApiKeyId: null,
    model: "gemini-2.5-pro",
    availableModelList: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite"],
    systemPrompt: {
        isEnabled: false,
        activePresetId: "",
        presets: []
    },
    dummyUserPrompt: {
        isEnabled: false,
        activePresetId: "",
        presets: []
    },
    dummyModelPrompt: {
        isEnabled: false,
        activePresetId: "",
        presets: []
    },
    ui: {
        showTokenCount: true,
        useCustomFontSize: false,
        chatFontSize: 16,
        showSpeakerNameInTranscript: true,
        fontFamily: "Inter",
        enterToSend: true
    },
    apiErrorHandling: {
        loopApiKeys: true,
        exponentialBackoff: true,
        maxRetries: 3,
        initialWaitTime: 1000
    },
    assist: {
        autoCorrectUrl: true,
        summarizeOnTokenOverflow: false,
        tokenThreshold: 100000,
        saveMinimalMetadata: true,
        useCombinedHistoryFormat: false
    },
    generation: {
        temperature: null,
        topK: null,
        topP: null,
        maxOutputTokens: null,
        thinkingBudget: null,
        includeThoughts: false
    },
    backup: {
        isEnabled: true,
        autoBackup: false,
        lastBackupAt: null
    },
    diceRolls: [{
        id: "default-dice-roll",
        isEnabled: false,
        instructionText: "1d100。ダイス結果は内緒にしてください。",
        diceCount: 1,
        diceType: 100
    }],
    diceRollMarkers: {
        isEnabled: true,
        start: "[ダイス]",
        end: "[/ダイス]ユーザー文章：",
        useMultipart: true
    },
    customChoiceRolls: [{
        id: "default-custom-choice",
        isEnabled: false,
        instructionText: "結果は内緒にしてください。",
        options: ["大成功", "成功", "失敗", "大失敗"]
    }],
    customChoiceMarkers: {
        isEnabled: true,
        start: "[選択肢]",
        end: "[/選択肢]ユーザー文章：",
        useMultipart: true
    },
    tokenUsageAlert: {
        isEnabled: false,
        thresholdUSD: 1.0
    },
    currency: "JPY",
    exchangeRate: 153.5
};

export const commonSafetySettings = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
];

export const FONT_FAMILY_OPTIONS = [
    {
        id: "system",
        label: "システム準拠",
        value: ""
    },
    {
        id: "sans",
        label: "標準 (ゴシック体)",
        value: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', 'Meiryo', sans-serif"
    },
    {
        id: "serif",
        label: "明朝体",
        value: "ui-serif, Georgia, Cambria, 'Times New Roman', Times, 'Hiragino Mincho ProN', 'Yu Mincho', serif"
    },
    {
        id: "mono",
        label: "等幅 (コード用)",
        value: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
    }
];
export const DICE_SEPARATOR = ":::DICE_SEP:::";

// 初期値用
export const DEFAULT_FONT_FAMILY_ID = "sans";
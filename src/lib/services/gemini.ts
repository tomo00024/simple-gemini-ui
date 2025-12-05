// src/lib/services/gemini.ts
import { GoogleGenAI, type Content, type GenerateContentConfig, type GenerateContentResponse, type SafetySetting } from "@google/genai";
import type { GenerationSettings } from "$lib/types";
import { commonSafetySettings } from "$lib/constants";

// 戻り値の型定義
export interface GeminiResponse {
    result: GenerateContentResponse;
    requestPayload: {
        model: string;
        contents: Content[];
        config: GenerateContentConfig;
    };
}

// 戻り値の型定義に追加
export interface TokenCountResponse {
    totalTokens: number;
}

export class GeminiService {
    private client: GoogleGenAI;
    private modelName: string;
    private systemInstruction?: string;
    private history: Content[] = [];

    constructor(apiKey: string, modelName: string, systemInstruction?: string) {
        this.client = new GoogleGenAI({ apiKey });
        this.modelName = modelName;
        this.systemInstruction = systemInstruction;
    }

    startChat(history: { role: string; parts: { text: string }[] }[]) {
        this.history = history.map(h => ({
            role: h.role.toLowerCase() === "user" ? "user" : "model",
            parts: h.parts
        }));
    }

    async sendMessage(
        messageContent: string | Array<{ text: string }>,
        generationConfig?: GenerationSettings,
        dummyPrompts?: { user?: string; model?: string },
        signal?: AbortSignal
    ): Promise<GeminiResponse> {

        // --- 【デバッグ開始】 擬似エラー発生ロジック ---
        // 使い方: チャット入力欄に "debug:429" などを含めて送信するとエラーになります
        const debugText = Array.isArray(messageContent)
            ? messageContent.map(p => p.text).join("")
            : messageContent;

        if (debugText.includes("debug:404")) {
            console.warn("⚠️ Debug: Simulating 404 (Model Not Found)");
            const error: any = new Error("models/gemini-unknown is not found");
            error.status = 404;
            throw error;
        }

        if (debugText.includes("debug:history")) {
            console.warn("⚠️ Debug: Simulating 400 (Invalid History)");
            const error: any = new Error("Please ensure that multiturn requests alternate between user and model");
            error.status = 400;
            throw error;
        }

        // 1. レート制限 (429) -> リトライ または キーローテーションの確認
        if (debugText.includes("debug:429")) {
            console.warn("⚠️ Debug: Simulating 429 (Rate Limit) Error");
            const error: any = new Error("User Rate Limit Exceeded");
            error.status = 429;
            throw error;
        }

        // 2. サーバーエラー (503) -> 自動リトライの確認
        if (debugText.includes("debug:503")) {
            console.warn("⚠️ Debug: Simulating 503 (Server Overloaded) Error");
            const error: any = new Error("The model is overloaded. Please try again later.");
            error.status = 503;
            throw error;
        }

        // 3. 無効な入力 (400) -> ユーザーへのアラート表示確認
        if (debugText.includes("debug:400")) {
            console.warn("⚠️ Debug: Simulating 400 (Bad Request) Error");
            const error: any = new Error("Invalid argument: Image format not supported");
            error.status = 400;
            throw error;
        }

        // 4. APIキー無効 (Key Invalid) -> キー設定確認アラート
        if (debugText.includes("debug:key")) {
            console.warn("⚠️ Debug: Simulating Invalid API Key Error");
            const error: any = new Error("API key not valid. Please pass a valid API key.");
            error.status = 400; // ステータスが400でもメッセージで判定されるか確認
            throw error;
        }
        // --- 【デバッグ終了】 ---

        let parts: Array<{ text: string }>;

        if (typeof messageContent === 'string') {
            parts = [{ text: messageContent }];
        } else {
            parts = messageContent;
        }

        //結合モードの場合、messageContentは空配列になる
        // その場合はuserMessageを追加せず、履歴のみを使用
        let contents: Content[];
        let userMessage: Content | null = null;  // 🆕 スコープ外でも使えるように

        if (Array.isArray(parts) && parts.length === 0) {
            contents = this.history;
        } else {
            userMessage = { role: "user", parts: parts };
            contents = [...this.history, userMessage];
        }

        // ダミーユーザープロンプトの注入（ユーザー入力の直後）
        if (dummyPrompts?.user) {
            contents.push({ role: "user", parts: [{ text: dummyPrompts.user }] });
        }

        // ダミーモデルプロンプトの注入（最後尾 = 助走/Prefill）
        if (dummyPrompts?.model) {
            contents.push({ role: "model", parts: [{ text: dummyPrompts.model }] });
        }

        const config: GenerateContentConfig = {
            temperature: generationConfig?.temperature ?? undefined,
            topK: generationConfig?.topK ?? undefined,
            topP: generationConfig?.topP ?? undefined,
            maxOutputTokens: generationConfig?.maxOutputTokens ?? undefined,
            safetySettings: commonSafetySettings as unknown as SafetySetting[],

        };

        // Thinking Config の設定 (Gemini 2.5/Thinking Model用)
        if (generationConfig) {
            const thinkingConfig: any = {};
            let hasThinkingConfig = false;

            // includeThoughts: ONの場合のみ設定 (falseやnullなら送らない、またはfalseとして送るか要件によるが今回はONのみ明示)
            if (generationConfig.includeThoughts === true) {
                thinkingConfig.includeThoughts = true;
                hasThinkingConfig = true;
            }

            // thinkingBudget: NULLでなければ設定
            if (generationConfig.thinkingBudget !== null && generationConfig.thinkingBudget !== undefined) {
                thinkingConfig.budgetTokenCount = generationConfig.thinkingBudget;
                hasThinkingConfig = true;
            }

            if (hasThinkingConfig) {
                config.thinkingConfig = thinkingConfig;
            }
        }

        if (this.systemInstruction) {
            config.systemInstruction = { parts: [{ text: this.systemInstruction }] };
        }

        // リクエストペイロードの記録
        const requestPayload = {
            model: this.modelName,
            contents: JSON.parse(JSON.stringify(contents)), // Deep copy
            config: config
        };

        try {
            const result = await (this.client.models as any).generateContent(
                {
                    model: this.modelName,
                    contents: contents,
                    config: config
                },
                { signal } // 第2引数としてsignalを渡す
            );
            // --- 【デバッグ開始】 FinishReason & PromptBlock シミュレーション ---

            const debugInput = Array.isArray(messageContent)
                ? messageContent.map(p => p.text).join("")
                : messageContent;

            // ★追加: debug:block が含まれていたら、強制的にプロンプトブロック状態にする
            if (debugInput.includes("debug:block")) {
                console.warn("⚠️ Debug: Simulating PROHIBITED_CONTENT block");
                // candidates を消去し、promptFeedback をセット
                delete (result as any).candidates;
                (result as any).promptFeedback = { blockReason: "PROHIBITED_CONTENT" };
            }

            // 既存のデバッグロジック (candidatesがある場合のみ実行)
            if (result.candidates && result.candidates.length > 0) {
                const candidate = result.candidates[0];
                if (debugInput.includes("debug:safety")) candidate.finishReason = "SAFETY" as any;
                else if (debugInput.includes("debug:copyright")) candidate.finishReason = "RECITATION" as any;
                else if (debugInput.includes("debug:length")) candidate.finishReason = "MAX_TOKENS" as any;
                else if (debugInput.includes("debug:other")) candidate.finishReason = "OTHER" as any;
            }
            // --- 【デバッグ終了】 ---
            // これにより、後の処理（candidates[0]へのアクセスなど）で落ちるのを防ぎ、
            // エラーハンドラーで適切にメッセージを表示できます。
            if (result.promptFeedback?.blockReason) {
                throw new Error(`Prompt blocked by safety filters: ${result.promptFeedback.blockReason}`);
            }

            // 万が一 candidates が空の場合の保険
            if (!result.candidates || result.candidates.length === 0) {
                throw new Error("No response candidates returned from Gemini API.");
            }
            // 成功した場合のみ履歴に追加
            // 注意: ダミープロンプトは「履歴」には保存せず、今回限りの注入とするのが一般的ですが、
            // ここでは `this.history` には `userMessage` (本当の入力) だけを追加します。
            // 🆕 結合モードの場合、userMessageはnullなので追加しない
            if (userMessage) {
                this.history.push(userMessage);
            }

            return { result, requestPayload };

        } catch (error) {
            (error as any).requestPayload = requestPayload;
            throw error;
        }
    }
    /**
         * トークン数を計算する
         */
    async countTokens(
        contents: Content[]
    ): Promise<TokenCountResponse> {
        try {
            const response = await this.client.models.countTokens({
                model: this.modelName,
                contents: contents,
                config: {
                    systemInstruction: this.systemInstruction ? { parts: [{ text: this.systemInstruction }] } : undefined
                }
            });
            return { totalTokens: response.totalTokens ?? 0 };
        } catch (error) {
            console.warn("Token counting failed:", error);
            return { totalTokens: 0 };
        }
    }
}
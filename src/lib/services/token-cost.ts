// src/lib/services/token-cost.ts
import { db } from '$lib/db';
import type { TokenUsageHistory } from '$lib/types';
import type { GenerateContentResponse } from '@google/genai';

// 料金定義 (単位: USD per 1M tokens)
const PRICING_TIERS: Record<string, {
    input: number;
    inputOver200k?: number;
    output: number;
    outputOver200k?: number;
    cache: number;
    cacheOver200k?: number;
}> = {
    // Gemini 3 Pro (Preview)
    'gemini-3-pro-preview': {
        input: 2.00, inputOver200k: 4.00,
        output: 12.00, outputOver200k: 18.00,
        cache: 0.20, cacheOver200k: 0.40
    },
    // Gemini 2.5 Pro
    'gemini-2.5-pro': {
        input: 1.25, inputOver200k: 2.50,
        output: 10.00, outputOver200k: 15.00,
        cache: 0.125, cacheOver200k: 0.25
    },
    // Gemini 2.5 Flash
    'gemini-2.5-flash': {
        input: 0.30,
        output: 2.50,
        cache: 0.03
    },
    // Gemini 2.5 Flash-Lite
    'gemini-2.5-flash-lite': {
        input: 0.10,
        output: 0.40,
        cache: 0.01
    }
};

// デフォルト料金 (不明なモデル用 - Flash相当にしておく)
const DEFAULT_PRICING = PRICING_TIERS['gemini-2.5-flash'];

export class TokenCostService {

    /**
     * APIレスポンスからトークン使用量をDBに加算保存し、
     * しきい値を超えたかどうかを判定する
     * 
     * @param model 使用したモデル名
     * @param usage APIレスポンスのusageMetadata
     * @param thresholdUSD 通知しきい値 (未設定の場合はチェックしない)
     * @returns boolean 今回のリクエストで初めてしきい値を超えた場合 true
     */
    static async trackUsage(
        model: string,
        usage: GenerateContentResponse['usageMetadata'],
        thresholdUSD?: number
    ): Promise<boolean> {
        if (!usage) return false;

        // 1. 保存前の「今日の総コスト」を取得
        //    (trackUsage呼び出し時点ではまだ今回の分はDBに入っていないため、これが「使用前コスト」になります)
        let preRequestTotalCost = 0;
        if (thresholdUSD !== undefined) {
            const currentStats = await this.getStats('today');
            preRequestTotalCost = currentStats.estimatedCostUSD;

            // 既に超えている場合は、再通知しないため false を返す
            if (preRequestTotalCost >= thresholdUSD) {
                return false;
            }
        }

        // --- 以下、既存の保存ロジック ---

        const today = new Date().toLocaleDateString('en-CA');
        const promptTotal = usage.promptTokenCount || 0;
        const cached = usage.cachedContentTokenCount || 0;
        const candidates = usage.candidatesTokenCount || 0;
        const thinking = usage.thoughtsTokenCount || 0;
        const total = usage.totalTokenCount || 0;

        const billingInput = Math.max(0, promptTotal - cached);
        const billingOutput = candidates + thinking; // output includes thinking
        const isOver200k = promptTotal > 200000;

        // 今回のリクエストのコスト概算を計算
        let currentRequestCost = 0;
        if (thresholdUSD !== undefined) {
            const pricing = PRICING_TIERS[model] || DEFAULT_PRICING;

            const pInput = isOver200k ? (pricing.inputOver200k ?? pricing.input) : pricing.input;
            const pOutput = isOver200k ? (pricing.outputOver200k ?? pricing.output) : pricing.output;
            const pCache = isOver200k ? (pricing.cacheOver200k ?? pricing.cache) : pricing.cache;

            currentRequestCost =
                (billingInput / 1_000_000) * pInput +
                (billingOutput / 1_000_000) * pOutput +
                (cached / 1_000_000) * pCache;
        }

        try {
            await db.transaction('rw', db.tokenHistory, async () => {
                const key = [today, model];
                const entry: TokenUsageHistory = (await db.tokenHistory.get(key as any)) || {
                    date: today,
                    model: model,
                    inputTokens: 0,
                    outputTokens: 0,
                    cachedTokens: 0,
                    inputTokensOver200k: 0,
                    outputTokensOver200k: 0,
                    cachedTokensOver200k: 0,
                    thinkingTokens: 0,
                    totalTokens: 0
                };

                if (isOver200k) {
                    entry.inputTokensOver200k += billingInput;
                    entry.outputTokensOver200k += billingOutput;
                    entry.cachedTokensOver200k += cached;
                } else {
                    entry.inputTokens += billingInput;
                    entry.outputTokens += billingOutput;
                    entry.cachedTokens += cached;
                }

                entry.thinkingTokens += thinking;
                entry.totalTokens += total;

                await db.tokenHistory.put(entry);
            });

            // しきい値判定
            // (保存前 < しきい値) かつ (保存前 + 今回 >= しきい値) の場合のみ true
            if (thresholdUSD !== undefined) {
                const postRequestTotalCost = preRequestTotalCost + currentRequestCost;
                return (preRequestTotalCost < thresholdUSD && postRequestTotalCost >= thresholdUSD);
            }

        } catch (error) {
            console.error("Failed to save token usage:", error);
        }

        return false;
    }

    /**
 * 指定期間・モデルの統計と概算コストを取得する
 * @param rangeType 'today' | 'week' | 'month' | 'all'  <-- 'all'を追加
 * @param modelFilter 'all' | 特定のモデル名
 */
    static async getStats(rangeType: 'today' | 'week' | 'month' | 'all', modelFilter: string = 'all') {
        const now = new Date();
        let startDate = new Date();
        let isAll = false; // 全期間フラグ

        // 期間の計算
        if (rangeType === 'today') {
            // そのまま
        } else if (rangeType === 'week') {
            startDate.setDate(now.getDate() - 7);
        } else if (rangeType === 'month') {
            startDate.setMonth(now.getMonth() - 1);
        } else if (rangeType === 'all') {
            isAll = true;
            // 全期間の場合は開始日計算をスキップ
        }

        const endStr = now.toLocaleDateString('en-CA');
        // 全期間なら '0000-01-01' から検索、それ以外なら計算した開始日から
        const startStr = isAll ? '0000-01-01' : startDate.toLocaleDateString('en-CA');

        // DBから範囲取得
        let records = await db.tokenHistory
            .where('date')
            .between(startStr, endStr, true, true)
            .toArray();

        // モデルフィルタ
        if (modelFilter !== 'all') {
            records = records.filter(r => r.model === modelFilter);
        }

        // ラベル生成
        let periodLabel = `${startStr} - ${endStr}`;
        if (isAll) {
            if (records.length > 0) {
                // データがある場合、実際の最古の日付を表示に使う
                // (dateインデックスでの検索結果なので、先頭が最古とは限らないが、通常Dexieは昇順)
                // 安全のためソートするか、単に「全期間」とするか。
                // ここではシンプルに「全期間」とします。
                periodLabel = "全期間";
                // もし「2024-11-01 〜 2024-11-30」のようにしたい場合は以下：
                // const dates = records.map(r => r.date).sort();
                // periodLabel = `${dates[0]} - ${dates[dates.length-1]}`;
            } else {
                periodLabel = "データなし";
            }
        }

        // 集計用変数
        let totalUSD = 0;
        let stats = {
            input: 0,
            output: 0,
            cached: 0,
            thinking: 0,
            inputCost: 0,
            outputCost: 0,
            cacheCost: 0
        };

        // コスト計算ループ
        for (const r of records) {
            const pricing = PRICING_TIERS[r.model] || DEFAULT_PRICING;

            // --- <= 200k Tier ---
            const costInput = (r.inputTokens / 1_000_000) * pricing.input;
            const costOutput = (r.outputTokens / 1_000_000) * pricing.output;
            const costCache = (r.cachedTokens / 1_000_000) * pricing.cache;

            // --- > 200k Tier ---
            // FlashなどOver200k設定がない場合は通常料金(input)にフォールバック、あるいは一律料金として処理
            const priceInputOver = pricing.inputOver200k ?? pricing.input;
            const priceOutputOver = pricing.outputOver200k ?? pricing.output;
            const priceCacheOver = pricing.cacheOver200k ?? pricing.cache;

            const costInputOver = (r.inputTokensOver200k / 1_000_000) * priceInputOver;
            const costOutputOver = (r.outputTokensOver200k / 1_000_000) * priceOutputOver;
            const costCacheOver = (r.cachedTokensOver200k / 1_000_000) * priceCacheOver;

            // 合計加算
            stats.input += (r.inputTokens + r.inputTokensOver200k);
            stats.output += (r.outputTokens + r.outputTokensOver200k);
            stats.cached += (r.cachedTokens + r.cachedTokensOver200k);
            stats.thinking += r.thinkingTokens;

            stats.inputCost += (costInput + costInputOver);
            stats.outputCost += (costOutput + costOutputOver);
            stats.cacheCost += (costCache + costCacheOver);
        }

        totalUSD = stats.inputCost + stats.outputCost + stats.cacheCost;

        return {
            periodLabel: `${startStr} - ${endStr}`,
            estimatedCostUSD: totalUSD,
            ...stats,
            cacheRate: (stats.input + stats.cached) > 0
                ? (stats.cached / (stats.input + stats.cached)) * 100
                : 0
        };
    }
    /**
     * すべてのトークン履歴を削除する
     */
    static async clearAll() {
        await db.tokenHistory.clear();
    }
    /**
     * 履歴に存在するモデル名のリストを取得する
     */
    static async getExistingModels(): Promise<string[]> {
        // modelインデックスを使用して重複のないリストを取得
        const models = await db.tokenHistory.orderBy('model').uniqueKeys();
        return models.map(m => String(m));
    }
}
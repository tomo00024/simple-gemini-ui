// src/lib/services/exchange-rate.ts
import type { AppSettings } from "$lib/types";

export class ExchangeRateService {
    // APIキー不要、CORS対応のオープンAPI
    private static readonly API_URL = "https://api.frankfurter.app/latest?from=USD&to=JPY";

    // 更新間隔: 24時間 (ミリ秒)
    private static readonly UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;

    /**
     * 必要であれば為替レートを更新し、settingsオブジェクトを直接書き換えます。
     * エラーが発生した場合は何もせず無視します（サイレント）。
     * @param settings 更新対象の設定オブジェクト
     * @returns 更新が行われた場合は true
     */
    static async updateIfNeeded(settings: AppSettings): Promise<boolean> {
        try {
            const lastUpdate = settings.lastRateUpdate ? new Date(settings.lastRateUpdate).getTime() : 0;
            const now = Date.now();

            // 前回の更新から24時間経過していない場合は何もしない
            if (now - lastUpdate < this.UPDATE_INTERVAL_MS) {
                return false;
            }

            // APIから取得
            const res = await fetch(this.API_URL);
            if (!res.ok) return false;

            const data = await res.json();

            // レートが存在すれば更新 (APIレスポンス例: { rates: { JPY: 150.5 }, ... })
            if (data && data.rates && typeof data.rates.JPY === 'number') {
                settings.exchangeRate = data.rates.JPY;
                settings.lastRateUpdate = new Date().toISOString();
                return true;
            }
        } catch (e) {
            // エラー時は要件通り無視する (デバッグ用にログだけ残しても良い)
            // console.debug("Exchange rate update skipped silently:", e);
        }

        return false;
    }
}
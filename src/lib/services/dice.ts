import type { AppSettings, DiceRoll } from "$lib/types";
import { DICE_SEPARATOR } from '$lib/constants';

export class DiceService {
    /**
     * ユーザー入力と設定を受け取り、ダイスロールが必要なら実行して
     * セパレーターを含む保存用テキストを生成する
     */
    static processInput(userInput: string, settings: AppSettings): string {
        const activeDice = settings.diceRolls?.filter(d => d.isEnabled) ?? [];
        if (activeDice.length === 0) {
            return userInput;
        }

        const markers = settings.diceRollMarkers;
        const useMarkers = markers?.isEnabled ?? false;
        let dicePart = "";

        if (useMarkers) {
            // マーカーあり: [開始]名前:1,2 名前:3[終了]\n
            const parts = activeDice.map(d => {
                const rolls = this.rollDice(d.diceCount, d.diceType);
                return `${d.instructionText}:${rolls.join(',')}`;
            });
            const combined = parts.join(' ');
            const start = markers?.start || "[";
            const end = markers?.end || "]";

            dicePart = `${start}${combined}${end}\n`;
        } else {
            // マーカーなし: 1,2,3,
            const allRolls: number[] = [];
            for (const d of activeDice) {
                const rolls = this.rollDice(d.diceCount, d.diceType);
                allRolls.push(...rolls);
            }
            const rollString = allRolls.join(',');

            // ユーザー入力がある場合はカンマを追加
            dicePart = userInput ? `${rollString},` : rollString;
        }

        // 保存用テキストにセパレーターを埋め込む
        return dicePart + DICE_SEPARATOR + userInput;
    }

    /**
     * AIへの送信リクエスト用にセパレーターを除去する
     * (ダイス結果とユーザー入力を結合)
     */
    static cleanForAi(text: string): string {
        return text.replace(DICE_SEPARATOR, "");
    }

    /**
     * UI表示用にセパレーター以降（ユーザー入力部分）のみを抽出する
     */
    static extractDisplayText(text: string): string {
        if (text.includes(DICE_SEPARATOR)) {
            const parts = text.split(DICE_SEPARATOR);
            // セパレーター以降を結合して返す
            return parts.slice(1).join(DICE_SEPARATOR);
        }
        return text;
    }

    /**
     * 編集保存時に、隠れているダイス部分と新しい入力テキストを結合する
     */
    static mergeHiddenAndDisplay(originalFullText: string, newDisplayText: string): string {
        if (originalFullText.includes(DICE_SEPARATOR)) { // 変更
            const parts = originalFullText.split(DICE_SEPARATOR); // 変更
            const hiddenPrefix = parts[0];
            return hiddenPrefix + DICE_SEPARATOR + newDisplayText; // 変更
        }
        return newDisplayText;
    }

    // 内部ヘルパー: ダイスを振る
    private static rollDice(count: number, type: number): number[] {
        const rolls: number[] = [];
        for (let i = 0; i < count; i++) {
            rolls.push(Math.floor(Math.random() * type) + 1);
        }
        return rolls;
    }
}
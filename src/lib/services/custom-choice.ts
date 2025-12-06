import type { AppSettings, CustomChoiceRoll } from "$lib/types";
import { DICE_SEPARATOR } from '$lib/constants';

export class CustomChoiceService {
    /**
     * ユーザー入力と設定を受け取り、カスタム選択肢が必要なら実行して
     * セパレーターを含む保存用テキストを生成する
     */
    static processInput(userInput: string, settings: AppSettings): string {
        const activeChoices = settings.customChoiceRolls?.filter(c => c.isEnabled) ?? [];
        if (activeChoices.length === 0) {
            return userInput;
        }

        const markers = settings.customChoiceMarkers;
        const useMarkers = markers?.isEnabled ?? false;
        let choicePart = "";

        if (useMarkers) {
            // マーカーあり: [開始]指示文:選択結果 指示文:選択結果[終了]\n
            const parts = activeChoices.map(c => {
                const selected = this.rollCustomChoice(c.options);
                return `${c.instructionText}:${selected}`;
            });
            const combined = parts.join(' ');
            const start = markers?.start || "[";
            const end = markers?.end || "]";

            choicePart = `${start}${combined}${end}\n`;
        } else {
            // マーカーなし: 選択結果1,選択結果2,
            const allSelected: string[] = [];
            for (const c of activeChoices) {
                const selected = this.rollCustomChoice(c.options);
                allSelected.push(selected);
            }
            const selectedString = allSelected.join(',');

            // ユーザー入力がある場合はカンマを追加
            choicePart = userInput ? `${selectedString},` : selectedString;
        }

        // 保存用テキストにセパレーターを埋め込む
        return choicePart + DICE_SEPARATOR + userInput;
    }

    /**
     * AIへの送信リクエスト用にセパレーターを除去する
     * (選択結果とユーザー入力を結合)
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
     * 編集保存時に、隠れている選択肢部分と新しい入力テキストを結合する
     */
    static mergeHiddenAndDisplay(originalFullText: string, newDisplayText: string): string {
        if (originalFullText.includes(DICE_SEPARATOR)) {
            const parts = originalFullText.split(DICE_SEPARATOR);
            const hiddenPrefix = parts[0];
            return hiddenPrefix + DICE_SEPARATOR + newDisplayText;
        }
        return newDisplayText;
    }

    // 内部ヘルパー: カスタム選択肢から1つをランダムに選択
    private static rollCustomChoice(options: string[]): string {
        if (options.length === 0) {
            return "";
        }
        const randomIndex = Math.floor(Math.random() * options.length);
        return options[randomIndex];
    }
}

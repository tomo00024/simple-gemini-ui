// src/lib/logic/message-composer.ts
import type { LogWithSessionId, AppSettings, AttachedFile } from '$lib/types'; // AttachedFile追加
import { DICE_SEPARATOR } from '$lib/constants';

export class MessageComposer {
    /**
     * 新規メッセージ作成
     * (既存機能につき変更なし)
     */
    compose(userText: string, settings: AppSettings) {
        const dicePart = this._generateDicePart(userText, settings);
        const customChoicePart = this._generateCustomChoicePart(userText, settings);

        // ダイスとカスタム選択肢の両方がある場合はそのまま結合
        // (それぞれが独自のマーカーで囲まれているため、セパレーターは不要)
        let combinedPart = "";
        if (dicePart && customChoicePart) {
            combinedPart = dicePart + customChoicePart;
        } else if (dicePart) {
            combinedPart = dicePart;
        } else if (customChoicePart) {
            combinedPart = customChoicePart;
        }

        // セパレーターはダイス/カスタム選択肢部分とユーザー入力を区切るためだけに使用
        const textToSave = combinedPart
            ? combinedPart + DICE_SEPARATOR + userText
            : userText;

        // API Content作成は添付ファイルなし版として一旦呼ぶ（UI側で送信時に添付付きで再生成される想定、あるいはここでの呼び出しはプレビュー用）
        // ※チャット送信フロー(ChatSession.sendMessage)では、この戻り値の apiContent ではなく、
        //   別途 createApiPayload を添付ファイル付きで呼び直す形になります。
        const apiContent = this.createApiPayload(textToSave, settings);

        return { textToSave, apiContent };
    }

    /**
     * 再生成用
     * (既存機能につき変更なし)
     */
    recompose(currentLogText: string, settings: AppSettings): string {
        let userText = currentLogText;
        if (currentLogText.includes(DICE_SEPARATOR)) {
            const parts = currentLogText.split(DICE_SEPARATOR);
            userText = parts.slice(1).join(DICE_SEPARATOR);
        }
        const { textToSave } = this.compose(userText, settings);
        return textToSave;
    }

    /**
     * Gemini送信用のPayloadを作成
     * ★修正: 既存のダイス処理ロジックを維持しつつ、添付ファイルを追加できるように拡張
     */
    createApiPayload(
        fullText: string,
        settings: AppSettings,
        attachments: AttachedFile[] = [] // 追加引数
    ): any[] { // 戻り値の型を拡張 (text | inlineData | fileData を許容するため any[] またはSDKのPart型)

        const textParts: any[] = [];
        const useDiceMultipart = settings.diceRollMarkers?.useMultipart ?? false;
        const useCustomChoiceMultipart = settings.customChoiceMarkers?.useMultipart ?? false;
        const useMultipart = useDiceMultipart || useCustomChoiceMultipart;

        // --- [既存ロジック保護] ダイスロールが含まれているか判定 ---
        if (fullText.includes(DICE_SEPARATOR) && useMultipart) {
            const parts = fullText.split(DICE_SEPARATOR);
            let dicePartRaw = parts[0];
            const userPartRaw = parts.slice(1).join(DICE_SEPARATOR);

            // マーカー設定の取得
            const markers = settings.diceRollMarkers;
            const startMarker = markers?.start || "[";
            const endMarker = markers?.end || "]";
            const isMarkersEnabled = markers?.isEnabled ?? false;

            // 余分な改行やマーカー文字を除去
            if (dicePartRaw.endsWith('\n')) {
                dicePartRaw = dicePartRaw.slice(0, -1);
            }
            if (dicePartRaw.startsWith(startMarker)) {
                dicePartRaw = dicePartRaw.substring(startMarker.length);
            }
            if (dicePartRaw.endsWith(endMarker)) {
                dicePartRaw = dicePartRaw.substring(0, dicePartRaw.length - endMarker.length);
            }

            let part1Text: string;
            if (isMarkersEnabled) {
                part1Text = this._parseDiceToJson(dicePartRaw);
            } else {
                part1Text = dicePartRaw;
            }

            // テキストパートを配列に追加
            textParts.push({ text: part1Text });
            if (userPartRaw) {
                textParts.push({ text: userPartRaw });
            }

        } else {
            // 既存モード: セパレーターを除去して結合
            const processedText = fullText.replace(DICE_SEPARATOR, "");
            if (processedText) {
                textParts.push({ text: processedText });
            }
        }
        // --- [既存ロジック保護終了] ---

        // --- [新規追加] 添付ファイルパートの生成 ---
        const attachmentParts: any[] = [];
        for (const file of attachments) {
            if (file.storageType === 'inline' && file.data) {
                attachmentParts.push({
                    inlineData: {
                        mimeType: file.mimeType,
                        data: file.data
                    }
                });
            } else if (file.storageType === 'fire_storage' && file.fileUri) {
                attachmentParts.push({
                    fileData: {
                        mimeType: file.mimeType,
                        fileUri: file.fileUri
                    }
                });
            }
        }

        // テキストパートと添付ファイルパートを結合して返す
        return [...textParts, ...attachmentParts];
    }

    /**
     * 履歴を1つのユーザーメッセージのテキストとして結合
     * 添付ファイルがある場合はファイル名を表記
     */
    private _formatHistoryAsCombinedText(logs: LogWithSessionId[]): string {
        return logs.map(l => {
            const speaker = l.speaker === 'user' ? 'user' : 'model';
            const text = l.text.replace(DICE_SEPARATOR, "");

            // 添付ファイルがあればファイル名を表記
            let attachmentNote = "";
            if (l.attachments && l.attachments.length > 0) {
                const fileNames = l.attachments.map(a => a.name).join(", ");
                attachmentNote = ` [添付: ${fileNames}]`;
            }

            return `${speaker}${attachmentNote}: ${text}`;
        }).join('\n');
    }

    /**
     * 履歴フォーマット
     * ★修正: 設定により標準モードか結合モードかを切り替え
     * ★追加: 結合モードでは現在のユーザー入力も含めて1つのメッセージにする
     */
    formatHistoryForApi(
        logs: LogWithSessionId[],
        settings: AppSettings,
        currentUserInput?: { text: string, attachments?: AttachedFile[] }
    ): Array<{ role: string, parts: any[] }> {
        // 結合モード: 全履歴 + 現在の入力を1つのuserメッセージに統合
        if (settings.assist.useCombinedHistoryFormat) {
            // 履歴のテキストを結合
            const historyCombined = this._formatHistoryAsCombinedText(logs);

            // 🆕 現在の入力を追加
            let fullText = historyCombined;
            if (currentUserInput) {
                const currentText = currentUserInput.text.replace(DICE_SEPARATOR, "");
                let attachmentNote = "";
                if (currentUserInput.attachments && currentUserInput.attachments.length > 0) {
                    const fileNames = currentUserInput.attachments.map(a => a.name).join(", ");
                    attachmentNote = ` [添付: ${fileNames}]`;
                }

                // 履歴がある場合は改行を追加
                if (fullText) fullText += '\n';
                fullText += `user${attachmentNote}: ${currentText}`;
            }

            const parts: any[] = [{ text: fullText }];

            // 全ての履歴から添付ファイルを収集
            logs.forEach(l => {
                if (l.attachments && l.attachments.length > 0) {
                    l.attachments.forEach(att => {
                        if (att.storageType === 'inline' && att.data) {
                            parts.push({
                                inlineData: {
                                    mimeType: att.mimeType,
                                    data: att.data
                                }
                            });
                        } else if (att.storageType === 'fire_storage' && att.fileUri) {
                            parts.push({
                                fileData: {
                                    mimeType: att.mimeType,
                                    fileUri: att.fileUri
                                }
                            });
                        }
                    });
                }
            });

            return [{ role: 'user', parts }];
        }

        // 標準モード: 各ログを個別のオブジェクトとして送信
        return logs.map(l => {
            // [既存ロジック保護] テキスト処理
            const parts: any[] = [{ text: l.text.replace(DICE_SEPARATOR, "") }];

            // [新規追加] ログに保存された添付ファイルがあれば履歴に追加
            if (l.attachments && l.attachments.length > 0) {
                l.attachments.forEach(att => {
                    if (att.storageType === 'inline' && att.data) {
                        parts.push({
                            inlineData: {
                                mimeType: att.mimeType,
                                data: att.data
                            }
                        });
                    } else if (att.storageType === 'fire_storage' && att.fileUri) {
                        parts.push({
                            fileData: {
                                mimeType: att.mimeType,
                                fileUri: att.fileUri
                            }
                        });
                    }
                });
            }

            return {
                role: l.speaker === 'user' ? 'user' : 'model',
                parts
            };
        });
    }

    // --- 以下、既存のプライベートメソッドは完全に維持 ---

    private _parseDiceToJson(raw: string): string {
        const result: Record<string, string> = {};
        const segments = raw.trim().split(/\s+/);
        let hasLabel = false;

        for (const seg of segments) {
            const colonIndex = seg.indexOf(':');
            if (colonIndex > 0) {
                const key = seg.substring(0, colonIndex);
                const val = seg.substring(colonIndex + 1);
                result[key] = val;
                hasLabel = true;
            }
        }

        if (hasLabel) {
            return JSON.stringify(result);
        }
        return JSON.stringify({ Dice: raw });
    }

    private _generateDicePart(userText: string, settings: AppSettings): string {
        const activeDice = settings.diceRolls?.filter(d => d.isEnabled) ?? [];
        if (activeDice.length === 0) return "";

        const markers = settings.diceRollMarkers;
        const useMarkers = markers?.isEnabled ?? false;

        if (useMarkers) {
            const parts = activeDice.map(d => {
                const rolls = [];
                for (let i = 0; i < d.diceCount; i++) {
                    rolls.push(Math.floor(Math.random() * d.diceType) + 1);
                }
                return `${d.instructionText}:${rolls.join(',')}`;
            });
            const combined = parts.join(' ');
            const start = markers?.start || "[";
            const end = markers?.end || "]";
            return `${start}${combined}${end}\n`;
        } else {
            const allRolls: number[] = [];
            for (const d of activeDice) {
                for (let i = 0; i < d.diceCount; i++) {
                    allRolls.push(Math.floor(Math.random() * d.diceType) + 1);
                }
            }
            const rollString = allRolls.join(',');
            return userText ? `${rollString},` : rollString;
        }
    }

    private _generateCustomChoicePart(userText: string, settings: AppSettings): string {
        const activeChoices = settings.customChoiceRolls?.filter(c => c.isEnabled) ?? [];
        if (activeChoices.length === 0) return "";

        const markers = settings.customChoiceMarkers;
        const useMarkers = markers?.isEnabled ?? false;

        if (useMarkers) {
            const parts = activeChoices.map(c => {
                // カスタム選択肢からランダムに1つを選択
                const selected = c.options.length > 0
                    ? c.options[Math.floor(Math.random() * c.options.length)]
                    : "";
                return `${c.instructionText}:${selected}`;
            });
            const combined = parts.join(' ');
            const start = markers?.start || "[";
            const end = markers?.end || "]";
            return `${start}${combined}${end}\n`;
        } else {
            const allSelected: string[] = [];
            for (const c of activeChoices) {
                const selected = c.options.length > 0
                    ? c.options[Math.floor(Math.random() * c.options.length)]
                    : "";
                allSelected.push(selected);
            }
            const selectedString = allSelected.join(',');
            return userText ? `${selectedString},` : selectedString;
        }
    }
}
// src/lib/logic/gemini-error-handler.ts

export type GeminiErrorType =
    | 'RETRYABLE'      // 503, 504, 500
    | 'KEY_EXPIRED'    // 400(API Key Invalid), 401, 403
    | 'QUOTA_EXCEEDED' // 429 (レート制限)
    | 'INVALID_INPUT'  // 400 (画像形式ミスなど)
    | 'INVALID_HISTORY'// 400 (会話順序ミス) ★追加
    | 'MODEL_NOT_FOUND'// 404 (モデル名間違い) ★追加
    | 'PROMPT_BLOCKED' // 安全フィルタによるブロック
    | 'UNKNOWN';

export interface ErrorAnalysis {
    type: GeminiErrorType;
    userMessage: string; // ユーザーに表示する優しいメッセージ
    technicalDetail: string; // ログに残す詳細
}

export class GeminiErrorHandler {
    static analyzeError(error: any): ErrorAnalysis {
        const status = Number(error.status || error.response?.status);
        const message = error.message || '';

        // 1. メッセージ内容による優先判定
        if (message.includes('API key not valid') || message.includes('API_KEY_INVALID')) {
            return {
                type: 'KEY_EXPIRED',
                userMessage: 'APIキーが無効です。設定を確認してください。',
                technicalDetail: `Invalid API Key: ${message}`
            };
        }

        if (message.includes('Prompt blocked') || message.includes('PROHIBITED_CONTENT')) {
            return {
                type: 'PROMPT_BLOCKED',
                userMessage: '入力内容がAIの安全ポリシーに抵触したため、生成がブロックされました。',
                technicalDetail: `Prompt Blocked: ${message}`
            };
        }

        // 会話履歴の順序エラー (User -> User の連続など)
        if (message.includes('alternate between user and model')) {
            return {
                type: 'INVALID_HISTORY',
                userMessage: '会話履歴の同期エラーが発生しました。ページを再読み込みするか、新しいチャットを開始してください。',
                technicalDetail: `History Order Error: ${message}`
            };
        }

        // 2. ステータスコードによる判定
        switch (status) {
            case 429:
                return {
                    type: 'QUOTA_EXCEEDED', // 旧 KEY_EXPIRED から分離
                    userMessage: '利用上限(レート制限)に達しました。しばらく待つか、APIキーを確認してください。',
                    technicalDetail: `Rate Limit Exceeded (429): ${message}`
                };
            case 404:
                return {
                    type: 'MODEL_NOT_FOUND',
                    userMessage: '指定されたAIモデルが見つかりません。設定画面でモデル名を確認してください。',
                    technicalDetail: `Model Not Found (404): ${message}`
                };
            case 503:
            case 500:
            case 504:
                return {
                    type: 'RETRYABLE',
                    userMessage: 'AIサーバーが混雑しているか、一時的なエラーが発生しています。',
                    technicalDetail: `Server Error (${status}): ${message}`
                };
            case 400:
                // その他の400エラー
                return {
                    type: 'INVALID_INPUT',
                    userMessage: 'リクエストが無効です。画像形式が非対応か、入力テキストが長すぎる可能性があります。',
                    technicalDetail: `Bad Request (400): ${message}`
                };
            case 401:
            case 403:
                return {
                    type: 'KEY_EXPIRED',
                    userMessage: 'APIキーの権限がないか、無効です。',
                    technicalDetail: `Auth Error (${status}): ${message}`
                };
        }

        return {
            type: 'UNKNOWN',
            userMessage: '予期せぬエラーが発生しました。',
            technicalDetail: `Unknown Error: ${message}`
        };
    }

    /**
     * 生成は成功したが、FinishReasonでブロックされたケースのメッセージ
     */
    static getFinishReasonMessage(finishReason: string | undefined): string | null {
        if (!finishReason) return null;

        switch (finishReason) {
            case 'SAFETY':
                return '\n\n【安全フィルタ】 安全上の理由により、これ以上の回答生成は中断されました（暴力、性的、差別的な表現などの可能性があります）。';
            case 'RECITATION':
                return '\n\n【著作権保護】 著作権で保護されたコンテンツと類似しているため、生成が中断されました。';
            case 'MAX_TOKENS':
                return '\n\n(回答が長すぎるため途中で途切れました。続きを促してください)';
            case 'OTHER':
                return '\n\n(生成が停止しました)';
            default:
                return null; // STOP などの正常終了
        }
    }
}
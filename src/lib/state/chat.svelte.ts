// src/lib/state/chat.svelte.ts
import { v4 as uuidv4 } from 'uuid';
import { tick } from 'svelte';
import type { LogWithSessionId, AppSettings, AttachedFile } from '$lib/types';
import { appSettings } from '$lib/settings.svelte';
import { ChatRepository } from '$lib/db/repository';
import { GeminiErrorHandler } from '$lib/logic/gemini-error-handler';
// Logic classes
import { MessageComposer } from '$lib/logic/message-composer';
import { LogTreeManager } from '$lib/logic/log-tree-manager';
import { AiOrchestrator } from '$lib/services/ai-orchestrator';
import { TokenCounterState } from './token-counter.svelte';
import { ImageCorrectionService } from '$lib/services/image-correction';
import { AttachmentService } from '$lib/services/attachment'; // 追加
import { DICE_SEPARATOR } from '$lib/constants';

export class ChatSession {
    // --- 状態 (Runes) ---
    private _logs = new Map<string, LogWithSessionId>();
    private _displayLogs = $state<LogWithSessionId[]>([]);
    private _sessionId = $state(uuidv4());
    private _isLoading = $state(false);
    private _inputMessage = $state("");
    private _retryCount = $state(0);
    private _abortController: AbortController | null = null;
    private _retryTimer: ReturnType<typeof setTimeout> | null = null;

    // --- 追加状態: 添付ファイル管理 ---
    private _attachments = $state<AttachedFile[]>([]);
    private _isUploading = $state(false);

    // --- ロジック & サービス ---
    private repo = new ChatRepository();
    private composer = new MessageComposer();
    private treeManager = new LogTreeManager();
    private aiOrchestrator = new AiOrchestrator();

    // コストアラート表示用ステート
    alertState = $state({
        isOpen: false,
        threshold: 0,
        currentCost: 0
    });

    // エラーハンドリング用ステート
    errorAlertState = $state({
        isOpen: false,
        message: "",
        showCancel: false,
        onConfirm: async () => { },
        onCancel: () => { }
    });

    // トークンカウンター
    tokenCounter = new TokenCounterState();

    constructor() {
        // リアクティブな監視を登録
        $effect(() => {
            const currentInput = this._inputMessage;
            const currentLogs = this._displayLogs;
            const currentAttachments = this._attachments;

            // 入力やログ、添付ファイルが変わるたびに計算リクエストを投げる
            this.tokenCounter.requestCount(currentLogs, currentInput, currentAttachments);
        });
    }

    // --- Getters ---
    get sessionId() { return this._sessionId; }
    // アップロード中もロード中として扱う
    get isLoading() { return this._isLoading || this._isUploading; }
    get inputMessage() { return this._inputMessage; }
    set inputMessage(v: string) { this._inputMessage = v; }
    get logs() { return this._displayLogs; }

    // 追加 getter
    get attachments() { return this._attachments; }

    get retryStatus() {
        if (!this._isLoading) return "";
        if (this._retryCount > 0) {
            const max = appSettings.value.apiErrorHandling.maxRetries;
            return `Thinking (${this._retryCount}/${max})...`;
        }
        return "Thinking...";
    }

    // --- 追加メソッド: 生成中断 ---
    stopGeneration() {
        if (this._abortController) {
            this._abortController.abort(); // APIリクエストを中断
            this._abortController = null;
        }

        if (this._retryTimer) {
            clearTimeout(this._retryTimer); // リトライ待機中ならタイマー解除
            this._retryTimer = null;
        }

        // 強制的にローディング状態を解除
        // ※ _runAiGenerationのfinallyブロックなどが走るが、フラグをここで折る
        this._isLoading = false;
        this._isUploading = false;
    }

    // --- 追加メソッド: ファイル追加処理 ---
    async addFiles(files: File[]) {
        if (files.length === 0) return;

        this._isUploading = true;
        const apiKey = appSettings.value.apiKeys.find(k => k.id === appSettings.value.activeApiKeyId)?.key;

        if (!apiKey) {
            this.errorAlertState.message = "APIキーが設定されていないためファイルを処理できません。";
            this.errorAlertState.isOpen = true;
            this._isUploading = false;
            return;
        }

        try {
            for (const file of files) {
                const attached = await AttachmentService.processFile(file, apiKey);
                this._attachments.push(attached);
            }
        } catch (error: any) {
            console.error(error);
            this.errorAlertState.message = `ファイル処理エラー: ${error.message}`;
            this.errorAlertState.isOpen = true;
        } finally {
            this._isUploading = false;
        }
    }

    // --- 追加メソッド: ファイル削除 ---
    removeAttachment(id: string) {
        this._attachments = this._attachments.filter(a => a.id !== id);
    }

    // --- 内部メソッド ---

    private _refreshDisplayLogs() {
        this._displayLogs = this.treeManager.calculateActivePath(this._logs);
    }

    private _runImageCorrectionExtraction() {
        if (!appSettings.value.assist.autoCorrectUrl) return;

        if (this._displayLogs.length > 0) {
            const firstLog = this._displayLogs[0];
            if (firstLog.speaker === 'user') {
                ImageCorrectionService.defineDictionary(firstLog.text);
            }
        }
    }

    private async _updateLogEntity(log: LogWithSessionId) {
        this._logs.set(log.id, log);
        await this.repo.saveLog(log);
    }

    private async _runAiGeneration(
        triggerUserLog: LogWithSessionId,
        historyLogs: LogWithSessionId[],
        retryCount = 0
    ) {
        const settings = appSettings.value;
        this._isLoading = true;
        this._retryCount = retryCount;
        let isWaitingForUser = false;
        this._abortController = new AbortController();

        const originalActiveChildId = triggerUserLog.activeChildId;
        if (originalActiveChildId) {
            triggerUserLog.activeChildId = null;
            this._refreshDisplayLogs();
        }

        let isRetrying = false;

        try {
            // 1. ~ 3. 生成実行までは同じ
            // 🆕 結合モードの場合、現在のユーザー入力も履歴に含める
            const apiHistory = this.composer.formatHistoryForApi(
                historyLogs,
                settings,
                settings.assist.useCombinedHistoryFormat ? {
                    text: triggerUserLog.text,
                    attachments: triggerUserLog.attachments
                } : undefined
            );

            // 🆕 結合モードの場合、messageContentは空配列にする（履歴に含まれているため）
            const apiContent = settings.assist.useCombinedHistoryFormat
                ? []
                : this.composer.createApiPayload(
                    triggerUserLog.text,
                    settings,
                    triggerUserLog.attachments
                );
            const result = await this.aiOrchestrator.generate(apiHistory, apiContent, settings, this._abortController.signal);

            // ★変更点1: Finish Reason のハンドリング
            let responseText = result.responseText;
            // 画像補正処理など
            const correctedText = ImageCorrectionService.correctText(responseText);

            // ブロック理由があればテキスト末尾に追記する
            const finishMessage = GeminiErrorHandler.getFinishReasonMessage(result.finishReason);
            const finalText = finishMessage ? (correctedText + finishMessage) : correctedText;

            // 4. コストアラート (既存)
            if (result.costAlertTriggered && result.costThreshold !== undefined) {
                this.alertState.threshold = result.costThreshold;
                this.alertState.isOpen = true;
            }

            // 5. ユーザーログ更新 (既存)
            triggerUserLog.metadata = {
                ...triggerUserLog.metadata,
                ...result.requestPayload
            };
            await this._updateLogEntity(triggerUserLog);

            // 6. AIログ作成 (★テキストを finalText に変更)
            const aiLog: LogWithSessionId = {
                id: uuidv4(),
                sessionId: this._sessionId,
                speaker: 'model',
                text: finalText, // 修正後のテキストを使用
                thoughtProcess: result.thoughtProcess,
                timestamp: new Date().toISOString(),
                parentId: triggerUserLog.id,
                activeChildId: null,
                metadata: {
                    ...result.metadata,
                    finishReason: result.finishReason // メタデータにも保存しておく
                },
                tokenUsage: result.tokenUsage || { input: 0, output: 0, total: 0, cached: 0, thinking: 0 }
            };

            await this._saveNewBranchLog(triggerUserLog, aiLog);

        } catch (error: any) {
            if (error.name === 'AbortError' || this._abortController?.signal.aborted) {
                console.log('Generation stopped by user.');
                return; // ここで処理を抜ける
            }

            console.error(error);

            // ★変更点2: エラー解析を実行
            const analysis = GeminiErrorHandler.analyzeError(error);

            // エラーログオブジェクト作成
            const errorLog: LogWithSessionId = {
                id: uuidv4(),
                sessionId: this._sessionId,
                speaker: 'model',
                text: `エラー: ${analysis.userMessage}`, // ★ユーザー向けの優しいメッセージを表示
                thoughtProcess: analysis.technicalDetail, // 思考プロセス欄に技術的な詳細を残す
                timestamp: new Date().toISOString(),
                parentId: triggerUserLog.id,
                activeChildId: null,
                metadata: {
                    error: {
                        message: error.message,
                        status: error.status || error.response?.status,
                        analysisType: analysis.type, // ★解析タイプを保存
                        stack: error.stack,
                        raw: JSON.parse(JSON.stringify(error, Object.getOwnPropertyNames(error)))
                    }
                },
                tokenUsage: { input: 0, output: 0, total: 0, cached: 0, thinking: 0 }
            };

            const apiSettings = settings.apiErrorHandling;
            const canRetry = apiSettings.exponentialBackoff && retryCount < apiSettings.maxRetries;

            // ★変更点3: 解析結果に基づいてリトライ判断
            if (analysis.type === 'RETRYABLE' && canRetry) {
                isRetrying = true;

                this._logs.set(errorLog.id, errorLog);
                await this.repo.saveLog(errorLog);

                // 指数バックオフ + ジッター (0~25%のランダム要素を追加)
                const baseWaitTime = apiSettings.initialWaitTime * Math.pow(2, retryCount);
                const jitter = Math.random() * 0.25 * baseWaitTime;
                const waitTime = Math.floor(baseWaitTime + jitter);
                console.log(`Retryable Error (${analysis.type}). Retrying in ${waitTime}ms (base: ${baseWaitTime}ms + jitter: ${Math.floor(jitter)}ms)...`);

                this._retryCount = retryCount + 1;
                this._retryTimer = setTimeout(() => {
                    this._retryTimer = null;
                    this._runAiGeneration(triggerUserLog, historyLogs, retryCount + 1);
                }, waitTime);
                return;
            }

            // リトライ不可ならエラーログを確定保存
            await this._saveNewBranchLog(triggerUserLog, errorLog);
            // ステータスコードを数値に変換して取得（型エラー回避と "429" 文字列対応のため）
            const rawStatus = error.status || error.response?.status;
            const status = Number(rawStatus);
            // ケース1: 429エラー (キーローテーション提案) -> キャンセルボタンが必要
            if (status === 429 || analysis.type === 'QUOTA_EXCEEDED') {
                const hasMultipleKeys = settings.apiKeys.length > 1;
                if (apiSettings.loopApiKeys && hasMultipleKeys) {
                    isWaitingForUser = true;
                    this._isLoading = false;

                    this.errorAlertState.message = `利用上限 (429) に達しました。\n次のAPIキーに切り替えてリトライしますか？`;

                    this.errorAlertState.showCancel = true; // ★追加: キャンセルボタンを表示

                    this.errorAlertState.onConfirm = async () => {
                        this.errorAlertState.isOpen = false;
                        await this._rotateApiKeyAndRetry(triggerUserLog, historyLogs);
                    };
                    this.errorAlertState.onCancel = () => {
                        this.errorAlertState.isOpen = false;
                        if (originalActiveChildId) {
                            triggerUserLog.activeChildId = originalActiveChildId;
                            this._refreshDisplayLogs();
                        }
                    };
                    this.errorAlertState.isOpen = true;
                    return;
                }
            }

            // ケース2: その他のエラー (400など) -> キャンセルボタンは不要
            if (
                analysis.type === 'INVALID_INPUT' ||
                analysis.type === 'MODEL_NOT_FOUND' ||
                analysis.type === 'INVALID_HISTORY' ||
                (analysis.type === 'KEY_EXPIRED' && status !== 429)
            ) {
                this.errorAlertState.message = analysis.userMessage;
                this.errorAlertState.showCancel = false;
                this.errorAlertState.onConfirm = async () => { this.errorAlertState.isOpen = false; };
                this.errorAlertState.onCancel = () => { this.errorAlertState.isOpen = false; };
                this.errorAlertState.isOpen = true;
            }

        } finally {
            if (!isRetrying && !isWaitingForUser) {
                this._isLoading = false;
                this._retryCount = 0;
                this._abortController = null;
            }
        }
    }


    private async _saveNewBranchLog(parentLog: LogWithSessionId, newLog: LogWithSessionId) {
        this._logs.set(newLog.id, newLog);
        await this.repo.saveLog(newLog);

        const parentRef = this._logs.get(parentLog.id);
        if (parentRef) {
            parentRef.activeChildId = newLog.id;
            await this.repo.updateActiveChild(parentRef.id, newLog.id);
        }

        await this.repo.touchSession(this._sessionId);
        this._refreshDisplayLogs();
        await tick();
    }

    private async _rotateApiKeyAndRetry(triggerUserLog: LogWithSessionId, historyLogs: LogWithSessionId[]) {
        const settings = appSettings.value;
        const keys = settings.apiKeys;
        if (keys.length <= 1) return;

        const currentIndex = keys.findIndex(k => k.id === settings.activeApiKeyId);
        let nextIndex = currentIndex + 1;

        if (nextIndex >= keys.length) {
            nextIndex = 0;
        }

        const nextKeyId = keys[nextIndex].id;

        settings.activeApiKeyId = nextKeyId;
        appSettings.save();

        console.log(`Rotated API Key to: ${keys[nextIndex].name}`);

        await this._runAiGeneration(triggerUserLog, historyLogs, 0);
    }

    // --- Public Methods ---

    async init() {
        this._isLoading = true;
        try {
            const latestId = await this.repo.getLatestSessionId();
            await this.load(latestId);
        } finally {
            this._isLoading = false;
        }
    }

    async load(id?: string) {
        this._isLoading = true;
        try {
            this._logs.clear();
            if (id) {
                this._sessionId = id;
                const logs = await this.repo.loadLogs(id);
                logs.forEach(log => this._logs.set(log.id, log));
            } else {
                this._sessionId = uuidv4();
                this._displayLogs = [];
            }
            this._refreshDisplayLogs();

            this._runImageCorrectionExtraction();

        } finally {
            this._isLoading = false;
        }
    }

    async sendMessage() {
        if (this._isLoading) return;

        const settings = appSettings.value;
        const activeDice = settings.diceRolls?.filter(d => d.isEnabled) ?? [];
        const hasDice = activeDice.length > 0;
        const hasAttachments = this._attachments.length > 0; // 追加

        // 既存の入力判定に添付ファイル有無を追加
        if (!this._inputMessage.trim() && !hasDice && !hasAttachments) return;

        // 1. Files APIの有効期限チェック (追加)
        const now = new Date();
        const expiredFiles = this._attachments.filter(a =>
            a.storageType === 'fire_storage' && a.expiration && new Date(a.expiration) <= now
        );

        if (expiredFiles.length > 0) {
            this.errorAlertState.message = "期限切れのファイルが含まれています。除外して送信しますか？";
            this.errorAlertState.onConfirm = async () => {
                this._attachments = this._attachments.filter(a => !expiredFiles.includes(a));
                this.errorAlertState.isOpen = false;
                await this.sendMessage();
            };
            this.errorAlertState.onCancel = () => {
                this.errorAlertState.isOpen = false;
            };
            this.errorAlertState.isOpen = true;
            return;
        }

        this._isLoading = true;

        // 2. 入力処理
        const userCleanText = this._inputMessage;
        this._inputMessage = "";

        // メッセージ確定用の一時保管 (追加)
        const currentAttachments = JSON.parse(JSON.stringify(this._attachments));
        this._attachments = []; // 送信開始と同時にUIからはクリア

        const { textToSave } = this.composer.compose(userCleanText, settings);

        // 3. セッション更新
        let previewText = textToSave;
        if (previewText.includes(DICE_SEPARATOR)) {
            const parts = previewText.split(DICE_SEPARATOR);
            previewText = parts.slice(1).join(DICE_SEPARATOR);
        }
        // セッションプレビューにファイル有無を反映 (追加)
        const sessionPreview = previewText.slice(0, 30) || (currentAttachments.length > 0 ? "(ファイル添付)" : "New Chat");
        await this.repo.createOrUpdateSession(this._sessionId, sessionPreview);

        // 4. ユーザーログ保存
        const currentPath = this._displayLogs;
        const parentLog = currentPath.length > 0 ? currentPath[currentPath.length - 1] : null;

        const userLog: LogWithSessionId = {
            id: uuidv4(),
            sessionId: this._sessionId,
            speaker: 'user',
            text: textToSave,
            thoughtProcess: textToSave,
            timestamp: new Date().toISOString(),
            parentId: parentLog ? parentLog.id : null,
            activeChildId: null,
            tokenUsage: { input: 0, output: 0, total: 0, cached: 0, thinking: 0 },
            attachments: currentAttachments // 追加
        };

        this._logs.set(userLog.id, userLog);
        await this.repo.saveLog(userLog);

        if (parentLog) {
            const parentRef = this._logs.get(parentLog.id);
            if (parentRef) {
                parentRef.activeChildId = userLog.id;
                await this.repo.updateActiveChild(parentRef.id, userLog.id);
            }
        }

        this._refreshDisplayLogs();
        await tick();

        if (this._displayLogs.length === 1 && this._displayLogs[0].speaker === 'user') {
            ImageCorrectionService.defineDictionary(this._displayLogs[0].text);
        }

        // 5. AI生成呼び出し
        const history = this._displayLogs.filter(l => l.id !== userLog.id);
        await this._runAiGeneration(userLog, history);
    }

    async regenerate(logId: string) {
        if (this._isLoading) return;

        const targetLog = this._logs.get(logId);
        if (!targetLog) return;

        let triggerUserLog: LogWithSessionId | undefined;
        if (targetLog.speaker === 'user') {
            triggerUserLog = targetLog;
        } else {
            if (!targetLog.parentId) return;
            triggerUserLog = this._logs.get(targetLog.parentId);
        }

        if (!triggerUserLog) return;
        this._isLoading = true;

        const settings = appSettings.value;
        const originalText = triggerUserLog.text;
        const newText = this.composer.recompose(originalText, settings);

        if (newText !== originalText) {
            triggerUserLog.text = newText;
            await this._updateLogEntity(triggerUserLog);
        }

        const currentPath = this._displayLogs;
        const parentIndex = currentPath.findIndex(l => l.id === triggerUserLog!.id);

        if (parentIndex === -1) {
            console.error("再生成対象が現在のアクティブパスに含まれていません");
            this._isLoading = false;
            return;
        }

        const historyLogs = currentPath.slice(0, parentIndex);

        // AI生成実行
        await this._runAiGeneration(triggerUserLog, historyLogs);
    }

    async updateLog(id: string, text: string) {
        const log = this._logs.get(id);
        if (log) {
            let textToSave = text;
            if (appSettings.value.assist.autoCorrectUrl) {
                textToSave = ImageCorrectionService.correctText(text);
            }

            const updatedLog = { ...log, text: textToSave };
            this._logs.set(id, updatedLog);
            await this.repo.updateLogText(id, textToSave);
            this._refreshDisplayLogs();
        }
    }

    async deleteLog(id: string) {
        const targetLog = this._logs.get(id);
        if (!targetLog) return;

        const parentId = targetLog.parentId;
        const parentLog = parentId ? this._logs.get(parentId) : null;
        const children = Array.from(this._logs.values()).filter(l => l.parentId === id);

        for (const child of children) {
            child.parentId = parentId;
            await this.repo.updateLogParent(child.id, parentId);
        }

        if (parentLog) {
            let nextActiveId: string | null = null;
            if (targetLog.activeChildId) {
                const childExists = children.some(c => c.id === targetLog.activeChildId);
                if (childExists) nextActiveId = targetLog.activeChildId;
            }
            if (!nextActiveId) {
                nextActiveId = this.treeManager.findNewActiveChildAfterDeletion(parentLog.id, id, this._logs);
            }

            parentLog.activeChildId = nextActiveId;
            await this.repo.updateActiveChild(parentLog.id, nextActiveId);
        }
        this._logs.delete(id);
        await this.repo.deleteLog(id);
        this._refreshDisplayLogs();
    }

    getSiblingInfo(logId: string) {
        return this.treeManager.getSiblingInfo(logId, this._logs);
    }

    async switchBranch(logId: string, direction: 'prev' | 'next') {
        const targetSiblingId = this.treeManager.findNextSiblingId(logId, direction, this._logs);

        if (!targetSiblingId) return;

        const log = this._logs.get(logId);
        if (log && log.parentId) {
            const parentLog = this._logs.get(log.parentId);
            if (parentLog) {
                parentLog.activeChildId = targetSiblingId;
                await this.repo.updateActiveChild(parentLog.id, targetSiblingId);
                this._refreshDisplayLogs();
            }
        }
    }
}

export function createChatSession() { return new ChatSession(); }
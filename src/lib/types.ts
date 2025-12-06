// src/lib/types.ts

/**
 * ダイスロール機能の設定
 * 複数の設定を管理できるようidを追加
 */
export interface DiceRoll {
	id: string; // ダイスロール設定の一意なID
	isEnabled: boolean; // 機能が有効か
	instructionText: string; // 指示文章
	diceCount: number; // ダイスの数
	diceType: number; // ダイスの種類 (例: 6, 100)
}

/**
 * カスタム選択肢機能の設定
 * ユーザーが定義したテキストリストからランダムに1つを選択
 */
export interface CustomChoiceRoll {
	id: string; // カスタム選択肢設定の一意なID
	isEnabled: boolean; // 機能が有効か
	instructionText: string; // 指示文章
	options: string[]; // カスタム選択肢の配列（例: ["大成功", "成功", "失敗", "大失敗"]）
}


export interface ApiKey {
	id: string;
	name: string;
	key: string;
}

/**
 * UI設定
 */
export interface UiSettings {
	showTokenCount: boolean;
	useCustomFontSize: boolean;
	chatFontSize: number;
	showSpeakerNameInTranscript: boolean;
	fontFamily: string;
	enterToSend: boolean;
}

/**
 * APIエラー時のリトライ設定
 */
export interface ApiErrorHandlingSettings {
	loopApiKeys: boolean;
	exponentialBackoff: boolean;
	maxRetries: number;
	initialWaitTime: number;
}

/**
 * アシスト機能設定
 */
export interface AssistSettings {
	autoCorrectUrl: boolean;
	summarizeOnTokenOverflow: boolean;
	tokenThreshold: number;
	saveMinimalMetadata: boolean;
	useCombinedHistoryFormat: boolean; // 履歴を1つのユーザーメッセージに結合するか
}

/**
 * AIモデルの生成設定
 */
export interface GenerationSettings {
	temperature: number | null;
	topK: number | null;
	topP: number | null;
	maxOutputTokens: number | null;
	thinkingBudget: number | null;
	includeThoughts: boolean;
}

/**
 * トークン使用量アラート設定
 */
export interface TokenUsageAlertSettings {
	isEnabled: boolean;
	thresholdUSD: number;
}

/**
 * バックアップ設定
 */
export interface BackupSettings {
	isEnabled: boolean;
	autoBackup: boolean; // 自動バックアップが有効か
	lastBackupAt: string | null; // 最後のバックアップ日時 (ISO string)
}

export interface PromptPreset {
	id: string;
	title: string;
	text: string;
}

export interface TemplatePromptConfig {
	isEnabled: boolean;
	activePresetId: string;
	presets: PromptPreset[];
}

export interface AppSettings {
	apiKeys: ApiKey[];
	activeApiKeyId: string | null;
	model: string;
	availableModelList?: string[];
	systemPrompt: TemplatePromptConfig;
	dummyUserPrompt: TemplatePromptConfig;
	dummyModelPrompt: TemplatePromptConfig;
	ui: UiSettings;
	apiErrorHandling: ApiErrorHandlingSettings;
	assist: AssistSettings;
	generation: GenerationSettings;
	backup: BackupSettings;
	lastUsedAuthorName?: string;
	tokenUsageAlert?: TokenUsageAlertSettings;
	currency?: 'USD' | 'JPY';
	exchangeRate?: number;
	diceRolls?: DiceRoll[];
	lastRateUpdate?: string;
	diceRollMarkers?: {
		isEnabled: boolean;
		start: string;
		end: string;
		useMultipart?: boolean;
	};
	customChoiceRolls?: CustomChoiceRoll[];
	customChoiceMarkers?: {
		isEnabled: boolean;
		start: string;
		end: string;
		useMultipart?: boolean;
	};
	quickClipboard?: string; // 専用クリップボード
}

/**
 * 会話内の単一のメッセージを表す。
 * 全てのメッセージは親子関係を持ち、フラットな配列で管理される。
 */
export interface Log {
	id: string; // 全メッセージで一意なID
	speaker: 'user' | 'model';
	text: string;
	timestamp: string;
	parentId: string | null; // 親メッセージのID。会話の始点はnull
	/**
	 * このメッセージから複数の子メッセージ（分岐）が続く場合に、
	 * 現在アクティブな子のIDを保持する。
	 */
	activeChildId: string | null;
	metadata?: any;
	/**
	 * トークン使用量
	 */
	tokenUsage?: {
		input: number;    // promptTokenCount
		output: number;   // candidatesTokenCount
		total: number;    // totalTokenCount
		cached: number;   // cachedContentTokenCount
		thinking: number; // thoughtsTokenCount
	};
	thoughtProcess?: string;
	attachments?: AttachedFile[];
}

export interface AttachedFile {
	id: string; // 一意なID
	name: string; // ファイル名
	mimeType: string;

	// 保存方式の分岐フラグ
	storageType: 'inline' | 'fire_storage';

	// 10MB未満 (Inline Data) 用
	data?: string; // Base64文字列

	// 10MB以上 (Files API) 用
	fileUri?: string; // Google API返却の fileUri
	expiration?: string; // 有効期限 (ISO string)
}

export type SessionMeta = Omit<Session, 'logs'>;
export type LogWithSessionId = Log & { sessionId: string };

/**
 * 日次・モデル別のトークン使用履歴
 * 主キーは [date, model] の複合キーとなります
 */
export interface TokenUsageHistory {
	date: string;        // YYYY-MM-DD
	model: string;       // gemini-2.5-pro 等

	// --- <= 200k ティア用バケツ ---
	inputTokens: number;      // (prompt - cached)
	outputTokens: number;     // (candidates + thinking)
	cachedTokens: number;     // (cached)

	// --- > 200k ティア用バケツ ---
	inputTokensOver200k: number;
	outputTokensOver200k: number;
	cachedTokensOver200k: number;

	// --- 統計・内訳用 (料金計算には直接使わない) ---
	thinkingTokens: number; // 思考トークン総数 (outputTokens, outputTokensOver200kに含まれる分の内訳)
	totalTokens: number;    // 単純な合計 (APIレスポンスのtotal)
}

export interface Session {
	id: string;
	title: string;
	createdAt: string;
	lastUpdatedAt: string;
	/**
	 * @description 会話ログの構造をLogのフラットな配列に変更
	 */
	logs: Log[];

}

// ===================================================================
// 4. APIとの通信で使用するデータ型
// ===================================================================
export interface ConversationContext {
	logs: {
		speaker: 'user' | 'ai';
		text: string;
		attachments?: AttachedFile[];
	}[];
}

// src/lib/settings.svelte.ts
import { browser } from "$app/environment";
import type { AppSettings } from "$lib/types";
import { DEFAULT_SETTINGS as CONST_DEFAULT } from "$lib/constants";

const SETTINGS_KEY = "appSettings";

// 新しい設定構造を反映した DEFAULT_SETTINGS の再定義（もしくは定数ファイル側の更新が望ましいですが、ここではマージロジック用に完全な形を定義します）
export const DEFAULT_SETTINGS: AppSettings = {
	...CONST_DEFAULT,
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
	generation: {
		temperature: null,
		topK: null,
		topP: null,
		maxOutputTokens: null,
		thinkingBudget: null,
		includeThoughts: false
	},
	quickClipboard: ""
};

export function loadSettings(): AppSettings {
	if (!browser) return DEFAULT_SETTINGS;

	const stored = localStorage.getItem(SETTINGS_KEY);
	if (!stored) return DEFAULT_SETTINGS;

	try {
		const parsed = JSON.parse(stored);
		return {
			...DEFAULT_SETTINGS, ...parsed,
			ui: { ...DEFAULT_SETTINGS.ui, ...parsed.ui },
			apiErrorHandling: { ...DEFAULT_SETTINGS.apiErrorHandling, ...parsed.apiErrorHandling },
			assist: { ...DEFAULT_SETTINGS.assist, ...parsed.assist },
			// generation設定のマージ（新しいフィールドである thinkingBudget 等が欠損しないように）
			generation: { ...DEFAULT_SETTINGS.generation, ...parsed.generation },
			backup: { ...DEFAULT_SETTINGS.backup, ...parsed.backup },
			systemPrompt: { ...DEFAULT_SETTINGS.systemPrompt, ...parsed.systemPrompt },
			// 新規プロンプト設定のマージ
			dummyUserPrompt: { ...DEFAULT_SETTINGS.dummyUserPrompt, ...parsed.dummyUserPrompt },
			dummyModelPrompt: { ...DEFAULT_SETTINGS.dummyModelPrompt, ...parsed.dummyModelPrompt },
		};
	} catch (e) {
		console.error("Failed to load settings:", e);
		return DEFAULT_SETTINGS;
	}
}

export function saveSettings(settings: AppSettings) {
	if (!browser) return;
	try {
		localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
	} catch (e) {
		console.error("Failed to save settings:", e);
	}
}

class AppSettingsManager {
	value = $state(loadSettings());
	_timer: ReturnType<typeof setTimeout> | undefined;

	save() {
		clearTimeout(this._timer);
		this._timer = setTimeout(() => {
			saveSettings(this.value);
		}, 1000);
	}
}

export const appSettings = new AppSettingsManager();

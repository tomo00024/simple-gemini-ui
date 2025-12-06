import { appSettings } from '$lib/settings.svelte';
import { dropboxService } from './dropbox';
import { db } from '$lib/db';

class BackupManager {
    private pendingSessionIds = new Set<string>();
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly DEBOUNCE_MS = 5000; // 5秒

    // UIの状態と連携
    isLoggedIn = $state(dropboxService.isLoggedIn);

    async init() {
        const success = await dropboxService.handleAuthCallback();
        if (success) {
            this.isLoggedIn = true;
            this.triggerCleanup();
        }
    }

    login() {
        dropboxService.login();
    }

    logout() {
        dropboxService.logout();
        this.isLoggedIn = false;
        appSettings.value.backup.isEnabled = false;
    }

    // 変更通知 (layoutから呼ばれる)
    notifyChange(sessionId: string) {
        if (!this.isLoggedIn || !appSettings.value.backup.isEnabled) return;
        this.pendingSessionIds.add(sessionId);
        this.scheduleBackup();
    }

    // 手動バックアップ用 (変更箇所)
    async forceBackupAll() {
        if (!this.isLoggedIn) return;
        const sessions = await db.sessions.toArray();
        for (const s of sessions) {
            this.pendingSessionIds.add(s.id);
        }
        // 手動フラグを立てて実行
        await this.performBackup({ isManual: true });
    }

    private scheduleBackup() {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this.performBackup(), this.DEBOUNCE_MS);
    }

    // 実行処理 (変更箇所: options引数を追加)
    private async performBackup(options?: { isManual?: boolean }) {
        if (this.pendingSessionIds.size === 0) return;
        const idsToBackup = Array.from(this.pendingSessionIds);
        this.pendingSessionIds.clear();

        try {
            for (const id of idsToBackup) {
                const session = await db.sessions.get(id);
                if (!session) continue;
                const logs = await db.logs.where('sessionId').equals(id).toArray();

                // dropboxServiceへオプションを渡す
                await dropboxService.uploadSession(session, logs, options);
            }
            // 設定の更新
            appSettings.value.backup.lastBackupAt = new Date().toISOString();
            appSettings.save();

            this.triggerCleanup();
        } catch (e) {
            console.error('Auto backup failed:', e);
            // 失敗した場合、IDをpendingに戻すべきだが、無限ループ回避のため今回はログ出力のみ
        }
    }

    private triggerCleanup() {
        dropboxService.cleanupOldBackups().catch(e => console.error('Cleanup error:', e));
    }
}

export const backupManager = new BackupManager();
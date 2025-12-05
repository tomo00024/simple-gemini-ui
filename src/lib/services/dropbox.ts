import { Dropbox, DropboxAuth } from 'dropbox';
import { browser } from '$app/environment';
import type { Session, LogWithSessionId } from '$lib/types';

// ★あなたのApp Key
const CLIENT_ID = 'eosyp7rbpe5x9ao';

// Construct the redirect URI to match the current location
// For GitHub Pages, this will be: https://tomo00024.github.io/simple-gemini-ui/
// For localhost, this will be: http://localhost:5173/
const REDIRECT_URI = browser ? `${window.location.origin}${window.location.pathname}` : '';

export interface BackupFile {
    meta: Omit<Session, 'logs'>;
    logs: LogWithSessionId[];
}

export class DropboxService {
    private dbx: Dropbox | null = null;
    public auth: DropboxAuth;

    constructor() {
        console.log('[DropboxDebug] Service initialized');
        this.auth = new DropboxAuth({ clientId: CLIENT_ID });
        this.initializeFromStorage();
    }

    private initializeFromStorage() {
        if (!browser) return;
        const accessToken = localStorage.getItem('dropbox_access_token');

        console.log('[DropboxDebug] Load from storage. Token exists?', !!accessToken);

        if (accessToken) {
            this.dbx = new Dropbox({
                accessToken: accessToken,
                clientId: CLIENT_ID
            });
        }
    }

    // --- ログイン処理 ---
    async login() {
        console.log('[DropboxDebug] Login process started.');
        const scopes = ['files.content.write', 'files.content.read'];
        console.log('[DropboxDebug] Requesting scopes:', scopes);

        const authUrl = await this.auth.getAuthenticationUrl(
            REDIRECT_URI,
            undefined,
            'code',
            'offline',
            undefined,
            undefined,
            true
        );

        const codeVerifier = this.auth.getCodeVerifier();
        if (codeVerifier) {
            window.sessionStorage.setItem('dropbox_code_verifier', codeVerifier);
        }

        window.location.href = authUrl.toString();
    }

    // --- コールバック処理 ---
    async handleAuthCallback() {
        if (!browser) return false;
        const searchParams = new URLSearchParams(window.location.search);
        const code = searchParams.get('code');

        if (!code) return false;

        console.log('[DropboxDebug] Auth code received from URL.');

        try {
            const codeVerifier = window.sessionStorage.getItem('dropbox_code_verifier');
            if (codeVerifier) {
                this.auth.setCodeVerifier(codeVerifier);
            }

            const response = await this.auth.getAccessTokenFromCode(REDIRECT_URI, code);
            const result = response.result as any;

            localStorage.setItem('dropbox_access_token', result.access_token);
            if (result.refresh_token) {
                localStorage.setItem('dropbox_refresh_token', result.refresh_token);
            }

            window.sessionStorage.removeItem('dropbox_code_verifier');
            this.initializeFromStorage();
            window.history.replaceState({}, document.title, window.location.pathname);
            console.log('[DropboxDebug] Auth successful.');
            return true;
        } catch (error) {
            console.error('[DropboxDebug] Auth Failed:', error);
            return false;
        }
    }

    logout() {
        console.log('[DropboxDebug] Logging out.');
        localStorage.removeItem('dropbox_access_token');
        localStorage.removeItem('dropbox_refresh_token');
        this.dbx = null;
    }

    get isLoggedIn() {
        return !!this.dbx;
    }

    // --- アップロード処理 (変更箇所) ---
    // options引数を追加
    async uploadSession(
        session: Omit<Session, 'logs'>,
        logs: LogWithSessionId[],
        options?: { isManual?: boolean }
    ) {
        console.log('[DropboxDebug] Upload requested for session:', session.title, options);

        if (!this.dbx) {
            console.error('[DropboxDebug] Error: Not logged in');
            throw new Error('Not logged in');
        }

        const dateDir = new Date().toISOString().split('T')[0];
        const safeTitle = session.title
            .replace(/[\\/:*?"<>|\x00-\x1F]/g, '_')
            .trim()
            .substring(0, 50) || 'Untitled';

        let fileName = `${safeTitle}_${session.id}.json`;

        // 手動バックアップの場合、ファイル名に _manual_HHMMSS を付与
        if (options?.isManual) {
            const now = new Date();
            const timeStr = [
                now.getHours().toString().padStart(2, '0'),
                now.getMinutes().toString().padStart(2, '0'),
                now.getSeconds().toString().padStart(2, '0')
            ].join('');
            fileName = `${safeTitle}_${session.id}_manual_${timeStr}.json`;
        }

        const path = `/${dateDir}/${fileName}`;
        console.log('[DropboxDebug] Target Path:', path);

        const data: BackupFile = { meta: session, logs };
        const fileContent = new Blob([JSON.stringify(data, null, 2)], {
            type: 'application/json'
        });

        try {
            await this.dbx.filesUpload({
                path: path,
                contents: fileContent,
                mode: { '.tag': 'overwrite' }, // ファイル名が異なるので手動の場合は実質新規作成になる
                autorename: false,
                mute: true
            });
            console.log('[DropboxDebug] Upload Success');
        } catch (error: any) {
            console.error('[DropboxDebug] Upload Failed:', error);
            throw error;
        }
    }

    async cleanupOldBackups() {
        if (!this.dbx) return;
        try {
            const result = await this.dbx.filesListFolder({ path: '' });
            const folders = result.result.entries.filter(e => e['.tag'] === 'folder');
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            for (const folder of folders) {
                if (/^\d{4}-\d{2}-\d{2}$/.test(folder.name)) {
                    const folderDate = new Date(folder.name);
                    if (folderDate < thirtyDaysAgo) {
                        await this.dbx.filesDeleteV2({ path: folder.path_lower! });
                    }
                }
            }
        } catch (e) {
            console.warn('[DropboxDebug] Cleanup skipped or failed:', e);
        }
    }

    async listDateFolders(): Promise<string[]> {
        if (!this.dbx) return [];
        try {
            const result = await this.dbx.filesListFolder({ path: '' });
            return result.result.entries
                .filter(e => e['.tag'] === 'folder' && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
                .map(e => e.name)
                .sort((a, b) => b.localeCompare(a));
        } catch (e) {
            console.error('[DropboxDebug] listDateFolders failed:', e);
            return [];
        }
    }

    async listSessionsInDate(dateFolder: string) {
        if (!this.dbx) return [];
        try {
            const result = await this.dbx.filesListFolder({ path: `/${dateFolder}` });
            return result.result.entries
                .filter(e => e.name.endsWith('.json'))
                .map(e => ({ name: e.name, path: e.path_lower! }));
        } catch (e) {
            console.error('[DropboxDebug] listSessionsInDate failed:', e);
            return [];
        }
    }

    async downloadSession(path: string): Promise<BackupFile> {
        if (!this.dbx) throw new Error('Not logged in');
        const result = await this.dbx.filesDownload({ path });
        const blob = (result.result as any).fileBlob;
        const text = await blob.text();
        return JSON.parse(text);
    }
}

export const dropboxService = new DropboxService();
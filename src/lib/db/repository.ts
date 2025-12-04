// src/lib/db/repository.ts
import { db } from '$lib/db';
import type { LogWithSessionId, SessionMeta } from '$lib/types';
import { v4 as uuidv4 } from 'uuid'; // uuidが必要になります

export class ChatRepository {
    async loadLogs(sessionId: string): Promise<LogWithSessionId[]> {
        return await db.logs.where('sessionId').equals(sessionId).sortBy('timestamp');
    }

    async saveLog(log: LogWithSessionId): Promise<void> {
        await db.logs.put(log);
    }

    async updateLogText(id: string, text: string): Promise<void> {
        await db.logs.update(id, { text });
    }

    async updateLogParent(id: string, parentId: string | null): Promise<void> {
        await db.logs.update(id, { parentId });
    }

    async updateActiveChild(id: string, activeChildId: string | null): Promise<void> {
        await db.logs.update(id, { activeChildId });
    }

    async deleteLog(id: string): Promise<void> {
        await db.logs.delete(id);
    }

    // 既存: メッセージ送信時に呼ばれる（存在しない場合のみタイトル設定）
    async createOrUpdateSession(id: string, title: string): Promise<void> {
        const now = new Date().toISOString();
        const exists = await db.sessions.get(id);

        if (!exists) {
            await db.sessions.add({
                id,
                title,
                createdAt: now,
                lastUpdatedAt: now
            });
        } else {
            await db.sessions.update(id, { lastUpdatedAt: now });
        }
    }

    // 追加: セッション情報の取得
    async getSession(id: string): Promise<SessionMeta | undefined> {
        return await db.sessions.get(id);
    }

    // 追加: タイトルを明示的に更新（レコードがなければ新規作成してタイトルを確定させる）
    async updateSessionTitle(id: string, title: string): Promise<void> {
        const now = new Date().toISOString();
        const exists = await db.sessions.get(id);

        if (exists) {
            await db.sessions.update(id, {
                title,
                lastUpdatedAt: now
            });
        } else {
            // まだメッセージがない状態でタイトルを決めた場合、ここでセッションを作成する
            // これにより、後のsendMessageでの自動タイトル設定（上書き）を防ぐことができる
            await db.sessions.add({
                id,
                title,
                createdAt: now,
                lastUpdatedAt: now
            });
        }
    }

    async touchSession(id: string): Promise<void> {
        await db.sessions.update(id, { lastUpdatedAt: new Date().toISOString() });
    }

    async getLatestSessionId(): Promise<string | undefined> {
        const session = await db.sessions.orderBy('lastUpdatedAt').reverse().first();
        return session?.id;
    }
    // --- 追加: セッション削除 ---
    async deleteSession(sessionId: string): Promise<void> {
        await db.transaction('rw', db.sessions, db.logs, async () => {
            // ログとセッション情報を一括削除
            await db.logs.where('sessionId').equals(sessionId).delete();
            await db.sessions.delete(sessionId);
        });
    }

    // --- 追加: セッション複製 ---
    async duplicateSession(sourceId: string): Promise<string> {
        return await db.transaction('rw', db.sessions, db.logs, async () => {
            // 1. 元のセッション情報を取得
            const sourceSession = await db.sessions.get(sourceId);
            if (!sourceSession) throw new Error("Session not found");

            // 2. 元のログを全て取得
            const sourceLogs = await db.logs.where('sessionId').equals(sourceId).toArray();

            // 3. 新しいセッションIDと現在時刻
            const newSessionId = uuidv4();
            const now = new Date().toISOString();

            // 4. IDのマッピングを作成 (旧ID -> 新ID)
            const idMap = new Map<string, string>();
            sourceLogs.forEach(log => {
                idMap.set(log.id, uuidv4());
            });

            // 5. 新しいログオブジェクトを作成（IDと参照を書き換え）
            const newLogs: LogWithSessionId[] = sourceLogs.map(log => ({
                ...log,
                id: idMap.get(log.id)!,       // 新しいID
                sessionId: newSessionId,      // 新しいセッションID
                // 親IDもマップから引く（nullならnullのまま）
                parentId: log.parentId ? idMap.get(log.parentId) ?? null : null,
                // アクティブな子IDもマップから引く
                activeChildId: log.activeChildId ? idMap.get(log.activeChildId) ?? null : null,
                // タイムスタンプは元のままにするか、現在時刻にするか。
                // 会話の流れを維持するため元のタイムスタンプを維持しつつ、セッションの更新日時だけ新しくするのが一般的です。
            }));

            // 6. 新しいセッションを作成
            await db.sessions.add({
                id: newSessionId,
                title: `${sourceSession.title} のコピー`, // タイトルに「のコピー」をつける
                createdAt: now,
                lastUpdatedAt: now
            });

            // 7. 新しいログを一括保存
            await db.logs.bulkAdd(newLogs);

            return newSessionId;
        });
    }
}
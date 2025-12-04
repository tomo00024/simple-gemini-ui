import Dexie from 'dexie';
import type { Table } from 'dexie';
import type { Log, Session, TokenUsageHistory, SessionMeta, LogWithSessionId } from './types';

export class AppDatabase extends Dexie {
    sessions!: Table<SessionMeta>;
    logs!: Table<LogWithSessionId>;
    tokenHistory!: Table<TokenUsageHistory>;

    constructor() {
        super('SimpleGeminiDB');

        // Version 3: 新しいスキーマでテーブルを再作成
        // [date+model] を複合主キーとして定義
        this.version(3).stores({
            sessions: 'id, lastUpdatedAt',
            logs: 'id, sessionId, timestamp',
            tokenHistory: '[date+model], date, model'
        });

        // Version 2: PK変更のために古いテーブルを一度削除 (tokenHistory: null)
        // DexieではPKを変更する場合、一度削除して再作成する必要があります
        this.version(2).stores({
            sessions: 'id, lastUpdatedAt',
            logs: 'id, sessionId, timestamp',
            tokenHistory: null
        });

        // Version 1: 初期のスキーマ
        this.version(1).stores({
            sessions: 'id, lastUpdatedAt',
            logs: 'id, sessionId, timestamp',
            tokenHistory: 'date'
        });
    }
}

export const db = new AppDatabase();
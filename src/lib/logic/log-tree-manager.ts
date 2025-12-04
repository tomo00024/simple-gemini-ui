// src/lib/logic/log-tree-manager.ts
import type { LogWithSessionId } from '$lib/types';

export class LogTreeManager {
    /**
     * 現在のログMapから、表示すべきルート〜末端までのパスを計算する
     */
    calculateActivePath(logs: Map<string, LogWithSessionId>): LogWithSessionId[] {
        if (logs.size === 0) return [];

        let root = Array.from(logs.values()).find(l => !l.parentId);
        if (!root) {
            // ルートが見つからない場合のフォールバック（タイムスタンプ最古）
            const all = Array.from(logs.values());
            if (all.length > 0) {
                root = all.slice().sort((a, b) => a.timestamp.localeCompare(b.timestamp))[0];
            }
        }
        if (!root) return [];

        const path: LogWithSessionId[] = [root];
        let current = root;
        let depth = 0;

        // activeChildId を辿ってパスを構築
        while (current.activeChildId && depth < 10000) {
            const child = logs.get(current.activeChildId);
            if (child) {
                path.push(child);
                current = child;
                depth++;
            } else {
                break;
            }
        }
        return path;
    }

    /**
     * 指定されたログの兄弟情報を計算する（ページネーション用）
     */
    getSiblingInfo(logId: string, logs: Map<string, LogWithSessionId>) {
        const log = logs.get(logId);
        if (!log) return { current: 1, total: 1, hasPrev: false, hasNext: false };

        const siblings = Array.from(logs.values())
            .filter(l => l.parentId === log.parentId)
            .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

        const index = siblings.findIndex(l => l.id === logId);
        return {
            current: index + 1,
            total: siblings.length,
            hasPrev: index > 0,
            hasNext: index < siblings.length - 1
        };
    }

    /**
     * ブランチ切り替え時の新しい activeChildId を計算する
     */
    findNextSiblingId(logId: string, direction: 'prev' | 'next', logs: Map<string, LogWithSessionId>): string | null {
        const log = logs.get(logId);
        if (!log || !log.parentId) return null;

        const siblings = Array.from(logs.values())
            .filter(l => l.parentId === log.parentId)
            .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

        const currentIndex = siblings.findIndex(l => l.id === logId);
        if (currentIndex === -1) return null;

        const newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
        if (newIndex < 0 || newIndex >= siblings.length) return null;

        return siblings[newIndex].id;
    }

    /**
     * ログ削除時に、親ノードが次に指すべき activeChildId を計算する
     */
    findNewActiveChildAfterDeletion(parentId: string, deletedLogId: string, logs: Map<string, LogWithSessionId>): string | null {
        const siblings = Array.from(logs.values())
            .filter(l => l.parentId === parentId && l.id !== deletedLogId)
            .sort((a, b) => b.timestamp.localeCompare(a.timestamp)); // 新しい順

        return siblings.length > 0 ? siblings[0].id : null;
    }
}
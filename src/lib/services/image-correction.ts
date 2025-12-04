// src/lib/services/image-correction.ts

interface CorrectionDictionary {
    baseUrl: string | null;
    extension: string | null;
    keywords: string[];
}

export class ImageCorrectionService {
    private static dictionary: CorrectionDictionary = {
        baseUrl: null,
        extension: null,
        keywords: []
    };

    /**
     * 辞書定義
     */
    static defineDictionary(text: string): void {
        console.groupCollapsed('%c 📘 [ImageCorrection] Defining Dictionary ', 'background: #004d40; color: #fff; padding: 2px 5px; border-radius: 2px;');

        const ALLOWED_EXTENSIONS = ['jpg', 'png', 'webp', 'avif', 'jpeg', 'gif'];
        let foundExtension: string | null = null;
        const extractedKeywords: string[] = [];

        // ベースURL抽出
        const urlRegex = /https:\/\/[^/\s]+\.(?:app|com)/i;
        const urlMatch = text.match(urlRegex);
        const baseUrl = urlMatch ? urlMatch[0] : null;

        // キーワード抽出
        const segments = text.split(/[\n,]/);
        for (const segment of segments) {
            const s = segment.trim();
            if (s.length === 0 || s.length > 10) continue;

            let keywordPart = s;
            const dotIndex = s.lastIndexOf('.');

            if (dotIndex !== -1) {
                const potentialExt = s.substring(dotIndex + 1).toLowerCase();
                if (ALLOWED_EXTENSIONS.includes(potentialExt)) {
                    if (!foundExtension) foundExtension = potentialExt;
                    keywordPart = s.substring(0, dotIndex);
                }
            }

            if (keywordPart.length > 0) {
                extractedKeywords.push(keywordPart);
            }
        }

        // 拡張子が見つからない場合のフォールバック
        if (!foundExtension) {
            const extRegex = new RegExp(`\\.(${ALLOWED_EXTENSIONS.join('|')})\\b`, 'i');
            const extMatch = text.match(extRegex);
            if (extMatch) foundExtension = extMatch[1].toLowerCase();
        }

        this.dictionary = {
            baseUrl,
            extension: foundExtension,
            keywords: extractedKeywords
        };

        console.log('Dictionary:', this.dictionary);
        console.groupEnd();
    }

    /**
     * 完全ホワイトリスト方式 + 末尾パーツ拡張子Fuzzy検索
     */
    static correctText(text: string): string {
        console.groupCollapsed('%c 🛠️ [ImageCorrection] Correcting Text (Fuzzy Ext) ', 'background: #0d47a1; color: #fff; padding: 2px 5px; border-radius: 2px;');

        if (!this.dictionary.baseUrl || !this.dictionary.extension) {
            console.warn('❌ Dictionary incomplete. Skipping.');
            console.groupEnd();
            return text;
        }

        const lines = text.split('\n');
        const correctedLines = lines.map((line, index) => {
            // 1. 行の特定
            if (!this._isTargetLine(line)) {
                return line;
            }

            console.group(`🎯 Target Line (L${index + 1})`);
            console.log('Original:', line);

            // 2. 分割 (区切り文字: / または \)
            const parts = line.split(/[/\\\\]/);
            console.log('Parts:', parts);

            const validKeywords: string[] = [];

            for (let i = 0; i < parts.length; i++) {
                let candidate = parts[i].trim();
                const isLastPart = (i === parts.length - 1);

                if (!candidate) continue;

                // 3. 末尾パーツの場合の拡張子処理 (Fuzzy検索)
                if (isLastPart) {
                    // ターゲット: "." + 拡張子 (例: ".avif")
                    const targetExt = '.' + this.dictionary.extension;
                    console.log(`  🔎 Searching for extension "${targetExt}" in last part: "${candidate}"`);

                    // 拡張子の開始位置を探す (距離1以内)
                    const splitIndex = this._findFuzzyExtensionIndex(candidate, targetExt);

                    if (splitIndex !== -1) {
                        // 見つかった場合: 拡張子以降を切り捨てる
                        const original = candidate;
                        candidate = candidate.substring(0, splitIndex);
                        console.log(`    ✂️ Extension found at index ${splitIndex}. Cut: "${original}" -> "${candidate}"`);
                    } else {
                        // 見つからなかった場合: 案Aに従い、このパーツを破棄する
                        console.log(`    ❌ Extension not found (within dist 1). Discarding part.`);
                        continue;
                    }
                }

                // 4. クリーニング (記号除去)
                // 前後の記号除去
                candidate = candidate.replace(/^["'(!]+|["')!]+$/g, '');
                // 内部のノイズ除去 (ハイフン, カンマ, ドット, スペース)
                candidate = candidate.replace(/[-,\.\s]/g, '');

                if (!candidate) continue;

                // 5. ホワイトリスト照合 (Fuzzy検索)
                const result = this._findClosestKeywordWithLog(candidate);

                if (result.matched) {
                    console.log(`  ✅ Accepted: "${candidate}" -> "${result.word}" (Dist: ${result.distance})`);
                    validKeywords.push(result.word);
                } else {
                    console.log(`  🗑️ Rejected: "${candidate}" (Not in whitelist)`);
                }
            }

            // 6. 再構築
            if (validKeywords.length === 0) {
                console.log('❌ No valid keywords found. Keeping original.');
                console.groupEnd();
                return line;
            }

            const path = validKeywords.join('/');
            const newUrl = `${this.dictionary.baseUrl}/${path}.${this.dictionary.extension}`;
            const newLine = `![C](${newUrl} "画像")`;

            console.log('%c ✨ Rebuilt: ', 'color: #00e676; font-weight: bold;', newLine);
            console.groupEnd();
            return newLine;
        });

        console.groupEnd();
        return correctedLines.join('\n');
    }

    // --- Internal Helpers ---

    /**
     * 文字列の中からターゲット拡張子（に近い文字列）を探し、その開始位置を返す
     * 見つからない場合は -1
     */
    private static _findFuzzyExtensionIndex(text: string, target: string): number {
        const targetLen = target.length; // 例: .avif (5)
        const textLen = text.length;

        // ターゲット文字列より短い場合は、絶対にマッチしないので終了
        // (ただし、ターゲットが ".avif" で "avif" (4文字) の場合は距離1でマッチする可能性があるため、len - 1 までは許容)
        if (textLen < targetLen - 1) return -1;

        // 文字列の先頭からスキャンして、拡張子らしき場所を探す
        // ※後ろのゴミを無視するため、最初に見つかった「拡張子っぽい場所」を採用する
        for (let i = 0; i <= textLen; i++) {
            // ターゲットと同じ長さ、および -1 の長さのサブストリングをチェック
            // 例: ".avif" (5) に対して、text[i...i+5] と text[i...i+4] をチェック
            const lengthsToCheck = [targetLen, targetLen - 1];

            for (const len of lengthsToCheck) {
                if (i + len > textLen) continue;

                const sub = text.substring(i, i + len);
                const dist = this._levenshtein(sub, target);

                // 距離1以内でマッチしたらその位置を返す
                if (dist <= 1) {
                    // デバッグ用ログが必要ならここに
                    // console.log(`      Debug: Found match "${sub}" vs "${target}" (Dist: ${dist}) at ${i}`);
                    return i;
                }
            }
        }
        return -1;
    }

    private static _isTargetLine(line: string): boolean {
        if (!this.dictionary.extension) return false;
        let matchCount = 0;
        if (/https?/i.test(line)) matchCount++;
        if (line.toLowerCase().includes(this.dictionary.extension!)) matchCount++;
        if (/(app|com)/i.test(line)) matchCount++;
        return matchCount >= 2;
    }

    private static _findClosestKeywordWithLog(input: string): { matched: boolean, word: string, distance: number } {
        let bestMatch: string | null = null;
        let minDistance = Infinity;

        for (const target of this.dictionary.keywords) {
            const dist = this._levenshtein(input, target);
            if (dist >= minDistance) continue;

            const len = target.length;
            let isAcceptable = false;

            // Fuzzy判定基準
            if (len <= 2) {
                if (dist === 0) isAcceptable = true;
            } else if (len <= 5) {
                if (dist <= 1) isAcceptable = true;
            } else {
                if (dist <= 2) isAcceptable = true;
            }

            if (isAcceptable) {
                minDistance = dist;
                bestMatch = target;
            }
        }

        if (bestMatch) {
            return { matched: true, word: bestMatch, distance: minDistance };
        }
        return { matched: false, word: input, distance: -1 };
    }

    private static _levenshtein(s1: string, s2: string): number {
        const len1 = s1.length;
        const len2 = s2.length;
        const d: number[][] = [];
        for (let i = 0; i <= len1; i++) d[i] = [i];
        for (let j = 0; j <= len2; j++) d[0][j] = j;
        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
                d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
            }
        }
        return d[len1][len2];
    }
}
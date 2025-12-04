// src/lib/services/attachment.ts
import { GoogleGenAI } from "@google/genai";
import { v4 as uuidv4 } from 'uuid';
import type { AttachedFile } from '$lib/types';

const FILE_SIZE_THRESHOLD = 10 * 1024 * 1024; // 10MB
const MAX_IMAGE_DIMENSION = 1536;
const IMAGE_QUALITY = 0.8;

export class AttachmentService {

    /**
     * ファイルを受け取り、要件に従って処理（圧縮 or アップロード）を行い、AttachedFileオブジェクトを返す
     */
    static async processFile(file: File, apiKey: string): Promise<AttachedFile> {
        const id = uuidv4();
        const isImage = file.type.startsWith('image/');
        const isLarge = file.size >= FILE_SIZE_THRESHOLD;

        // 1. 10MB以上なら Files API へアップロード
        if (isLarge) {
            return await this.uploadToFilesApi(file, apiKey, id);
        }

        // 2. 10MB未満の場合
        if (isImage) {
            // 画像なら圧縮・リサイズ処理
            const base64 = await this.compressImage(file);
            return {
                id,
                name: file.name,
                mimeType: file.type, // 元のMIMEタイプを維持するか、変換後のJPEG/WebPにするかは圧縮の実装次第だが、ここでは簡単のためJPEG化を前提とする
                storageType: 'inline',
                data: base64
            };
        } else {
            // テキストなどはそのままBase64化
            const base64 = await this.fileToBase64(file);
            return {
                id,
                name: file.name,
                mimeType: file.type,
                storageType: 'inline',
                data: base64
            };
        }
    }

    private static async uploadToFilesApi(file: File, apiKey: string, id: string): Promise<AttachedFile> {
        const client = new GoogleGenAI({ apiKey });

        try {
            // upload() は Promise<File> を直接返します (File はSDK内の型)
            const uploadResult = await client.files.upload({
                file: file,
                config: {
                    displayName: file.name,
                    mimeType: file.type
                }
            });

            // ★修正: uploadResult.file ではなく uploadResult を直接参照します
            if (!uploadResult || !uploadResult.uri) {
                throw new Error("File upload failed: No URI returned.");
            }

            return {
                id,
                name: file.name,
                mimeType: file.type,
                storageType: 'fire_storage',
                fileUri: uploadResult.uri, // ★修正
                expiration: uploadResult.expirationTime // ★修正
            };
        } catch (error) {
            console.error("Files API Upload Error:", error);
            throw error;
        }
    }


    private static compressImage(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target?.result as string;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    // アスペクト比を維持してリサイズ
                    if (width > height) {
                        if (width > MAX_IMAGE_DIMENSION) {
                            height *= MAX_IMAGE_DIMENSION / width;
                            width = MAX_IMAGE_DIMENSION;
                        }
                    } else {
                        if (height > MAX_IMAGE_DIMENSION) {
                            width *= MAX_IMAGE_DIMENSION / height;
                            height = MAX_IMAGE_DIMENSION;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                        reject(new Error('Could not get canvas context'));
                        return;
                    }
                    ctx.drawImage(img, 0, 0, width, height);

                    // JPEGとして圧縮 (透明度が必要な場合はWebPなどを検討だが要件ではJPEG/WebPとあるためJPEGで統一)
                    // Data URLのプレフィックスを除去してBase64部分のみ返す
                    const dataUrl = canvas.toDataURL('image/jpeg', IMAGE_QUALITY);
                    const base64 = dataUrl.split(',')[1];
                    resolve(base64);
                };
                img.onerror = (err) => reject(err);
            };
            reader.onerror = (err) => reject(err);
        });
    }

    private static fileToBase64(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                const result = reader.result as string;
                // "data:mime/type;base64,..." の形式からBase64部分のみ抽出
                const base64 = result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = (error) => reject(error);
        });
    }
}
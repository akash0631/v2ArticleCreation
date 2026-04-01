
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

export interface UploadResult {
    url: string;
    path: string;
    key: string;
    uuid: string;
}

export class StorageService {
    private s3Client: S3Client;
    private bucket: string;
    private publicUrlBase: string | undefined;
    private approvedS3Client: S3Client;
    private approvedBucket: string;
    private approvedPublicUrlBase: string | undefined;

    private normalizeEnv(value?: string | null): string | undefined {
        const v = String(value || '').trim();
        return v || undefined;
    }

    private normalizeAccountId(value?: string | null): string | undefined {
        const raw = String(value || '').trim();
        if (!raw) return undefined;

        const noProto = raw.replace(/^https?:\/\//i, '');
        const hostAndPath = noProto.split('/')[0];
        const withoutSuffix = hostAndPath.replace(/\.r2\.cloudflarestorage\.com$/i, '');
        return withoutSuffix.trim() || undefined;
    }

    private isR2ApiStyleBaseUrl(url?: string): boolean {
        if (!url) return false;
        return /\.r2\.cloudflarestorage\.com(\/|$)/i.test(url);
    }

    private buildPublicUrl(baseUrl: string, bucket: string, key: string): string {
        const base = baseUrl.replace(/\/$/, '');
        const hasBucketInBase = new RegExp(`/${bucket.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|/)`, 'i').test(base);
        return hasBucketInBase ? `${base}/${key}` : `${base}/${key}`;
    }

    constructor() {
        const accountId = this.normalizeAccountId(process.env.R2_ACCOUNT_ID);
        const accessKeyId = this.normalizeEnv(process.env.R2_ACCESS_KEY_ID);
        const secretAccessKey = this.normalizeEnv(process.env.R2_SECRET_ACCESS_KEY);
        this.bucket = this.normalizeEnv(process.env.R2_BUCKET_NAME) || '';
        this.publicUrlBase = this.normalizeEnv(process.env.R2_PUBLIC_URL_BASE); // Custom domain or worker URL

        const approvedAccountId = this.normalizeAccountId(process.env.APPROVED_R2_ACCOUNT_ID) || accountId;
        const approvedAccessKeyId = this.normalizeEnv(process.env.APPROVED_R2_ACCESS_KEY_ID) || accessKeyId;
        const approvedSecretAccessKey = this.normalizeEnv(process.env.APPROVED_R2_SECRET_ACCESS_KEY) || secretAccessKey;
        this.approvedBucket = this.normalizeEnv(process.env.APPROVED_R2_BUCKET_NAME) || this.bucket;
        this.approvedPublicUrlBase = this.normalizeEnv(process.env.APPROVED_R2_PUBLIC_URL_BASE) || this.publicUrlBase;

        if (!accountId || !accessKeyId || !secretAccessKey || !this.bucket) {
            console.warn('⚠️ Cloudflare R2 credentials missing. Storage service may fail.');
        }

        this.s3Client = new S3Client({
            region: 'auto',
            endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
            forcePathStyle: true,
            requestChecksumCalculation: 'WHEN_REQUIRED',
            responseChecksumValidation: 'WHEN_REQUIRED',
            credentials: {
                accessKeyId: accessKeyId || '',
                secretAccessKey: secretAccessKey || ''
            }
        });

        this.approvedS3Client = new S3Client({
            region: 'auto',
            endpoint: `https://${approvedAccountId}.r2.cloudflarestorage.com`,
            forcePathStyle: true,
            requestChecksumCalculation: 'WHEN_REQUIRED',
            responseChecksumValidation: 'WHEN_REQUIRED',
            credentials: {
                accessKeyId: approvedAccessKeyId || '',
                secretAccessKey: approvedSecretAccessKey || ''
            }
        });
    }

    private isSignatureMismatchError(error: any): boolean {
        const code = String(error?.Code || error?.code || '').toLowerCase();
        const message = String(error?.message || '').toLowerCase();
        return code.includes('signaturedoesnotmatch') || message.includes('signaturedoesnotmatch');
    }

    private isAuthError(error: any): boolean {
        const code = String(error?.Code || error?.code || '').toLowerCase();
        const message = String(error?.message || '').toLowerCase();
        const status = Number(error?.statusCode || error?.$metadata?.httpStatusCode || 0);
        return (
            status === 401 ||
            status === 403 ||
            code.includes('accessdenied') ||
            code.includes('invalidaccesskeyid') ||
            code.includes('signaturenotmatch') ||
            code.includes('signaturedoesnotmatch') ||
            message.includes('access denied') ||
            message.includes('forbidden') ||
            message.includes('invalid access key')
        );
    }

    private async putApprovedObject(
        client: S3Client,
        bucket: string,
        key: string,
        fileBuffer: Buffer,
        mimeType: string,
        safeArticleNumber: string
    ): Promise<void> {
        await client.send(new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: fileBuffer,
            ContentType: mimeType,
            Metadata: {
                'article-number': safeArticleNumber,
                'uploaded-after-approval': 'true'
            }
        }));
    }

    private sanitizeArticleNumber(articleNumber: string): string {
        const cleaned = String(articleNumber || '').trim().replace(/[^a-zA-Z0-9._-]/g, '_');
        return cleaned || `article_${Date.now()}`;
    }

    private normalizeExtension(ext?: string | null): string {
        const normalized = String(ext || '').replace('.', '').toLowerCase().trim();
        if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif', 'tif', 'tiff'].includes(normalized)) {
            return normalized === 'tif' ? 'tiff' : normalized;
        }
        return 'jpg';
    }

    private extensionFromMimeType(mimeType?: string | null): string | null {
        const normalized = String(mimeType || '').toLowerCase().trim();
        const map: Record<string, string> = {
            'image/jpeg': 'jpg',
            'image/jpg': 'jpg',
            'image/png': 'png',
            'image/webp': 'webp',
            'image/gif': 'gif',
            'image/bmp': 'bmp',
            'image/avif': 'avif',
            'image/tiff': 'tiff'
        };
        return map[normalized] || null;
    }

    private extensionFromPath(filePathOrUrl?: string | null): string | null {
        const text = String(filePathOrUrl || '').trim();
        if (!text) return null;
        const clean = text.split('?')[0].split('#')[0];
        const ext = clean.includes('.') ? clean.split('.').pop() || '' : '';
        return ext ? this.normalizeExtension(ext) : null;
    }

    /**
     * Uploads a file buffer to Cloudflare R2 with UUID-based naming
     * @param fileBuffer - File buffer to upload
     * @param originalFileName - Original filename (for extension extraction)
     * @param mimeType - MIME type of the file
     * @param folder - Folder path in bucket (default: 'fashion-images')
     * @returns Upload result with URL, path, key, and UUID
     */
    async uploadFile(
        fileBuffer: Buffer,
        originalFileName: string,
        mimeType: string,
        folder: string = 'fashion-images'
    ): Promise<UploadResult> {
        // Generate UUID for unique file identification
        const uuid = randomUUID();

        // Extract file extension from original filename
        const extension = originalFileName.split('.').pop() || 'jpg';

        // Create organized path: folder/YYYY/MM/uuid.ext
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const fileName = `${uuid}.${extension}`;
        const key = `${folder}/${year}/${month}/${fileName}`;

        try {
            const upload = new Upload({
                client: this.s3Client,
                params: {
                    Bucket: this.bucket,
                    Key: key,
                    Body: fileBuffer,
                    ContentType: mimeType,
                    Metadata: {
                        'original-filename': originalFileName,
                        'upload-date': now.toISOString(),
                        'uuid': uuid
                    }
                }
            });

            await upload.done();

            console.log(`✅ Uploaded to R2: ${key}`);

            // R2 URL Construction
            let url: string;
            if (this.publicUrlBase) {
                // If custom domain is configured (e.g., https://cdn.example.com)
                url = this.buildPublicUrl(this.publicUrlBase, this.bucket, key);
            } else {
                // Fallback: Generate signed URL (valid for 7 days - R2/S3 maximum)
                console.warn('⚠️ R2_PUBLIC_URL_BASE not set. Using signed URL (valid for 7 days).');
                url = await this.getSignedUrl(key, 604800); // 7 days (maximum allowed)
            }

            return {
                url,
                path: key,
                key,
                uuid
            };

        } catch (error) {
            console.error('❌ R2 Upload Error:', error);
            throw new Error('Failed to upload file to storage');
        }
    }

    /**
     * Generate a signed URL for a private file
     * @param key - Object key in R2
     * @param expiresIn - Expiration time in seconds (default: 1 hour)
     */
    async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
        try {
            const command = new GetObjectCommand({
                Bucket: this.bucket,
                Key: key
            });
            const signedUrl = await getSignedUrl(this.s3Client, command, { expiresIn });

            if (!signedUrl) {
                throw new Error('Signed URL generation returned empty result');
            }

            console.log(`✅ Generated signed URL for: ${key} (expires in ${expiresIn}s)`);
            return signedUrl;
        } catch (error: any) {
            console.error('❌ Failed to generate signed URL:', error);
            console.error('   Key:', key);
            console.error('   Bucket:', this.bucket);
            console.error('   Error details:', error.message);
            throw new Error(`Failed to generate signed URL: ${error.message}`);
        }
    }

    async uploadApprovedImageFromSourceUrl(sourceImageUrl: string, articleNumber: string): Promise<UploadResult> {
        if (!sourceImageUrl) {
            throw new Error('Source image URL is required');
        }
        if (!articleNumber) {
            throw new Error('Article number is required for approved image upload');
        }

        const response = await fetch(sourceImageUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch source image: HTTP ${response.status}`);
        }

        const mimeType = response.headers.get('content-type') || 'image/jpeg';
        const extension = this.normalizeExtension(
            this.extensionFromMimeType(mimeType)
            || this.extensionFromPath(sourceImageUrl)
            || 'jpg'
        );

        const safeArticleNumber = this.sanitizeArticleNumber(articleNumber);
        const key = `${safeArticleNumber}.${extension}`; // root-level path, no folder
        const fileBuffer = Buffer.from(await response.arrayBuffer());

        try {
            try {
                await this.putApprovedObject(
                    this.approvedS3Client,
                    this.approvedBucket,
                    key,
                    fileBuffer,
                    mimeType,
                    safeArticleNumber
                );
                console.log(`✅ Approved image uploaded to ${this.approvedBucket}: ${key}`);
            } catch (primaryError: any) {
                // Retry with primary credentials on any auth/permission error
                // (approved-bucket API key may not have write access)
                if (!this.isAuthError(primaryError) || this.approvedS3Client === this.s3Client) {
                    throw primaryError;
                }

                console.warn(`⚠️ Approved bucket upload failed with auth error (${primaryError?.Code || primaryError?.message}). Retrying with primary R2 credentials.`);
                await this.putApprovedObject(
                    this.s3Client,
                    this.approvedBucket,
                    key,
                    fileBuffer,
                    mimeType,
                    safeArticleNumber
                );
                console.log(`✅ Approved image uploaded to ${this.approvedBucket} (via primary credentials): ${key}`);
            }

            let url: string;
            if (this.approvedPublicUrlBase && !this.isR2ApiStyleBaseUrl(this.approvedPublicUrlBase)) {
                url = this.buildPublicUrl(this.approvedPublicUrlBase, this.approvedBucket, key);
            } else {
                const command = new GetObjectCommand({
                    Bucket: this.approvedBucket,
                    Key: key
                });
                url = await getSignedUrl(this.approvedS3Client, command, { expiresIn: 604800 });
            }

            return {
                url,
                path: key,
                key,
                uuid: safeArticleNumber
            };
        } catch (error) {
            console.error('❌ Approved image upload failed:', error);
            throw new Error('Failed to upload approved image to storage');
        }
    }
}

export const storageService = new StorageService();

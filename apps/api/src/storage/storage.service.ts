import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

@Injectable()
export class StorageService {
  private readonly minio: Minio.Client | null;
  private readonly bucket: string;
  private readonly localRoot: string;

  constructor(private readonly config: ConfigService) {
    const endpoint = this.config.get<string>('MINIO_ENDPOINT');
    if (endpoint) {
      const [host, portStr] = endpoint.split(':');
      this.minio = new Minio.Client({
        endPoint: host!,
        port: Number(portStr ?? 9000),
        useSSL: false,
        accessKey: this.config.get<string>('MINIO_ROOT_USER', 'gotardo'),
        secretKey: this.config.get<string>('MINIO_ROOT_PASSWORD', ''),
      });
      this.bucket = this.config.get<string>('MINIO_BUCKET', 'gotardo');
      this.localRoot = join(tmpdir(), 'gotardo-imports');
    } else {
      this.minio = null;
      this.bucket = 'local';
      this.localRoot = join(tmpdir(), 'gotardo-imports');
    }
  }

  keyFor(familyId: string, ext: string): string {
    return `imports/${familyId}/${randomUUID()}.${ext}`;
  }

  private async ensureBucket(): Promise<void> {
    if (!this.minio) {
      return;
    }
    const exists = await this.minio.bucketExists(this.bucket);
    if (!exists) {
      await this.minio.makeBucket(this.bucket);
    }
  }

  async put(key: string, buffer: Buffer, mimeType: string): Promise<void> {
    if (this.minio) {
      await this.ensureBucket();
      await this.minio.putObject(this.bucket, key, buffer, buffer.length, {
        'Content-Type': mimeType,
      });
    } else {
      const path = join(this.localRoot, key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, buffer);
    }
  }

  async get(key: string): Promise<Buffer> {
    if (this.minio) {
      const stream = await this.minio.getObject(this.bucket, key);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    }
    return readFile(join(this.localRoot, key));
  }

  async remove(key: string): Promise<void> {
    if (this.minio) {
      await this.minio.removeObject(this.bucket, key).catch(() => undefined);
    } else {
      await rm(join(this.localRoot, key), { force: true }).catch(() => undefined);
    }
  }
}

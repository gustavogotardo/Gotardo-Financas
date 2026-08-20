import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type MlSuggestion = {
  category: string | null;
  confidence: number;
  matched: string | null;
};

@Injectable()
export class MlClient {
  private readonly logger = new Logger(MlClient.name);
  private readonly baseUrl: string | null;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    const url = config.get<string>('ML_URL');
    this.baseUrl = url ? url.replace(/\/$/, '') : null;
    this.timeoutMs = Number(config.get<string>('ML_TIMEOUT_MS') ?? 1500);
  }

  get enabled(): boolean {
    return Boolean(this.baseUrl);
  }

  async categorize(
    description: string,
    opts?: { familyId?: string; amount?: string },
  ): Promise<MlSuggestion> {
    if (!this.baseUrl) {
      return { category: null, confidence: 0, matched: null };
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/categorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, ...opts }),
        signal: controller.signal,
      });
      if (!res.ok) {
        this.logger.warn(`ML respondeu ${res.status} em /categorize`);
        return { category: null, confidence: 0, matched: null };
      }
      const body = (await res.json()) as Partial<MlSuggestion>;
      return {
        category: body.category ?? null,
        confidence: body.confidence ?? 0,
        matched: body.matched ?? null,
      };
    } catch (error) {
      this.logger.warn(
        `ML indisponível em ${this.baseUrl}: ${error instanceof Error ? error.message : 'erro'}`,
      );
      return { category: null, confidence: 0, matched: null };
    } finally {
      clearTimeout(timeout);
    }
  }
}

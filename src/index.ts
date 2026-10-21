import {
    RayonClient,
    type ClientOptions, type RequestOptions, type TargetRequest,
    type FormMetadata, type ShapeResult, type FormShapeResult, type UsageResult,
} from 'rayon-sdk-js';
import type { Page } from 'playwright-core';
import { collect, validateOptions, MaterialCollectionError, type PreparedMaterial, type CollectOptions } from './collector.js';
export { MaterialCollectionError } from './collector.js';
export type { PreparedMaterial, CollectOptions, CollectionErrorCode } from './collector.js';
export { RayonError, validate_profile } from 'rayon-sdk-js';
export type {
    BrowserProfile, ScriptMaterial, TargetRequest, FormMetadata, ClientOptions,
    RequestOptions, ShapeResult, FormShapeResult, UsageResult,
} from 'rayon-sdk-js';
export interface HeaderGeneration {
    request: TargetRequest;
    mode?: 'header';
    form?: never;
}
export interface FormGeneration {
    request: TargetRequest;
    mode: 'form';
    form?: FormMetadata;
}
/** Optional existing-page adapter. Credentials stay in the Node-side persistent core client. */
export class RayonPlaywright {
    #client: RayonClient;
    #closed = false;
    #collections = new Map<Page, AbortController>();
    constructor(apiKey: string, options: ClientOptions = {}) {
        this.#client = new RayonClient(apiKey, options);
    }
    [Symbol.for('nodejs.util.inspect.custom')]() {
        return { client: 'RayonPlaywright', credentials: '[REDACTED]', closed: this.#closed };
    }
    async collectMaterial(page: Page, options: CollectOptions): Promise<PreparedMaterial> {
        if (this.#closed)
            throw new MaterialCollectionError('disposed');
        validateOptions(options);
        if (this.#collections.has(page))
            throw new MaterialCollectionError('collection_in_progress');
        const controller = new AbortController();
        this.#collections.set(page, controller);
        try {
            return await collect(page, options, controller);
        }
        finally {
            this.#collections.delete(page);
        }
    }
    generate(material: PreparedMaterial, input: HeaderGeneration, options?: RequestOptions): Promise<ShapeResult>;
    generate(material: PreparedMaterial, input: FormGeneration, options?: RequestOptions): Promise<FormShapeResult>;
    generate(material: PreparedMaterial, input: HeaderGeneration | FormGeneration, options?: RequestOptions): Promise<ShapeResult | FormShapeResult>;
    generate(material: PreparedMaterial, input: HeaderGeneration | FormGeneration, options?: RequestOptions): Promise<ShapeResult | FormShapeResult> {
        return this.#client.generate({ ...material, ...input }, options);
    }
    usage(options?: RequestOptions): Promise<UsageResult> {
        return this.#client.usage(options);
    }
    async close(): Promise<void> {
        if (this.#closed)
            return;
        this.#closed = true;
        for (const controller of this.#collections.values())
            controller.abort('disposed');
        this.#collections.clear();
        await this.#client.close();
    }
    dispose(): Promise<void> {
        return this.close();
    }
}

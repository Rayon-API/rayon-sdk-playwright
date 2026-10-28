import {
    RayonClient,
    type ClientOptions, type RequestOptions, type TargetRequest, type HeaderShapeRequest,
    type MaterialPreparation, type ReadyMaterial, type PreparationOptions, type WaitUntilReadyOptions,
    type FormMetadata, type ShapeResult, type FormShapeResult, type UsageResult,
} from 'rayon-sdk-js';
import type { Page } from 'playwright-core';
import { collect, validateOptions, MaterialCollectionError, type CollectedMaterial, type CollectOptions } from './collector.js';
export { MaterialCollectionError } from './collector.js';
export type { CollectedMaterial, PreparedMaterial, CollectOptions, CollectionErrorCode } from './collector.js';
export { RayonError, validate_profile } from 'rayon-sdk-js';
export type {
    MaterialPreparation, ReadyMaterial, PreparationState, PreparationError, PreparationOptions, GetPreparationOptions, WaitUntilReadyOptions,
    BrowserProfile, ScriptMaterial, TargetRequest, FormMetadata, ClientOptions, HeaderShapeRequest, OperationMetadata,
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
    async collectMaterial(page: Page, options: CollectOptions): Promise<CollectedMaterial> {
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
    /** Generate with managed public material; no collection is required. */
    generateManaged(input: HeaderShapeRequest, options?: RequestOptions): Promise<ShapeResult> {
        return this.#client.generate(input, options);
    }
    generate(material: CollectedMaterial, input: HeaderGeneration, options?: RequestOptions): Promise<ShapeResult>;
    generate(material: CollectedMaterial, input: FormGeneration, options?: RequestOptions): Promise<FormShapeResult>;
    generate(material: CollectedMaterial, input: HeaderGeneration | FormGeneration, options?: RequestOptions): Promise<ShapeResult | FormShapeResult>;
    generate(material: CollectedMaterial, input: HeaderGeneration | FormGeneration, options?: RequestOptions): Promise<ShapeResult | FormShapeResult> {
        return this.#client.generate({ ...material, ...input }, options);
    }
    /** Starts server preparation with the exact generation context. Collection alone never prepares. */
    prepareMaterial(material: CollectedMaterial, input: HeaderGeneration | FormGeneration, options?: PreparationOptions): Promise<MaterialPreparation> {
        return this.#client.prepare({ ...material, ...input }, options);
    }
    prepareAndWait(material: CollectedMaterial, input: HeaderGeneration | FormGeneration, options?: WaitUntilReadyOptions): Promise<ReadyMaterial> {
        return this.#client.prepareAndWait({ ...material, ...input }, options);
    }
    getPreparation(id: string, options?: import('rayon-sdk-js').GetPreparationOptions): Promise<MaterialPreparation> {
        return this.#client.getPreparation(id, options);
    }
    waitUntilReady(id: string, options?: WaitUntilReadyOptions): Promise<ReadyMaterial> {
        return this.#client.waitUntilReady(id, options);
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

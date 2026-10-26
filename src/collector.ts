import type { Page, Request, Response, Frame } from 'playwright-core';
import { validate_profile, type BrowserProfile, type ScriptMaterial } from 'rayon-sdk-js';
export interface CollectedMaterial {
    source_url: string;
    scripts: ScriptMaterial[];
    profile: BrowserProfile;
    document_cookie?: string;
}
/** @deprecated Collection is not server readiness. Use CollectedMaterial. */
export type PreparedMaterial = CollectedMaterial;

export interface CollectOptions {
    /** Absolute HTTP(S) URLs, in the exact order to pass to Rayon. */
    scriptUrls: readonly string[];
    /** The caller controls all navigation/actions. Honor signal to stop work on timeout. */
    action: (page: Page, signal: AbortSignal) => Promise<unknown>;
    timeoutMs?: number;
    includeDocumentCookie?: boolean;
    signal?: AbortSignal;
}
export type CollectionErrorCode = 'invalid_options' | 'invalid_response' | 'size_limit' | 'redirect' | 'stale_material' | 'duplicate_script' | 'missing_scripts' | 'timeout' | 'aborted' | 'disposed' | 'page_closed' | 'action_failed' | 'profile_failed' | 'collection_in_progress';
/** Constant messages intentionally omit URLs, source, cookies and caller exceptions. */
export class MaterialCollectionError extends Error {
    readonly code: CollectionErrorCode;
    constructor(code: CollectionErrorCode) {
        super(`Rayon material collection failed (${code}).`);
        this.name = 'MaterialCollectionError';
        this.code = code;
    }
}
const PER_SCRIPT = 2 * 1024 * 1024, TOTAL = 3 * 1024 * 1024;
function validUrl(value: unknown): value is string {
    try {
        if (typeof value !== 'string')
            return false;
        const u = new URL(value);
        return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password && !u.hash && u.href === value;
    }
    catch {
        return false;
    }
}
export function validateOptions(options: CollectOptions): void {
    if (!options || !Array.isArray(options.scriptUrls) || options.scriptUrls.length < 1 || options.scriptUrls.length > 16 ||
        !options.scriptUrls.every(validUrl) || new Set(options.scriptUrls).size !== options.scriptUrls.length ||
        typeof options.action !== 'function' ||
        (options.timeoutMs !== undefined && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 300000)) ||
        (options.includeDocumentCookie !== undefined && typeof options.includeDocumentCookie !== 'boolean') ||
        (options.signal !== undefined && !(options.signal instanceof AbortSignal)))
        throw new MaterialCollectionError('invalid_options');
}
/** Passive observation only: never fetches missing scripts or submits the target request. */
export async function collect(page: Page, options: CollectOptions, controller: AbortController): Promise<CollectedMaterial> {
    validateOptions(options);
    const urls = [...options.scriptUrls], expected = new Set(urls);
    let active = true, actionDone = false, epoch = 0, navigations = 0, total = 0;
    const observed = new Map<Request, number>(), seen = new Set<string>(), scripts = new Map<string, {
        source: string;
        epoch: number;
    }>();
    let finish!: () => void, fail!: (error: MaterialCollectionError) => void;
    const complete = new Promise<void>((resolve, reject) => {
        finish = resolve;
        fail = reject;
    });
    let fatalReject!: (error: MaterialCollectionError) => void;
    const fatal = new Promise<never>((_, reject) => {
        fatalReject = reject;
    });
    void fatal.catch(() => {
    });
    const reject = (code: CollectionErrorCode) => {
        if (active) {
            const error = new MaterialCollectionError(code);
            fail(error);
            fatalReject(error);
        }
    };
    const ready = () => {
        if (actionDone && scripts.size === urls.length)
            finish();
    };
    const onAbort = () => reject(controller.signal.reason === 'disposed' ? 'disposed' : options.signal?.aborted ? 'aborted' : 'timeout');
    const abort = () => controller.abort();
    const onClose = () => reject('page_closed');
    const onFrame = (frame: Frame) => {
        // Same-document URL changes after observation also invalidate the session snapshot.
        if (frame === page.mainFrame() && scripts.size && [...scripts.values()].some(s => s.epoch !== epoch))
            reject('stale_material');
    };
    const onRequest = (request: Request) => {
        if (!active)
            return;
        let main = false;
        try {
            main = request.frame() === page.mainFrame();
        }
        catch {
            return;
        }
        if (!main)
            return;
        if (request.isNavigationRequest()) {
            epoch++;
            if (request.redirectedFrom()) {
                reject('redirect');
                return;
            }
            if (++navigations > 1 || seen.size) {
                reject('stale_material');
                return;
            }
        }
        if (!expected.has(request.url()))
            return;
        if (request.resourceType() !== 'script') {
            reject('invalid_response');
            return;
        }
        if (request.redirectedFrom()) {
            reject('redirect');
            return;
        }
        if (seen.has(request.url())) {
            reject('duplicate_script');
            return;
        }
        seen.add(request.url());
        observed.set(request, epoch);
    };
    const onResponse = (response: Response) => {
        const request = response.request();
        const requestEpoch = observed.get(request);
        if (!active || requestEpoch === undefined)
            return;
        // Attach a rejection handler immediately; browser errors never escape with target details.
        void (async () => {
            if (response.status() >= 300 && response.status() < 400) {
                reject('redirect');
                return;
            }
            if (response.status() < 200 || response.status() >= 300 || response.url() !== request.url()) {
                reject('invalid_response');
                return;
            }
            const headers = response.headers(), media = (headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
            if (!['application/javascript', 'text/javascript', 'application/ecmascript', 'text/ecmascript', 'application/x-javascript', 'text/plain'].includes(media)) {
                reject('invalid_response');
                return;
            }
            const length = headers['content-length'];
            if (length && Number(length) > PER_SCRIPT) {
                reject('size_limit');
                return;
            }
            const bytes = await response.body();
            if (!active)
                return;
            if (bytes.length > PER_SCRIPT || total + bytes.length > TOTAL) {
                reject('size_limit');
                return;
            }
            const source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
            if (!source.trim() || /^\s*(?:<!doctype\s+html|<html|<head|<body)/i.test(source)) {
                reject('invalid_response');
                return;
            }
            if (requestEpoch !== epoch) {
                reject('stale_material');
                return;
            }
            total += bytes.length;
            scripts.set(request.url(), { source, epoch: requestEpoch });
            ready();
        })().catch(() => reject('invalid_response'));
    };
    const initialUrl = page.url();
    const timer = setTimeout(() => {
        reject(actionDone && scripts.size !== urls.length ? 'missing_scripts' : 'timeout');
        controller.abort();
    }, options.timeoutMs ?? 30000);
    controller.signal.addEventListener('abort', onAbort, { once: true });
    options.signal?.addEventListener('abort', abort, { once: true });
    page.on('request', onRequest);
    page.on('response', onResponse);
    page.on('close', onClose);
    page.on('framenavigated', onFrame);
    try {
        if (controller.signal.aborted || options.signal?.aborted) {
            reject('aborted');
        }
        else if (page.isClosed())
            reject('page_closed');
        else {
            void Promise.resolve().then(() => {
                if (!active || controller.signal.aborted)
                    return;
                return options.action(page, controller.signal);
            }).then(() => {
                if (!active)
                    return;
                actionDone = true;
                ready();
            }, () => reject('action_failed'));
        }
        await complete;
        // Freeze observation after the action and required bodies have completed.
        if ([...scripts.values()].some(s => s.epoch !== epoch) || (navigations === 0 && page.url() !== initialUrl))
            throw new MaterialCollectionError('stale_material');
        const finalEpoch = epoch, sourceUrl = page.url();
        if (!validUrl(sourceUrl))
            throw new MaterialCollectionError('profile_failed');
        const snapshot = await Promise.race([captureProfile(page, options.includeDocumentCookie === true), fatal]);
        if (epoch !== finalEpoch || page.url() !== sourceUrl || snapshot.href !== sourceUrl)
            throw new MaterialCollectionError('stale_material');
        return { source_url: sourceUrl, scripts: urls.map(url => ({ url, source: scripts.get(url)!.source })), profile: validate_profile(snapshot.profile),
            ...(options.includeDocumentCookie ? { document_cookie: snapshot.cookie } : {}) };
    }
    catch (error) {
        if (error instanceof MaterialCollectionError)
            throw error;
        throw new MaterialCollectionError('profile_failed');
    }
    finally {
        active = false;
        controller.abort();
        clearTimeout(timer);
        controller.signal.removeEventListener('abort', onAbort);
        options.signal?.removeEventListener('abort', abort);
        page.off('request', onRequest);
        page.off('response', onResponse);
        page.off('close', onClose);
        page.off('framenavigated', onFrame);
    }
}
async function captureProfile(page: Page, includeCookie: boolean): Promise<{
    href: string;
    profile: BrowserProfile;
    cookie?: string;
}> {
    return page.evaluate((includeCookie) => {
        const profile: BrowserProfile = { user_agent: navigator.userAgent, platform: navigator.platform, language: navigator.language, languages: Array.from(navigator.languages),
            screen: {}, window: {}, navigator: {} };
        for (const key of ['width', 'height', 'availWidth', 'availHeight', 'colorDepth', 'pixelDepth'] as const)
            profile.screen![key] = screen[key];
        for (const key of ['innerWidth', 'innerHeight', 'outerWidth', 'outerHeight', 'devicePixelRatio', 'screenX', 'screenY', 'screenLeft', 'screenTop', 'pageXOffset', 'pageYOffset'] as const)
            profile.window![key] = window[key];
        for (const key of ['vendor', 'appVersion', 'appCodeName', 'appName', 'product', 'hardwareConcurrency', 'maxTouchPoints', 'cookieEnabled', 'webdriver', 'doNotTrack'] as const) {
            const value = navigator[key];
            if (value !== undefined)
                (profile.navigator as Record<string, unknown>)[key] = value;
        }
        const gl = document.createElement('canvas').getContext('webgl');
        if (gl) {
            try {
                const ext = gl.getExtension('WEBGL_debug_renderer_info');
                if (ext)
                    profile.webgl = { vendor: gl.getParameter(ext.UNMASKED_VENDOR_WEBGL), renderer: gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) };
            }
            finally {
                gl.getExtension('WEBGL_lose_context')?.loseContext();
            }
        }
        return { href: location.href, profile, ...(includeCookie ? { cookie: document.cookie } : {}) };
    }, includeCookie);
}

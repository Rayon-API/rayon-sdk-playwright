import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { createServer } from 'node:http';
import { RayonPlaywright, RayonError, type PreparedMaterial } from '../src/index.js';
const material: PreparedMaterial = { source_url: 'https://example.com/page', scripts: [{ url: 'https://example.com/owned.js', source: '/* local fixture */' }], profile: { language: 'en-GB' }, document_cookie: 'visible=private' };
const request = { url: 'https://example.com/submit', method: 'POST', content_type: 'application/json', body: ' {"x": 1}\n' };
const common = () => ({ request_id: 'req-fixture', generation_ms: 1, profile_used: { language: 'en-GB' }, material_ref: 'ref_0123456789abcdef', material_expires_at: new Date(Date.now() + 60000).toISOString() });
async function api(run: (sdk: RayonPlaywright, bodies: any[], paths: string[]) => Promise<void>, failure = false) {
    const bodies: any[] = [], paths: string[] = [];
    const server = createServer(async (req, res) => {
        paths.push(req.url!);
        if (req.method === 'GET') {
            res.setHeader('Content-Type', 'application/json');
            res.end('{"daily_used":2}');
            return;
        }
        let body = '';
        for await (const chunk of req)
            body += chunk;
        const input = JSON.parse(body);
        bodies.push(input);
        assert.equal(req.headers.authorization, 'Bearer private-api-key');
        if (failure) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { code: 'generation_unavailable', billing_status: 'unknown', retryable: true } }));
            return;
        }
        const fields = Object.fromEntries([...'abcdfz'].map(s => [`X-Fixture-${s}`, s === 'd' ? '' : 'private-generated-value']));
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ...common(), ...(input.mode === 'form' ? { form_fields: fields, form_body: new URLSearchParams(fields).toString() } : { headers: fields }) }));
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    const sdk = new RayonPlaywright('private-api-key', { baseUrl: `http://127.0.0.1:${(server.address() as any).port}` });
    try {
        await run(sdk, bodies, paths);
    }
    finally {
        await sdk.close();
        await new Promise<void>(r => server.close(() => r()));
    }
}
test('delegates header/form output, exact request, fresh state, usage and cache to one core client', async () => api(async (sdk, bodies, paths) => {
    const headers = await sdk.generate(material, { request });
    const formRequest = { ...request, content_type: 'application/x-www-form-urlencoded', body: 'tag=one&tag=two&csrf=a%2Bb' };
    const form = await sdk.generate({ ...material, profile: { language: 'fr' }, document_cookie: 'fresh=current' }, { mode: 'form', form: { id: 'fixture' }, request: formRequest });
    assert.deepEqual(bodies[0].request, request);
    assert.deepEqual(bodies[0].scripts, material.scripts);
    assert.equal(bodies[1].material_ref, 'ref_0123456789abcdef');
    assert.equal(bodies[1].scripts, undefined);
    assert.deepEqual(bodies[1].request, formRequest);
    assert.deepEqual(bodies[1].profile, { language: 'fr' });
    assert.equal(bodies[1].document_cookie, 'fresh=current');
    assert.ok(headers.headers);
    assert.ok(form.form_fields);
    assert.ok(form.form_body);
    assert.equal((await sdk.usage()).daily_used, 2);
    assert.deepEqual(paths, ['/v1/shape', '/v1/shape', '/v1/usage']);
    assert.ok(!inspect(sdk).includes('private-api-key'));
    assert.ok(!inspect(headers).includes('private-generated-value'));
    await sdk.dispose();
    await assert.rejects(sdk.generate(material, { request }), e => e instanceof RayonError && e.kind === 'validation');
}));
test('preserves unknown billing outcomes without retrying or target submission', async () => api(async (sdk, bodies, paths) => {
    await assert.rejects(sdk.generate(material, { request }), error => {
        assert.ok(error instanceof RayonError);
        assert.equal(error.billingStatus, 'unknown');
        assert.ok(!inspect(error).includes('private-api-key'));
        return true;
    });
    assert.equal(bodies.length, 1);
    assert.deepEqual(paths, ['/v1/shape']);
}, true));

 test('managed generation sends no collected scripts or reference', async () => api(async (sdk, bodies) => {
 const shape = {source_url:material.source_url, profile:material.profile, request};
 for(let i=0;i<2;i++) await sdk.generateManaged(shape);
 for(const body of bodies) {assert.ok(!Object.hasOwn(body,'scripts'));assert.ok(!Object.hasOwn(body,'material_ref'));assert.deepEqual(body.request,request);}
 }));

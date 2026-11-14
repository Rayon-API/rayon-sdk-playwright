import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { RayonPlaywright } from '../src/index.js';

test('managed preparation fallback preserves degraded metadata without repeating generation',async()=>{
  let calls=0;
  const server=createServer(async(req,res)=>{
    calls++;
    assert.equal(req.url,'/v1/shape');
    assert.equal(req.headers['x-rayon-capabilities'],'managed-fallback-v1');
    let raw='';for await(const chunk of req)raw+=chunk;
    const body=JSON.parse(raw);
    assert.ok(!Object.hasOwn(body,'scripts'));assert.ok(!Object.hasOwn(body,'material_ref'));
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({
      headers:Object.fromEntries([...'abcdfz'].map(s=>[`X-Fixture-${s}`,s==='d'?'':'owned'])),
      request_id:'req-owned',generation_ms:1,profile_used:{},
      material_ref:'ref_0123456789abcdef',material_expires_at:'2099-01-01T00:00:00Z',
      path:'isolated',fallback_reason:'material_preparing',
    }));
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const client=new RayonPlaywright('owned-key',{baseUrl:`http://127.0.0.1:${(server.address() as any).port}`});
  try{
    const result=await client.generateManaged({source_url:'https://shop.example.com/',profile:{},request:{url:'https://shop.example.com/action',method:'GET',content_type:null,body:null}});
    assert.equal(result.path,'isolated');assert.equal(result.fallback_reason,'material_preparing');assert.equal(calls,1);
  }finally{await client.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

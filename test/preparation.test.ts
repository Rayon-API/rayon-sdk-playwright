import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { RayonPlaywright, type CollectedMaterial } from '../src/index.js';
const material:CollectedMaterial={source_url:'https://example.com/',scripts:[{url:'https://example.com/a.js',source:'private-source'}],profile:{language:'en'},document_cookie:'private-cookie'};
const input={request:{url:'https://example.com/',method:'GET',content_type:null,body:null}};
test('preparation delegates complete context and explicit wait without generation',async()=>{
 const id='prep_0123456789abcdef',path=`/v1/materials/preparations/${id}`;
 const paths:string[]=[],bodies:unknown[]=[];
 const frame=(ready:boolean)=>({preparation_id:id,state:ready?'ready':'queued',status_url:path,retry_after_ms:0,preparation_expires_at:'2030-01-01T00:00:00Z',material_ref:'ref_0123456789abcdef',material_expires_at:'2030-01-01T00:00:00Z',ready_until:ready?'2030-01-01T00:00:00Z':null,execution_backend:ready?'rust':null,error:null});
 const server=createServer(async(req,res)=>{
  paths.push(req.url!);assert.equal(req.headers.authorization,'Bearer private-api-key');
  if(req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;bodies.push(JSON.parse(body));assert.ok(req.headers['idempotency-key']);res.writeHead(202,{'content-type':'application/json'});res.end(JSON.stringify(frame(false)));}
  else res.end(JSON.stringify(frame(true)));
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const client=new RayonPlaywright('private-api-key',{baseUrl:`http://127.0.0.1:${(server.address() as any).port}`});
 try{
  assert.equal((await client.prepareMaterial(material,input)).state,'queued');
  assert.equal((await client.prepareAndWait(material,input)).state,'ready');
  assert.deepEqual(bodies,[{...material,...input},{...material,...input}]);
  assert.deepEqual(paths,['/v1/materials/prepare','/v1/materials/prepare',path+'?wait=10']);
 }finally{await client.close();await new Promise<void>(r=>server.close(()=>r()));}
});


test('default preparation wait accepts learning beyond one minute',async t=>{
 let clock=1000,reads=0;
 t.mock.method(performance,'now',()=>clock);
 const id='prep_0123456789abcdef';
 const server=createServer(async(req,res)=>{
  for await(const chunk of req){ /* consume authored request */ }
  const ready=req.method==='GET'&&++reads>1;
  if(req.method==='GET'&&!ready)clock+=61_000;
  res.writeHead(req.method==='POST'?202:200,{'content-type':'application/json'});
  res.end(JSON.stringify({preparation_id:id,state:ready?'ready':'learning',status_url:`/v1/materials/preparations/${id}`,retry_after_ms:0,preparation_expires_at:'2030-01-01T00:00:00Z',material_ref:'ref_0123456789abcdef',material_expires_at:'2030-01-01T00:00:00Z',ready_until:ready?'2030-01-01T00:00:00Z':null,execution_backend:ready?'rust':null,error:null}));
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${(server.address() as any).port}`;
 const client=new RayonPlaywright('owned-api-key',{baseUrl:origin});
 const owned:CollectedMaterial={source_url:origin+'/',scripts:[{url:origin+'/owned.js',source:'function owned() {}'}],profile:{language:'en'},document_cookie:''};
 try{
  assert.equal((await client.prepareAndWait(owned,{request:{url:origin+'/',method:'GET',content_type:null,body:null}})).state,'ready');
  assert.equal(reads,2);
 }finally{await client.close();await new Promise<void>(r=>server.close(()=>r()));}
});

import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync,mkdirSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const temp=mkdtempSync(join(tmpdir(),'rayon-playwright-pack-'));
try {
  const report=JSON.parse(execFileSync('npm',['pack','--json','--pack-destination',temp],{cwd:root,encoding:'utf8'}))[0];
  const allowed=/^(?:dist\/(?:esm|cjs)\/[a-z-]+\.(?:js|d\.ts)|dist\/cjs\/package\.json|package\.json|README\.md|CHANGELOG\.md|LICENSE|SECURITY\.md|RELEASE\.md|docs\/reference\.md)$/;
  for(const file of report.files) assert.match(file.path,allowed,`Unexpected packed file: ${file.path}`);
  writeFileSync(join(temp,'package.json'),JSON.stringify({private:true,type:'module'}));
  const installed=join(temp,'node_modules','rayon-sdk-playwright');
  mkdirSync(installed,{recursive:true});
  execFileSync('tar',['-xzf',join(temp,report.filename),'-C',installed,'--strip-components=1']);
  for(const dependency of ['rayon-sdk-js','playwright-core','typescript','@types'])
    symlinkSync(join(root,'node_modules',dependency),join(temp,'node_modules',dependency),'dir');
  writeFileSync(join(temp,'esm.mjs'),`import {RayonPlaywright,MaterialCollectionError,RayonError,validate_profile} from 'rayon-sdk-playwright'; const client=new RayonPlaywright('fixture'); if(!(new MaterialCollectionError('timeout') instanceof Error))throw Error(); validate_profile({language:'en'}); await client.close();`);
  writeFileSync(join(temp,'common.cjs'),`const {RayonPlaywright}=require('rayon-sdk-playwright'); new RayonPlaywright('fixture').close();`);
  for(const filename of ['esm.mjs','common.cjs']) execFileSync(process.execPath,[filename],{cwd:temp,stdio:'inherit'});
  const source=`import {RayonPlaywright, type CollectedMaterial, type PreparedMaterial, type MaterialPreparation, type ReadyMaterial, type ShapeResult, type FormShapeResult} from 'rayon-sdk-playwright'; import type {Page} from 'playwright-core'; declare const page:Page; declare const material:CollectedMaterial; const legacy:PreparedMaterial=material; const sdk=new RayonPlaywright('fixture'); const request={url:'https://example.com/submit',method:'POST',content_type:'application/x-www-form-urlencoded',body:'x=1'}; const header:Promise<ShapeResult>=sdk.generate(material,{request}); const form:Promise<FormShapeResult>=sdk.generate(material,{request,mode:'form'}); const prepared:Promise<MaterialPreparation>=sdk.prepareMaterial(material,{request}); const ready:Promise<ReadyMaterial>=sdk.prepareAndWait(material,{request},{waitTimeoutMs:60000}); const resumed:Promise<ReadyMaterial>=sdk.waitUntilReady('prep_0123456789abcdef'); sdk.collectMaterial(page,{scriptUrls:['https://example.com/script.js'],action:async (p,signal)=>{await p.reload();}});`;
  for(const ext of ['mts','cts']) {
    writeFileSync(join(temp,`types.${ext}`),source);
    execFileSync(process.execPath,['node_modules/typescript/bin/tsc','--strict','--noEmit','--skipLibCheck','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext',`types.${ext}`],{cwd:temp,stdio:'inherit'});
  }
  console.log('Tarball allowlist, offline extraction with existing dependencies, ESM/CJS imports and declaration consumers passed.');
} finally {rmSync(temp,{recursive:true,force:true});}

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {assembleRecognitionStages, projectFromRecognition} from './project.mjs';
import {buildExteriorPrompt, buildInteriorPrompt, buildSpacesPrompt} from './recognition-prompt.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
try {
  const localEnv = await fs.readFile(path.join(root, '.env.local'), 'utf8');
  for (const line of localEnv.split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const legacyRoot = path.resolve(root, './legacy');
const port = Number(process.env.PORT || 8095);
const modelName = process.env.INFERERA_PLAN_MODEL || 'gpt-6-sol';
const apiBase = (process.env.INFERERA_BASE_URL || 'https://api.inferera.com').replace(/\/+$/, '');
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
const send = (res, code, data) => {res.writeHead(code, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
const imagePattern = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const number = value => Number.isFinite(Number(value)) ? Number(value) : undefined;

const polygon = {type:'array',items:{type:'array',items:{type:'number'}}};
const point = {type:'array',items:{type:'number'}};
const openingProperties = {type:{type:'string',enum:['door','window','full']},start:{type:'number'},end:{type:'number'},bottom:{type:'number'},top:{type:'number'}};
const opening = {type:'object',additionalProperties:false,required:Object.keys(openingProperties),properties:openingProperties};
const wallProperties = {a:point,b:point,thickness:{type:'number'},construction:{type:'string',enum:['filled','inferred']},openings:{type:'array',items:opening}};
const exteriorSchema = {type:'object',additionalProperties:false,required:['modelBounds','exteriorOutline','exteriorOpenings','floorOutline','voids','widthMeters','depthMeters'],properties:{
  modelBounds:{type:'array',items:{type:'number'}},exteriorOutline:polygon,
  exteriorOpenings:{type:'array',items:{type:'object',additionalProperties:false,required:['edgeIndex',...Object.keys(openingProperties)],properties:{edgeIndex:{type:'integer'},...openingProperties}}},
  floorOutline:polygon,voids:{type:'array',items:polygon},widthMeters:{type:'number'},depthMeters:{type:'number'}
}};
const interiorSchema = {type:'object',additionalProperties:false,required:['walls'],properties:{walls:{type:'array',items:{type:'object',additionalProperties:false,required:Object.keys(wallProperties),properties:wallProperties}}}};
const spacesSchema = {type:'object',additionalProperties:false,required:['rooms','furniture'],properties:{
  rooms:{type:'array',items:{type:'object',additionalProperties:false,required:['polygon'],properties:{polygon}}},
  furniture:{type:'array',items:{type:'object',additionalProperties:false,required:['type','name','center','w','d','h','rotation'],properties:{type:{type:'string',enum:['bed','sofa','table','chair','cabinet','other']},name:{type:'string'},center:point,w:{type:'number'},d:{type:'number'},h:{type:'number'},rotation:{type:'number'}}}}
}};

async function recognizeStage(plan, prompt, schema, referencePlan = null) {
  const content = [{type:'input_text',text:prompt}];
  if (referencePlan) content.push({type:'input_image',image_url:referencePlan.dataUrl,detail:'high'});
  content.push({type:'input_image',image_url:plan.dataUrl,detail:'high'});
  const response = await fetch(`${apiBase}/v1/responses`, {
    method:'POST', headers:{Authorization:`Bearer ${process.env.INFERERA_API_KEY}`,'Content-Type':'application/json'},
    body:JSON.stringify({model:modelName,store:false,input:[{role:'user',content}],text:{format:{type:'json_schema',name:'floor_plan_stage',strict:true,schema}},max_output_tokens:7000})
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || `AI 服务返回 ${response.status}`);
  const output = payload.output?.flatMap(item => item.content || []).find(item => item.type === 'output_text')?.text;
  if (!output) throw new Error('AI 没有返回可用的空间数据，请使用清晰、正向的平面图重试');
  return JSON.parse(output);
}

async function recognizePlan(plan, referencePlan, progress) {
  progress('外侧轮廓与外墙');
  const exterior = await recognizeStage(plan,buildExteriorPrompt(plan,!!referencePlan),exteriorSchema,referencePlan);
  progress('内部墙体与门窗');
  const interior = await recognizeStage(plan,buildInteriorPrompt(exterior),interiorSchema);
  progress('封闭空间与家具');
  const spaces = await recognizeStage(plan,buildSpacesPrompt(exterior,interior),spacesSchema);
  return assembleRecognitionStages(exterior,interior,spaces);
}

async function readJson(req) {
  let size = 0, chunks = [];
  for await (const chunk of req) {size += chunk.length;if (size > 35 * 1024 * 1024) throw new Error('图纸总大小超过 35 MB');chunks.push(chunk);}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'GET' && url.pathname === '/api/status') return send(res, 200, {aiReady:!!process.env.INFERERA_API_KEY,model:modelName});
    if (req.method === 'POST' && url.pathname === '/api/recognize') {
      if (!process.env.INFERERA_API_KEY) return send(res, 503, {error:'AI 识别尚未配置。请在本机服务端设置 INFERERA_API_KEY。'});
      const data = await readJson(req), plans = data.plans;
      if (!Array.isArray(plans) || !plans.length || plans.length > 10 || plans.some(p => !imagePattern.test(p.dataUrl || ''))) return send(res, 400, {error:'请上传 1 至 10 张 PNG、JPG 或 WebP 平面图'});
      const streaming = req.headers.accept?.includes('application/x-ndjson');
      if (streaming) res.writeHead(200, {'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','X-Accel-Buffering':'no'});
      const progress = (floor,stage) => {if (streaming) res.write(JSON.stringify({type:'progress',floor,total:plans.length,stage})+'\n');};
      try {
        const rawFloors = [];
        for (const [index,plan] of plans.entries()) rawFloors.push(await recognizePlan(plan,index ? plans[0] : null,stage=>progress(index+1,stage)));
        const project = projectFromRecognition(rawFloors,plans,String(data.name || '新空间项目').slice(0,80),number(data.floorHeight) || 3);
        if (streaming) {res.end(JSON.stringify({type:'done',project})+'\n');return;}
        return send(res,200,{project});
      } catch (error) {
        if (streaming) {res.end(JSON.stringify({type:'error',error:error?.message || '识别失败'})+'\n');return;}
        throw error;
      }
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, {error:'不支持的请求方法'});
    const legacy = url.pathname === '/legacy' || url.pathname.startsWith('/legacy/');
    const base = legacy ? legacyRoot : root;
    let rel = legacy ? url.pathname.slice('/legacy'.length) : url.pathname;
    rel = decodeURIComponent(rel || '/');if (rel.endsWith('/')) rel += 'index.html';
    if (rel.split('/').some(part => part.startsWith('.')) || ['/recognition-sample.json','/staged-sample.json'].includes(rel)) return send(res, 403, {error:'访问被拒绝'});
    const target = path.resolve(base, '.' + rel);
    if (target !== base && !target.startsWith(base + path.sep)) return send(res, 403, {error:'访问被拒绝'});
    const bytes = await fs.readFile(target);
    res.writeHead(200, {'Content-Type':mime[path.extname(target)] || 'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    if (req.method === 'HEAD') res.end(); else res.end(bytes);
  } catch (error) {
    const code = error?.code === 'ENOENT' ? 404 : error instanceof SyntaxError ? 400 : 500;
    send(res, code, {error:error?.message || '服务暂时不可用'});
  }
});
server.listen(port, '127.0.0.1', () => console.log(`空间编辑器已启动：http://127.0.0.1:${port}/`));

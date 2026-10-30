const TICK='find-work-tick';
const words=s=>String(s||'').split(/[,，\n]/).map(x=>x.trim()).filter(Boolean);
const clean=s=>String(s||'').replace(/<!\[CDATA\[|\]\]>/g,'').replace(/&(?:amp|lt|gt|quot|apos|nbsp|#(\d+));/g,(m,n)=>n?String.fromCodePoint(Number(n)):({ '&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '})[m]||m).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const normalized=u=>{try{const x=new URL(u);if(x.protocol!=='https:')return null;['utm_source','utm_medium','utm_campaign','from','source'].forEach(k=>x.searchParams.delete(k));return x.href;}catch{return null;}};
const host=u=>{try{return new URL(u).hostname.toLowerCase();}catch{return '';}};
const companyRows=c=>c.companies.split('\n').map(s=>{const [name='',domains='']=s.split('|');return {name:name.trim(),domains:domains.split(',').map(x=>x.trim().replace(/^https?:\/\//,'').replace(/\/.*$/,'').toLowerCase()).filter(Boolean)};}).filter(x=>x.name);
const trustedDomains=c=>words(c.trustedDomains).map(x=>x.replace(/^https?:\/\//,'').replace(/\/.*$/,'').toLowerCase()).filter(x=>/^[a-z0-9.-]+$/.test(x));
const sourceRows=c=>c.sources.split('\n').map(s=>{const [name='',url='',type='线索']=s.split('|');return {name:name.trim(),url:normalized(url.trim()),type:type.trim()};}).filter(x=>x.name&&x.url);
const allowed=(u,domains)=>domains.some(d=>host(u)===d||host(u).endsWith('.'+d));
const detail=u=>/\/(?:job|jobs|position|positions|post|detail|jobIntern|jobSocial)(?:\/(?:intern|campus|social))?\/(?:[a-f0-9-]{12,}|\d{4,})/i.test(u)||/#\/(?:job|position)\/[a-f0-9-]{12,}/i.test(u);
const dateFrom=s=>{const m=s.match(/(?:截止(?:日期|时间)?|申请截止)[^\d]{0,12}(20\d{2})[年\/.-](\d{1,2})[月\/.-](\d{1,2})/);if(!m)return null;const d=new Date(+m[1],+m[2]-1,+m[3],23,59,59);return Number.isNaN(d.getTime())?null:d.toISOString();};
const xmlItems=s=>[...s.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(m=>({title:clean(m[1].match(/<title>([\s\S]*?)<\/title>/i)?.[1]),url:clean(m[1].match(/<link>([\s\S]*?)<\/link>/i)?.[1])})).filter(x=>normalized(x.url));
const htmlLinks=(html,base)=>[...html.matchAll(/<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi)].map(m=>{try{return {url:new URL(clean(m[2]),base).href,title:clean(m[4])};}catch{return null;}}).filter(Boolean);
async function getText(url){const r=await fetch(url,{credentials:'omit',redirect:'follow',signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error(`HTTP ${r.status}`);return await r.text();}
async function canRead(url){try{return await chrome.permissions.contains({origins:[`https://${host(url)}/*`]});}catch{return false;}}
function score(text,preferred,c){const t=text.toLowerCase(),key=words(c.keywords),hit=key.filter(w=>t.includes(w.toLowerCase())).length;const intern=/实习|intern/i.test(t),yr=Number(c.gradYear),yearOK=!yr||!new RegExp(`(?:20\\d{2}\\s*[届级]|毕业)`).test(t)||t.includes(String(yr));const city=words(c.cities).some(x=>t.includes(x));const days=Number(c.days),required=Number(t.match(/每周.{0,8}([3-7])\s*天/)?.[1]||0),daysOK=!required||!days||days>=required;const raw={direction:Math.min(1,(18+hit*6)/35),feasibility:intern?(yearOK&&daysOK?1:.2):yearOK?.72:.16,company:preferred?1:0,relevance:/ai|agent|aigc|人工智能|教育|课程/i.test(t)?1:1/3,location:city?1:.4,salary:/\d+[kK万千元]\s*[-~至]/.test(t)?1:0};const defaults={direction:35,feasibility:25,company:15,relevance:15,location:5,salary:5};const d=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,Math.round(v*Number(c[`weight${k[0].toUpperCase()+k.slice(1)}`]??defaults[k])*10)/10]));return {...d,total:Math.round(Object.values(d).reduce((a,b)=>a+b,0)*10)/10};}
async function collect(c){
  const out=[],errors=[],companies=companyRows(c),sources=sourceRows(c),keys=words(c.keywords),trusted=trustedDomains(c),known=[...trusted,...companies.flatMap(x=>x.domains)];
  for(const key of keys.slice(0,4)){
    try{const q=`${key} (实习 OR 校招 OR 招聘)`;const rss=await getText(`https://www.bing.com/search?format=rss&q=${encodeURIComponent(q)}`);for(const it of xmlItems(rss).slice(0,12)){const co=companies.find(x=>allowed(it.url,x.domains));out.push({...it,source:`跨公司搜索：${key}`,official:allowed(it.url,known),company:co?.name||host(it.url)});}}
    catch(e){errors.push(`跨公司搜索 ${key}：${e.message}`);}
  }
  try{const q=`site:mp.weixin.qq.com (${keys.slice(0,3).join(' OR ')}) 招聘`;const rss=await getText(`https://www.bing.com/search?format=rss&q=${encodeURIComponent(q)}`);for(const it of xmlItems(rss).slice(0,12))out.push({...it,source:'公开公众号跨公司搜索',official:false,company:host(it.url)});}
  catch(e){errors.push(`公开公众号跨公司搜索：${e.message}`);}
  for(const co of companies){
    const q=`${co.name} (${keys.slice(0,3).join(' OR ')||'产品 实习'}) 招聘`;
    try{const rss=await getText(`https://www.bing.com/search?format=rss&q=${encodeURIComponent(q)}`);for(const it of xmlItems(rss).slice(0,12))out.push({...it,source:`搜索：${co.name}`,official:allowed(it.url,co.domains),company:co.name});}
    catch(e){errors.push(`${co.name} 搜索：${e.message}`);}
    try{const q2=`site:mp.weixin.qq.com ${co.name} (${keys.slice(0,2).join(' OR ')||'招聘'}) 招聘`;const rss=await getText(`https://www.bing.com/search?format=rss&q=${encodeURIComponent(q2)}`);for(const it of xmlItems(rss).slice(0,8))out.push({...it,source:`公开公众号搜索：${co.name}`,official:false,company:co.name});}
    catch(e){errors.push(`${co.name} 公众号搜索：${e.message}`);}
  }
  for(const s of sources){
    try{if(!await canRead(s.url)){errors.push(`${s.name}：未授予网站权限`);continue;}const html=await getText(s.url);if(detail(s.url))out.push({url:s.url,title:s.name,source:s.name,official:s.type==='官方',company:s.name});for(const l of htmlLinks(html,s.url).slice(0,180)){if(!detail(l.url)&&!keys.some(k=>l.title.includes(k)))continue;const co=companies.find(x=>allowed(l.url,x.domains));out.push({...l,source:s.name,official:Boolean(co)||allowed(l.url,trusted)||(s.type==='官方'&&host(l.url)===host(s.url)),company:co?.name||s.name});}}
    catch(e){errors.push(`${s.name}：${e.message}`);}
  }
  const dedup=new Map();
  for(const item of out){const key=normalized(item.url);if(!key)continue;const old=dedup.get(key);if(!old)dedup.set(key,item);else dedup.set(key,{...(item.official?item:old),official:old.official||item.official,source:[...new Set([old.source,item.source])].join('；')});}
  return {candidates:[...dedup.values()].slice(0,150),errors};
}
async function scan({daily=false}={}){
  const data=await chrome.storage.local.get(['config','jobs','scanLog']);const c=data.config;if(!c)throw Error('请先在设置中填写个人资料与来源。');
  const {candidates,errors}=await collect(c);const jobs=data.jobs||{};let newVerified=0,newLeads=0;const now=new Date();
  for(const j of Object.values(jobs))if(j.verified)j.score=score(j.title+' '+j.jd,Boolean(companyRows(c).find(x=>allowed(j.url,x.domains))),c);
  for(const item of candidates){
    const url=normalized(item.url),prior=jobs[url];if(!url)continue;
    if(prior?.status&& !['新发现','待用户确认'].includes(prior.status)){prior.lastSeen=now.toISOString();if(prior.deadline&&new Date(prior.deadline)<now&&prior.status==='待投递')prior.status='失效';continue;}
    let html='',body='',reason='';
    if(!item.official)reason='来源尚未确认为官方';
    else if(!detail(url))reason='尚未找到具体职位链接';
    else if(!await canRead(url))reason='未授予职位网站权限';
    else try{html=await getText(url);body=clean(html).slice(0,30000);}catch(e){reason=`职位页无法读取：${e.message}`;}
    const title=clean((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)||[])[1])||item.title||'职位待确认';
    const relevant=words(c.keywords).some(k=>(title+' '+body).toLowerCase().includes(k.toLowerCase()));
    const excluded=words(c.exclude).some(k=>(title+' '+body).includes(k));
    if(!relevant||excluded)continue;
    if(!reason&&body.length<160)reason='职位页没有可读取的完整 JD';
    if(!reason&&!/(岗位职责|工作职责|职位描述|职责要求|任职要求|职位要求|responsibilities|requirements)/i.test(body))reason='职责或要求未核验';
    if(!reason&&!/(北京|上海|深圳|广州|杭州|成都|厦门|武汉|南京|苏州|实习|校招|应届|届|intern|graduate)/i.test(body))reason='地点或届别信息未核验';
    if(!reason&&!/<(?:a|button)\b[^>]*(?:apply|投递|申请)|<(?:a|button)\b[^>]*>[\s\S]{0,120}(?:申请职位|立即投递|投递简历|Apply)/i.test(html))reason='投递入口未核验';
    const preferred=companyRows(c).find(x=>allowed(url,x.domains)),verified=!reason,company=preferred?.name||item.company||host(url);
    const entry={id:prior?.id||crypto.randomUUID(),url,title,company,source:item.source,official:item.official,verified,reason,status:prior?.status|| (verified?'新发现':'待用户确认'),firstSeen:prior?.firstSeen||now.toISOString(),lastSeen:now.toISOString(),deadline:dateFrom(body),score:verified?score(title+' '+body,Boolean(preferred),c):null,jd:body.slice(0,12000),feedback:prior?.feedback||null,resumeDraft:prior?.resumeDraft||''};
    if(!prior){if(verified)newVerified++;else newLeads++;}jobs[url]=entry;
  }
  for(const j of Object.values(jobs)){if(j.status==='已投递'&&j.appliedAt&&now.getTime()-new Date(j.appliedAt).getTime()>=21*86400000){j.status='无回复';j.noReplyAt=now.toISOString();}}
  const run={at:now.toISOString(),candidates:candidates.length,verified:newVerified,leads:newLeads,errors};
  await chrome.storage.local.set({jobs,lastRun:run,scanLog:[...(data.scanLog||[]),run].slice(-180)});
  const urgent=Object.values(jobs).filter(j=>j.firstSeen===now.toISOString()&&j.verified&&j.score?.total>=80&&j.deadline&&new Date(j.deadline).getTime()-now.getTime()<72*3600000&&new Date(j.deadline)>now);
  if(daily||urgent.length)await chrome.tabs.create({url:chrome.runtime.getURL(`report.html${urgent.length&&!daily?'?urgent=1':''}`)});
  return run;
}
let running=null;
function run(opts){if(!running)running=scan(opts).finally(()=>running=null);return running;}
async function tick(){const {config,scheduleState={}}=await chrome.storage.local.get(['config','scheduleState']);if(!config)return;const n=new Date();if(n.getDay()===0||n.getDay()===6)return;const day=n.toLocaleDateString('en-CA'),hm=n.toTimeString().slice(0,5);const slots=words(config.scanTimes).sort().filter(t=>t<=hm);if(!slots.length)return;const slot=slots.at(-1);if(scheduleState.day===day&&scheduleState.slot===slot)return;try{await run({daily:config.dailyTime<=hm&&scheduleState.reportDay!==day});await chrome.storage.local.set({scheduleState:{day,slot,reportDay:config.dailyTime<=hm?day:scheduleState.reportDay}});}catch(e){await chrome.storage.local.set({lastRun:{at:n.toISOString(),verified:0,leads:0,errors:[e.message]}});}}
chrome.runtime.onInstalled.addListener(()=>{chrome.alarms.create(TICK,{periodInMinutes:5});chrome.runtime.openOptionsPage();});
chrome.runtime.onStartup.addListener(()=>{chrome.alarms.create(TICK,{periodInMinutes:5});tick();});
chrome.alarms.onAlarm.addListener(a=>{if(a.name===TICK)tick();});
chrome.runtime.onMessage.addListener((m,_,reply)=>{if(m.type==='scan'){run({daily:false}).then(reply,e=>reply({error:e.message,verified:0,leads:0}));return true;}});

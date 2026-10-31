const TICK='find-work-tick';
const words=s=>String(s||'').split(/[,，\n]/).map(x=>x.trim()).filter(Boolean);
const clean=s=>String(s||'').replace(/<!\[CDATA\[|\]\]>/g,'').replace(/&(?:amp|lt|gt|quot|apos|nbsp|#(\d+));/g,(m,n)=>n?String.fromCodePoint(Number(n)):({ '&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '})[m]||m).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const pageText=html=>clean(String(html||'').replace(/<(script|style|nav|footer)\b[^>]*>[\s\S]*?<\/\1>/gi,' '));
const normalized=u=>{try{const x=new URL(u);if(x.protocol!=='https:'||/^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|.*\.local$)/i.test(x.hostname))return null;['utm_source','utm_medium','utm_campaign','from','source'].forEach(k=>x.searchParams.delete(k));return x.href;}catch{return null;}};
const host=u=>{try{return new URL(u).hostname.toLowerCase();}catch{return '';}};
const companyRows=c=>c.companies.split('\n').map(s=>{const [name='',domains='']=s.split('|');return {name:name.trim(),domains:domains.split(',').map(x=>x.trim().replace(/^https?:\/\//,'').replace(/\/.*$/,'').toLowerCase()).filter(Boolean)};}).filter(x=>x.name);
const trustedDomains=c=>words(c.trustedDomains).map(x=>x.replace(/^https?:\/\//,'').replace(/\/.*$/,'').toLowerCase()).filter(x=>/^[a-z0-9.-]+$/.test(x));
const sourceRows=c=>String(c.sources||'').split('\n').map(s=>{const [name='',url='',type='线索']=s.split('|');return {name:name.trim(),url:normalized(url.trim()),type:type.trim()};}).filter(x=>x.name&&x.url);
const allowed=(u,domains)=>domains.some(d=>host(u)===d||host(u).endsWith('.'+d));
const blocked=u=>/(^|\.)(?:zhipin\.com|bosszhipin\.com|linkedin\.com|linkedin\.cn)$/i.test(host(u));
const sourceLike=x=>normalized(x.url)&&!blocked(x.url)&&!detail(x.url)&&(/career|recruit|join|campus|intern|job|招聘|职位/i.test(x.url+' '+x.title)||host(x.url)==='mp.weixin.qq.com');
const detail=u=>/\/(?:job|jobs|position|positions|post|detail|jobIntern|jobSocial)(?:\/(?:intern|campus|social))?\/(?:[a-f0-9-]{12,}|\d{4,})/i.test(u)||/#\/(?:job|position)\/[a-f0-9-]{12,}/i.test(u);
const dateFrom=s=>{const m=s.match(/(?:截止(?:日期|时间)?|申请截止)[^\d]{0,12}(20\d{2})[年\/.-](\d{1,2})[月\/.-](\d{1,2})/);if(!m)return null;const d=new Date(+m[1],+m[2]-1,+m[3],23,59,59);return Number.isNaN(d.getTime())?null:d.toISOString();};
const locationOf=s=>String(s||'').match(/(?:工作地点|工作城市|办公地点|工作地|location)\s*[:：]\s*(北京|上海|深圳|广州|杭州|成都|厦门|武汉|南京|苏州|香港|天津|重庆|西安|长沙|郑州|宁波|东莞|佛山)/i)?.[1]||'';
const sameRole=(a,b)=>a.title?.trim().toLowerCase()===b.title?.trim().toLowerCase()&&a.company?.trim().toLowerCase()===b.company?.trim().toLowerCase()&&locationOf(a.jd)&&locationOf(a.jd)===locationOf(b.jd);
const closed=s=>/(?:该?职位|岗位|招聘)(?:已)?(?:关闭|下线|停止招聘|停止投递)|(?:申请|投递)已截止|position (?:is )?(?:closed|expired)/i.test(s);
const applyOpen=html=>[...String(html||'').matchAll(/<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/gi)].some(m=>!/\bdisabled\b|aria-disabled\s*=\s*["']?true/i.test(m[2])&&/(?:申请职位|立即投递|投递简历|申请岗位|^apply(?: now)?$)/i.test(clean(m[3])));
function waitedMoreThanOneWorkday(start,end){let days=0,d=new Date(start);d.setHours(0,0,0,0);for(d.setDate(d.getDate()+1);d<end;d.setDate(d.getDate()+1))if(d.getDay()!==0&&d.getDay()!==6)days++;return days>1;}
const xmlItems=s=>[...s.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(m=>({title:clean(m[1].match(/<title>([\s\S]*?)<\/title>/i)?.[1]),url:clean(m[1].match(/<link>([\s\S]*?)<\/link>/i)?.[1])})).filter(x=>normalized(x.url));
const htmlLinks=(html,base)=>[...html.matchAll(/<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi)].map(m=>{try{return {url:new URL(clean(m[2]),base).href,title:clean(m[4])};}catch{return null;}}).filter(Boolean);
async function getText(url){const r=await fetch(url,{credentials:'omit',redirect:'follow',signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error(`HTTP ${r.status}`);return await r.text();}
async function canRead(url){try{return await chrome.permissions.contains({origins:[`https://${host(url)}/*`]});}catch{return false;}}
function criteriaFor(c){
  if(Array.isArray(c.criteria)&&c.criteria.length)return c.criteria;
  if('weightDirection' in c)return [
    {name:'岗位方向',type:'keyword',terms:'',weight:Number(c.weightDirection)},
    {name:'实习／届别可行性',type:'feasibility',terms:'',weight:Number(c.weightFeasibility)},
    {name:'优先公司',type:'company',terms:'',weight:Number(c.weightCompany)},
    {name:'AI／教育相关度',type:'keyword',terms:'AI,Agent,AIGC,人工智能,教育,课程',weight:Number(c.weightRelevance)},
    {name:'城市',type:'location',terms:'',weight:Number(c.weightLocation)},
    {name:'薪酬是否公开',type:'salary',terms:'',weight:Number(c.weightSalary)}
  ];
  return [{name:'求职重点',type:'keyword',terms:'',weight:100}];
}
function score(title,body,preferred,c,sourceUrl=''){
  const t=String(title||'').toLowerCase(),b=String(body||'').toLowerCase(),all=t+' '+b,yr=Number(c.gradYear),days=Number(c.days);
  const evaluate=rule=>{
    if(rule.name==='行业'){
      const industries=words(c.industries).map(x=>x.toLowerCase());if(!industries.length)return {value:null,basis:'未填写偏好行业'};
      const hit=industries.find(x=>all.includes(x));return hit?{value:1,basis:`公开内容出现偏好行业：${hit}`}:{value:null,basis:'公开内容未明确说明行业'};
    }
    if(rule.type==='other')return {value:null,basis:'自定义条件尚无可靠判断依据'};
    if(rule.type==='conversion')return /(?:无转正|不提供转正|暂无转正|没有转正)/i.test(all)?{value:0,basis:'公开信息明确说明没有转正名额'}:/(?:提供转正名额|有转正HC|明确转正名额|转正HC)/i.test(all)?{value:1,basis:'公开信息明确提到转正名额'}:{value:null,basis:'未找到明确的转正 HC 信息'};
    if(rule.type==='mealsHousing')return /(?:不包吃住|不提供食宿|食宿自理)/i.test(all)?{value:0,basis:'公开信息明确说明食宿自理'}:/(?:包吃住|免费食宿|提供免费食宿|包食宿)/i.test(all)?{value:1,basis:'公开信息明确提到包食宿'}:{value:null,basis:'未找到明确的包吃住信息'};
    if(rule.type==='petFriendly')return /(?:禁止携带宠物|不允许宠物)/i.test(all)?{value:0,basis:'公开信息明确说明不允许宠物'}:/(?:宠物友好|允许携带宠物|pet[- ]friendly)/i.test(all)?{value:1,basis:'公开信息明确提到宠物友好'}:{value:null,basis:'未找到明确的宠物友好信息'};
    if(rule.type==='keyword'){
      const terms=words(rule.terms||c.keywords).map(x=>x.toLowerCase()),hitTitle=terms.find(x=>t.includes(x)),hitBody=terms.find(x=>b.includes(x));
      if(rule.name==='专业对口或岗位契合度'&&c.resume?.trim()){
        const shared=terms.find(x=>all.includes(x)&&c.resume.toLowerCase().includes(x));
        return shared?{value:1,basis:`母板与岗位共同出现“${shared}”；仅文字初筛`}:{value:null,basis:'母板与岗位缺少可核实的共同关键词'};
      }
      const label=rule.name==='专业对口或岗位契合度'?'方向匹配；未评估个人经历':'关键词初筛';
      return {value:hitTitle?1:hitBody?.65:0,basis:label};
    }
    if(rule.type==='company'){
      const sizePref=c.sizePreference,stagePref=c.stagePreference;
      if(!sizePref&&!stagePref)return {value:null,basis:'未设置规模或阶段偏好'};
      const dated=b.match(/(?:截至|于)\s*(20\d{2})\s*年?[^。；]{0,80}?(\d{2,7})\s*(?:名|位|人)?员工/),headcount=dated?Number(dated[2]):null;
      const scale=headcount==null?null:headcount<=Number(c.smallMax||99)?'small':headcount<=Number(c.mediumMax||999)?'medium':'large';
      const stageMatch=b.match(/(?:截至|于)\s*(20\d{2})\s*年?[^。；]{0,80}?(?:公司|企业)[^。；]{0,20}?(成熟期|成长(?:期|阶段)|早期(?:阶段)?)/),stage=stageMatch?stageMatch[2].startsWith('成熟')?'mature':stageMatch[2].startsWith('成长')?'growth':'early':null;
      if((sizePref&&!scale)||(stagePref&&!stage))return {value:null,basis:'缺少有日期的规模资料或明确的发展阶段资料'};
      const checks=[];if(sizePref)checks.push(Number(sizePref===scale));if(stagePref)checks.push(Number(stagePref===stage));
      return {value:checks.reduce((x,y)=>x+y,0)/checks.length,basis:`规模 ${headcount==null?'未公布':`${headcount} 人（${dated[1]} 年）`}；阶段 ${stageMatch?`${stageMatch[2]}（${stageMatch[1]} 年）`:'未明确'}；来源 ${sourceUrl||'职位页'}`};
    }
    if(rule.type==='location'){
      const cities=words(c.cities).map(x=>x.toLowerCase());if(!cities.length)return {value:null,basis:'未填写优先城市'};
      const place=locationOf(body).toLowerCase();if(!place)return {value:null,basis:'未找到明确的工作地点'};
      return cities.includes(place)?{value:1,basis:`工作地点：${place}`}:{value:0,basis:`工作地点：${place}，不在优先城市`};
    }
    if(rule.type==='salary'){
      if(c.salaryMin===''&&c.salaryMax==='')return {value:null,basis:'未填写期望薪资区间'};
      const workType=/实习|intern/i.test(t)?'intern':/校招|全职|正职|应届|full.?time/i.test(t)?'fulltime':/实习岗位|实习职位|internship/i.test(b)?'intern':/校招岗位|全职岗位|正式岗位|full.?time position/i.test(b)?'fulltime':null;
      if(workType!==c.salaryWorkType)return {value:null,basis:'岗位工作类型无法与期望薪资对应'};
      const m=all.match(/(¥|￥|rmb|cny|hk\$|hkd|us\$|usd|\$)?\s*(\d+(?:\.\d+)?)\s*(k|千|万)?\s*[-~至]\s*(\d+(?:\.\d+)?)\s*(k|千|万)?\s*(元)?\s*(?:\/|每)?\s*(天|日|月|年)/i);
      if(!m)return {value:null,basis:'未找到明确薪资区间及计薪周期'};
      const currency=/hk\$|hkd/i.test(m[1]||'')?'HKD':/us\$|usd|^\$$/i.test(m[1]||'')?'USD':/¥|￥|rmb|cny/.test(m[1]||'')||m[6]?'CNY':null;
      const period=m[7]==='天'||m[7]==='日'?'day':m[7]==='月'?'month':'year';if(!currency||currency!==c.salaryCurrency||period!==c.salaryPeriod)return {value:null,basis:`原文：${m[0]}；币种或周期无法直接比较`};
      const mul=x=>x==='万'?10000:x==='k'||x==='千'?1000:1,min=Number(m[2])*mul(m[3]||m[5]),max=Number(m[4])*mul(m[5]||m[3]);
      return {value:(!c.salaryMin||max>=Number(c.salaryMin))&&(!c.salaryMax||min<=Number(c.salaryMax))?1:0,basis:`原文：${m[0]}`};
    }
    if(rule.type==='development')return /(?:导师|轮岗|系统培训|专业培训|mentorship|rotational program|training program|负责[^。；]{0,30}项目)/i.test(all)?{value:1,basis:'公开内容描述具体培养或项目机会'}:{value:null,basis:'缺少具体培养或项目机会证据'};
    if(rule.type==='feasibility'){const intern=/实习|intern/i.test(all),yearOK=!yr||!/(?:20\d{2}\s*[届级]|毕业)/.test(all)||all.includes(String(yr)),required=Number(all.match(/每周.{0,8}([3-7])\s*天/)?.[1]||0),daysOK=!required||!days||days>=required;return {value:intern?(yearOK&&daysOK?1:.2):yearOK?.72:.16,basis:'届别与实习天数初筛'};}
    return {value:null,basis:'无可用判断依据'};
  };
  const parts=criteriaFor(c).map(rule=>{const result=evaluate(rule),weight=Number(rule.weight);return {name:rule.name,weight,points:result.value==null?null:Math.round(result.value*weight*10)/10,basis:result.basis};});
  const evaluableWeight=parts.reduce((sum,x)=>sum+(x.points==null?0:x.weight),0),points=parts.reduce((sum,x)=>sum+(x.points||0),0);
  return {parts,evaluableWeight,total:evaluableWeight?Math.round(points/evaluableWeight*1000)/10:null};
}
async function collect(c,approvedUrls=[]){
  const out=[],errors=[],discoveredSources=[],companies=companyRows(c),sources=sourceRows(c),keys=words(c.keywords),trusted=trustedDomains(c),known=[...trusted,...companies.flatMap(x=>x.domains)],approved=new Set(approvedUrls);
  for(const key of keys.slice(0,4)){
    try{const q=`${key} (实习 OR 校招 OR 招聘)`;const rss=await getText(`https://www.bing.com/search?format=rss&q=${encodeURIComponent(q)}`);for(const it of xmlItems(rss).slice(0,12)){if(blocked(it.url))continue;const co=companies.find(x=>allowed(it.url,x.domains));out.push({...it,source:`跨公司搜索：${key}`,official:allowed(it.url,known)||approved.has(normalized(it.url)),company:co?.name||host(it.url)});}}
    catch(e){errors.push(`跨公司搜索 ${key}：${e.message}`);}
  }
  try{const q=`site:mp.weixin.qq.com (${keys.slice(0,3).join(' OR ')}) 招聘`;const rss=await getText(`https://www.bing.com/search?format=rss&q=${encodeURIComponent(q)}`);for(const it of xmlItems(rss).slice(0,12))if(!blocked(it.url))out.push({...it,source:'公开公众号跨公司搜索',official:approved.has(normalized(it.url)),company:host(it.url)});}
  catch(e){errors.push(`公开公众号跨公司搜索：${e.message}`);}
  for(const co of companies){
    const q=`${co.name} (${keys.slice(0,3).join(' OR ')||'产品 实习'}) 招聘`;
    try{const rss=await getText(`https://www.bing.com/search?format=rss&q=${encodeURIComponent(q)}`);for(const it of xmlItems(rss).slice(0,12))if(!blocked(it.url))out.push({...it,source:`搜索：${co.name}`,official:allowed(it.url,co.domains)||approved.has(normalized(it.url)),company:co.name});}
    catch(e){errors.push(`${co.name} 搜索：${e.message}`);}
    try{const q2=`site:mp.weixin.qq.com ${co.name} (${keys.slice(0,2).join(' OR ')||'招聘'}) 招聘`;const rss=await getText(`https://www.bing.com/search?format=rss&q=${encodeURIComponent(q2)}`);for(const it of xmlItems(rss).slice(0,8))out.push({...it,source:`公开公众号搜索：${co.name}`,official:approved.has(normalized(it.url)),company:co.name});}
    catch(e){errors.push(`${co.name} 公众号搜索：${e.message}`);}
  }
  const pages=[...new Map(out.filter(sourceLike).map(x=>[normalized(x.url),x])).values()].slice(0,12);
  for(const page of pages){
    const record={url:normalized(page.url),name:page.title||host(page.url),kind:host(page.url)==='mp.weixin.qq.com'?'公开公众号文章':'招聘页',status:page.official?'来源已确认':'来源待确认',lastSeen:new Date().toISOString()};
    try{if(!await canRead(page.url))throw Error('浏览器未授予网站读取权限');const html=await getText(page.url);for(const l of htmlLinks(html,page.url).slice(0,180)){const url=normalized(l.url);if(!url||blocked(url)||!detail(url))continue;const co=companies.find(x=>allowed(url,x.domains));out.push({...l,source:`自动发现：${page.title||host(page.url)}`,official:allowed(url,known)||approved.has(url)||(page.official&&host(url)===host(page.url)),company:co?.name||host(url)});}}
    catch(e){record.status='读取失败';record.reason=e.message;errors.push(`自动发现来源 ${record.name}：${e.message}`);}
    discoveredSources.push(record);
  }
  for(const s of sources){
    try{if(!await canRead(s.url)){errors.push(`${s.name}：未授予网站权限`);continue;}const html=await getText(s.url);if(detail(s.url))out.push({url:s.url,title:s.name,source:s.name,official:s.type==='官方',company:s.name});for(const l of htmlLinks(html,s.url).slice(0,180)){if(!detail(l.url)&&!keys.some(k=>l.title.includes(k)))continue;const co=companies.find(x=>allowed(l.url,x.domains));out.push({...l,source:s.name,official:Boolean(co)||allowed(l.url,trusted)||approved.has(normalized(l.url))||(s.type==='官方'&&host(l.url)===host(s.url)),company:co?.name||s.name});}}
    catch(e){errors.push(`${s.name}：${e.message}`);}
  }
  const dedup=new Map();
  for(const item of out){const key=normalized(item.url);if(!key)continue;const old=dedup.get(key);if(!old)dedup.set(key,item);else dedup.set(key,{...(item.official?item:old),official:old.official||item.official,source:[...new Set([old.source,item.source])].join('；')});}
  return {candidates:[...dedup.values()].slice(0,150),discoveredSources,errors};
}
async function scan({daily=false}={}){
  const data=await chrome.storage.local.get(['config','jobs','scanLog','sourceIndex','approvedUrls','dailyIssue']);const c=data.config;if(!c)throw Error('请先在设置中填写毕业年份和岗位关键词。');
  const found=await collect(c,data.approvedUrls||[]);const {discoveredSources,errors}=found,jobs=data.jobs||{},approved=new Set(data.approvedUrls||[]);let newVerified=0,newLeads=0;const now=new Date();
  const candidates=new Map(found.candidates.map(item=>[normalized(item.url),item]));
  for(const j of Object.values(jobs))if(j.url&&j.source!=='本人自选'&&(j.verified||j.status==='待复核'||approved.has(j.url))&&!candidates.has(normalized(j.url)))candidates.set(normalized(j.url),{url:j.url,title:j.title,company:j.company,source:j.source,official:j.official||approved.has(j.url)});
  for(const item of candidates.values()){
    const url=normalized(item.url),prior=jobs[url];if(!url)continue;
    if(prior?.source==='本人自选'||prior?.status&&['不适配','已放弃','已投递','面试中','无回复','不通过','Offer','失效'].includes(prior.status))continue;
    let html='',body='',reason='';
    if(!item.official&&!prior?.official&&!approved.has(url))reason='来源尚未确认为官方';
    else if(!detail(url))reason='尚未找到具体职位链接';
    else if(!await canRead(url))reason='未授予职位网站权限';
    else try{html=await getText(url);body=pageText(html).slice(0,30000);}catch(e){reason=`职位页无法读取：${e.message}`;}
    const title=clean((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)||[])[1])||item.title||'职位待确认';
    const relevant=words(c.keywords).some(k=>(title+' '+body).toLowerCase().includes(k.toLowerCase()));
    const excluded=words(c.exclude).some(k=>(title+' '+body).includes(k));
    if((!relevant||excluded)&&!prior)continue;
    if(!reason&&body.length<160)reason='职位页没有可读取的完整 JD';
    if(!reason&&closed(body))reason='岗位已关闭或停止投递';
    if(!reason&&!/(岗位职责|工作职责|职位描述|职责要求|任职要求|职位要求|responsibilities|requirements)/i.test(body))reason='职责或要求未核验';
    if(!reason&&!/(北京|上海|深圳|广州|杭州|成都|厦门|武汉|南京|苏州|实习|校招|应届|届|intern|graduate)/i.test(body))reason='地点或届别信息未核验';
    if(!reason&&!applyOpen(html))reason='投递入口未核验';
    const deadline=body?dateFrom(body):prior?.deadline||null;if(!reason&&deadline&&new Date(deadline)<now)reason='申请截止日已过';
    const preferred=companyRows(c).find(x=>allowed(url,x.domains)),verified=!reason,company=preferred?.name||item.company||host(url);
    const unavailable=reason==='岗位已关闭或停止投递'||reason==='申请截止日已过';
    const status=unavailable?'失效':verified?(prior?.status==='待复核'?prior.previousStatus||'新发现':prior?.status==='待用户确认'?'新发现':prior?.status||'新发现'):(prior?.verified||prior?.status==='待复核'?'待复核':prior?.status||'待用户确认');
    const entry={...prior,id:prior?.id||crypto.randomUUID(),url,title,company,source:item.source,official:item.official||prior?.official||approved.has(url),isDetail:detail(url),verified,reason,status,previousStatus:status==='待复核'?prior?.previousStatus||prior?.status:null,firstSeen:prior?.firstSeen||now.toISOString(),firstVerifiedAt:verified?(prior?.firstVerifiedAt||now.toISOString()):prior?.firstVerifiedAt||null,lastSeen:now.toISOString(),deadline,score:verified?score(title,body,Boolean(preferred),c,url):null,jd:body?body.slice(0,12000):prior?.jd||'',feedback:prior?.feedback||null,resumeDraft:prior?.resumeDraft||''};
    if(!prior&&verified){const duplicate=Object.values(jobs).find(j=>j.verified&&sameRole(j,entry));if(duplicate){if(duplicate.deadline&&entry.deadline&&duplicate.deadline!==entry.deadline){entry.verified=false;entry.score=null;entry.status='待用户确认';entry.reason='同岗来源的截止日不一致';}else{duplicate.urls=[...new Set([...(duplicate.urls||[duplicate.url]),url])];duplicate.source=[...new Set([...(duplicate.source||'').split('；'),item.source].filter(Boolean))].join('；');duplicate.lastSeen=now.toISOString();continue;}}}
    if(!prior){if(entry.verified)newVerified++;else newLeads++;}else if(!prior.verified&&entry.verified)newVerified++;jobs[url]=entry;
  }
  for(const j of Object.values(jobs)){if(j.status==='已投递'&&j.appliedAt&&now.getTime()-new Date(j.appliedAt).getTime()>=21*86400000){j.status='无回复';j.noReplyAt=now.toISOString();}}
  const sourceIndex=Object.fromEntries([...new Map([...Object.values(data.sourceIndex||{}),...discoveredSources].map(x=>[x.url,x])).values()].sort((a,b)=>b.lastSeen.localeCompare(a.lastSeen)).slice(0,100).map(x=>[x.url,x]));
  const run={at:now.toISOString(),candidates:candidates.size,sources:discoveredSources.length,verified:newVerified,leads:newLeads,errors};
  let dailyIssue=data.dailyIssue;
  if(daily){const ready=Object.values(jobs).filter(j=>j.verified&&!j.reportedAt&&['新发现','待投递'].includes(j.status)).sort((a,b)=>Number(waitedMoreThanOneWorkday(b.firstVerifiedAt||b.firstSeen,now))-Number(waitedMoreThanOneWorkday(a.firstVerifiedAt||a.firstSeen,now))||(b.score?.total||0)-(a.score?.total||0));const chosen=ready.slice(0,5);for(const j of chosen)j.reportedAt=now.toISOString();dailyIssue={at:now.toISOString(),urls:chosen.map(j=>j.url),remaining:ready.length-chosen.length};}
  const urgent=Object.values(jobs).filter(j=>j.firstVerifiedAt===now.toISOString()&&j.verified&&j.score?.evaluableWeight>=50&&j.score.total>=Number(c.highMatchThreshold||80)&&j.deadline&&new Date(j.deadline).getTime()-now.getTime()<72*3600000&&new Date(j.deadline)>now);
  await chrome.storage.local.set({jobs,sourceIndex,dailyIssue,urgentIssue:urgent.length?{at:now.toISOString(),urls:urgent.map(j=>j.url)}:null,lastRun:run,scanLog:[...(data.scanLog||[]),run].slice(-180)});
  if(daily||urgent.length){if(c.reportMode==='badge'&&chrome.action){await chrome.action.setBadgeText({text:String(daily?dailyIssue.urls.length:urgent.length)});}else await chrome.tabs.create({url:chrome.runtime.getURL(`report.html${urgent.length&&!daily?'?urgent=1':''}`)});}
  return run;
}
let running=null;
function run(opts){if(!running)running=scan(opts).finally(()=>running=null);return running;}
function reportTiming(c,n){const mode=c.dailySchedule||(c.dailyTime&&c.dailyTime!=='09:00'?'custom':'weekdays-09'),everyDay=mode==='daily-09'||mode==='custom'&&c.dailyDays==='daily';return {enabled:everyDay||n.getDay()!==0&&n.getDay()!==6,time:mode==='custom'?c.dailyTime||'09:00':'09:00'};}
async function tick(){const {config,scheduleState={}}=await chrome.storage.local.get(['config','scheduleState']);if(!config)return;const n=new Date(),day=n.toLocaleDateString('en-CA'),hm=n.toTimeString().slice(0,5),workday=n.getDay()!==0&&n.getDay()!==6;const slot=workday?words(config.scanTimes).sort().filter(t=>t<=hm).at(-1):null;const scanDue=Boolean(slot&&(scheduleState.day!==day||scheduleState.slot!==slot)),timing=reportTiming(config,n),reportDue=timing.enabled&&timing.time<=hm&&scheduleState.reportDay!==day;if(!scanDue&&!reportDue)return;try{await run({daily:reportDue});await chrome.storage.local.set({scheduleState:{day,slot:scanDue?slot:scheduleState.day===day?scheduleState.slot||null:null,reportDay:reportDue?day:scheduleState.reportDay}});}catch(e){await chrome.storage.local.set({lastRun:{at:n.toISOString(),verified:0,leads:0,errors:[e.message]}});}}
chrome.runtime.onInstalled.addListener(()=>{chrome.alarms.create(TICK,{periodInMinutes:5});chrome.runtime.openOptionsPage();});
chrome.runtime.onStartup.addListener(()=>{chrome.alarms.create(TICK,{periodInMinutes:5});tick();});
chrome.alarms.onAlarm.addListener(a=>{if(a.name===TICK)tick();});
chrome.runtime.onMessage.addListener((m,_,reply)=>{if(m.type==='scan'){run({daily:false}).then(reply,e=>reply({error:e.message,verified:0,leads:0}));return true;}});

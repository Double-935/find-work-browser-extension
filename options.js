const $ = id => document.getElementById(id);
const defaults = {gradYear:'',days:'',keywords:'',exclude:'',cities:'',companies:'',trustedDomains:'',sources:'',weightDirection:'35',weightFeasibility:'25',weightCompany:'15',weightRelevance:'15',weightLocation:'5',weightSalary:'5',resume:'',dailyTime:'09:00',scanTimes:'09:00,15:00,21:00'};
const fields = Object.keys(defaults);
const weightFields=['weightDirection','weightFeasibility','weightCompany','weightRelevance','weightLocation','weightSalary'];
const origins = c => {
  const hosts = new Set();
  for (const line of c.companies.split('\n')) {
    const [, raw=''] = line.split('|');
    for (const host of raw.split(',')) if (host.trim()) hosts.add(host.trim().replace(/^https?:\/\//,'').replace(/\/.*$/,''));
  }
  for (const line of c.sources.split('\n')) {
    const [, raw=''] = line.split('|');
    try { const u=new URL(raw.trim()); if(u.protocol==='https:') hosts.add(u.hostname); } catch {}
  }
  for (const raw of c.trustedDomains.split('\n')) if(raw.trim()) hosts.add(raw.trim().replace(/^https?:\/\//,'').replace(/\/.*$/,''));
  return [...hosts].filter(h=>/^[a-z0-9.-]+$/i.test(h)).map(h=>`https://${h}/*`);
};
async function load(){const {config} = await chrome.storage.local.get('config'); for(const k of fields) $(k).value=config?.[k]??defaults[k];}
$('save').onclick=async()=>{
  const c=Object.fromEntries(fields.map(k=>[k,$(k).value.trim()]));
  const times=c.scanTimes.split(',').map(s=>s.trim());
  if(!/^20\d\d$/.test(c.gradYear)||!c.keywords||!times.every(t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t))){$('message').textContent='请填写毕业年份、目标岗位关键词和有效的扫描时间。';return;}
  const weights=weightFields.map(k=>Number(c[k]));
  if(weightFields.some(k=>!/^\d+$/.test(c[k]))||weights.some(n=>n<0||n>100)||weights.reduce((a,b)=>a+b,0)!==100){$('message').textContent='六项排序权重必须是 0–100 的整数，且合计为 100。';return;}
  for(const line of c.sources.split('\n').filter(Boolean)){const p=line.split('|');try{if(!p[0]?.trim()||new URL(p[1]?.trim()).protocol!=='https:')throw 0;}catch{$('message').textContent=`来源格式有误：${line}`;return;}}
  const needed=origins(c);let granted=true;
  try { if(needed.length) granted=await chrome.permissions.request({origins:needed}); } catch(e){granted=false;}
  await chrome.storage.local.set({config:c});
  $('message').textContent=granted?'设置已保存。电脑和浏览器开启时按本机时间扫描。':'设置已保存，但有网站权限未获授予；这些来源会留作待核验线索。';
};
load();

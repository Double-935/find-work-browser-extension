const $ = id => document.getElementById(id);
const defaults = {gradYear:'',days:'',keywords:'',exclude:'',cities:'',companies:'',industries:'',highMatchThreshold:'80',sizePreference:'',stagePreference:'',smallMax:'99',mediumMax:'999',salaryMin:'',salaryMax:'',salaryCurrency:'CNY',salaryPeriod:'month',salaryWorkType:'intern',reportMode:'tab',resume:'',dailyTime:'09:00',scanTimes:'09:00,15:00,21:00'};
const fields = Object.keys(defaults);
const priorityNames=['地区','薪资','行业','公司平台','个人发展与能力提升','专业对口或岗位契合度','有转正HC','包吃住','有亲朋好友','有喜欢的娱乐措施/可以发展爱好','宠物友好'];
const priorityTypes={'地区':'location','薪资':'salary','行业':'keyword','公司平台':'company','个人发展与能力提升':'development','专业对口或岗位契合度':'keyword','有转正HC':'conversion','包吃住':'mealsHousing','宠物友好':'petFriendly'};
let removeResumeFile=false,savedResumeName='';
function syncConditionalFields(){
  $('smallMaxField').hidden=$('sizePreference').value!=='small';
  $('mediumMaxField').hidden=$('sizePreference').value!=='medium';
  $('salaryDetails').hidden=!$('salaryMin').value.trim()&&!$('salaryMax').value.trim();
}
function criteriaFor(config){
  if(Array.isArray(config?.criteria))return config.criteria;
  if(config&&'weightDirection' in config)return [
    {name:'岗位方向',type:'keyword',terms:'',weight:Number(config.weightDirection)},
    {name:'实习／届别可行性',type:'feasibility',terms:'',weight:Number(config.weightFeasibility)},
    {name:'优先公司',type:'company',terms:'',weight:Number(config.weightCompany)},
    {name:'AI／教育相关度',type:'keyword',terms:'AI,Agent,AIGC,人工智能,教育,课程',weight:Number(config.weightRelevance)},
    {name:'城市',type:'location',terms:'',weight:Number(config.weightLocation)},
    {name:'薪酬是否公开',type:'salary',terms:'',weight:Number(config.weightSalary)}
  ];
  return [{name:'',type:'keyword',terms:'',weight:100}];
}
function updateWeightRemaining(){
  let used=0,index=0;
  for(const row of document.querySelectorAll('.criterion-row')){
    row.querySelector('.criterion-index').textContent=`规则 ${++index}`;
    const value=Number(row.querySelector('.criterion-weight').value);
    used+=Number.isFinite(value)?value:0;
    const left=100-used,indicator=row.querySelector('.criterion-weight-remaining');
    indicator.textContent=left>=0?`这条后还剩 ${left}%`:`这条后超出 ${-left}%`;
    indicator.classList.toggle('warn',left<0);
  }
}
function addCriterion(value={name:'',type:'keyword',terms:'',weight:0}){
  const row=document.createElement('section');row.className='criterion-row';
  const field=(caption,node)=>{const label=document.createElement('label');label.textContent=caption;label.append(node);return label;};
  const nameChoice=document.createElement('select');nameChoice.className='criterion-name-choice';
  for(const [key,caption] of [['','请选择'],...priorityNames.map(name=>[name,name]),['__custom__','其他（自己填写）']]){const option=document.createElement('option');option.value=key;option.textContent=caption;nameChoice.append(option);}
  const savedName=value.name??'';nameChoice.value=priorityNames.includes(savedName)?savedName:savedName?'__custom__':'';
  const customName=document.createElement('input');customName.className='criterion-name-custom';customName.placeholder='填写你看重的条件';customName.value=nameChoice.value==='__custom__'?savedName:'';
  const updateName=()=>{customName.hidden=nameChoice.value!=='__custom__';};nameChoice.onchange=updateName;updateName();
  const nameLabel=field('我看重什么？',nameChoice);nameLabel.append(customName);
  const weight=document.createElement('input');weight.className='criterion-weight';weight.type='number';weight.min='0';weight.max='100';weight.step='1';weight.value=String(value.weight??0);
  const remaining=document.createElement('span');remaining.className='criterion-weight-remaining';weight.oninput=updateWeightRemaining;
  const index=document.createElement('strong');index.className='criterion-index';
  const remove=document.createElement('button');remove.type='button';remove.className='text-button';remove.textContent='删除规则';remove.onclick=()=>{row.remove();updateWeightRemaining();};
  const header=document.createElement('div');header.className='criterion-header';header.append(index,remaining,remove);
  const fieldsBox=document.createElement('div');fieldsBox.className='criterion-fields';fieldsBox.append(nameLabel,field('占总分多少？',weight));
  row.append(header,fieldsBox);$('criteria').append(row);updateWeightRemaining();
}
async function load(){
  if(!globalThis.chrome?.storage?.local){for(const k of fields)$(k).value=defaults[k];syncConditionalFields();$('criteria').replaceChildren();for(const item of criteriaFor(null))addCriterion(item);$('clearResumeFile').hidden=true;$('save').disabled=true;$('message').textContent='当前是文件预览；安装为浏览器扩展后才能保存设置。';return;}
  const {config} = await chrome.storage.local.get('config');for(const k of fields) $(k).value=config?.[k]??defaults[k];syncConditionalFields();$('criteria').replaceChildren();for(const item of criteriaFor(config))addCriterion(item);updateWeightRemaining();try{const saved=await resumeStore.get();savedResumeName=saved?.name||'';$('currentResumeFile').textContent=saved?`已保存：${saved.name}`:'尚未选择文件';$('clearResumeFile').textContent='移除已保存文件';$('clearResumeFile').hidden=!saved;}catch(e){$('currentResumeFile').textContent=`无法读取已保存文件：${e.message}`;$('clearResumeFile').hidden=true;}
}
$('addCriterion').onclick=()=>addCriterion();
$('sizePreference').onchange=syncConditionalFields;
$('salaryMin').oninput=syncConditionalFields;
$('salaryMax').oninput=syncConditionalFields;
$('resumeFile').onchange=()=>{const file=$('resumeFile').files[0];if(file){removeResumeFile=false;$('currentResumeFile').textContent=`待保存：${file.name}`;$('clearResumeFile').textContent='取消选择';$('clearResumeFile').hidden=false;}};
$('clearResumeFile').onclick=()=>{if($('resumeFile').files[0]){$('resumeFile').value='';removeResumeFile=false;$('currentResumeFile').textContent=savedResumeName?`已保存：${savedResumeName}`:'尚未选择文件';$('clearResumeFile').textContent='移除已保存文件';$('clearResumeFile').hidden=!savedResumeName;return;}removeResumeFile=true;$('currentResumeFile').textContent='将在保存设置后移除已保存文件';$('clearResumeFile').hidden=true;};
$('save').onclick=async()=>{
  const c=Object.fromEntries(fields.map(k=>[k,$(k).value.trim()]));
  if(c.sizePreference!=='small')c.smallMax=defaults.smallMax;
  if(c.sizePreference!=='medium')c.mediumMax=defaults.mediumMax;
  const times=c.scanTimes.split(',').map(s=>s.trim());
  if(!/^20\d\d$/.test(c.gradYear)||Number(c.gradYear)>2040||(c.days!==''&&(!/^\d+$/.test(c.days)||Number(c.days)<1||Number(c.days)>7))||!c.keywords||!/^([01]\d|2[0-3]):[0-5]\d$/.test(c.dailyTime)||!times.every(t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t))){$('message').textContent='请检查毕业年份、每周实习天数、目标岗位关键词和日报／扫描时间。';return;}
  if(!/^\d+$/.test(c.highMatchThreshold)||Number(c.highMatchThreshold)>100||!/^\d+$/.test(c.smallMax)||Number(c.smallMax)<1||!/^\d+$/.test(c.mediumMax)||Number(c.mediumMax)<2||(c.sizePreference==='medium'&&Number(c.mediumMax)<=Number(c.smallMax))||[c.salaryMin,c.salaryMax].some(x=>x!==''&&!/^\d+(?:\.\d+)?$/.test(x))||(c.salaryMin&&c.salaryMax&&Number(c.salaryMin)>Number(c.salaryMax))){$('message').textContent='请检查高匹配门槛、公司人数界线和期望薪资范围。';return;}
  c.criteria=[...document.querySelectorAll('.criterion-row')].map(row=>{const choice=row.querySelector('.criterion-name-choice').value,name=(choice==='__custom__'?row.querySelector('.criterion-name-custom').value:choice).trim();return {name,type:priorityTypes[name]||'other',terms:'',weight:Number(row.querySelector('.criterion-weight').value),weightText:row.querySelector('.criterion-weight').value.trim()};});
  if(!c.criteria.length||c.criteria.some(x=>!x.name||!/^\d+$/.test(x.weightText)||x.weight<0||x.weight>100)||c.criteria.reduce((sum,x)=>sum+x.weight,0)!==100){$('message').textContent='请至少设置一项求职重点；每项填写名称与 0–100 的整数权重，合计为 100。';return;}
  c.criteria=c.criteria.map(({weightText,...item})=>item);
  const file=$('resumeFile').files[0];
  if(file&&(!/\.(pdf|doc|docx|txt|md|rtf|odt)$/i.test(file.name)||file.size===0||file.size>15*1024*1024)){$('message').textContent='请选择非空且不超过 15 MB 的 PDF、Word、TXT、Markdown、RTF 或 ODT 文件。';return;}
  try{
    if(file)await resumeStore.save(file);
    else if(removeResumeFile)await resumeStore.remove();
    const saved=await resumeStore.get();c.resumeFileName=saved?.name||'';c.resumeFileSize=saved?.size||0;
    await chrome.storage.local.set({config:c});$('smallMax').value=c.smallMax;$('mediumMax').value=c.mediumMax;removeResumeFile=false;$('resumeFile').value='';
    savedResumeName=saved?.name||'';$('currentResumeFile').textContent=saved?`已保存：${saved.name}`:'尚未选择文件';$('clearResumeFile').textContent='移除已保存文件';$('clearResumeFile').hidden=!saved;
    $('message').textContent='设置已保存。提供母板的岗位可准备简历提示词；未提供母板时不会生成。';
  }catch(e){$('message').textContent=`文件或设置保存失败：${e.message}`;}
};
load();

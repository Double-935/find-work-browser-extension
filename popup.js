const $ = id => document.getElementById(id);
async function refresh() {
  const { lastRun } = await chrome.storage.local.get('lastRun');
  $('status').textContent = lastRun ? `上次扫描：${new Date(lastRun.at).toLocaleString()}；可投 ${lastRun.verified}，线索 ${lastRun.leads}` : '尚未扫描。先填写个人设置。';
}
$('report').onclick = () => chrome.tabs.create({url:chrome.runtime.getURL('report.html')});
$('settings').onclick = () => chrome.runtime.openOptionsPage();
$('scan').onclick = async () => { $('status').textContent='扫描中…'; const r=await chrome.runtime.sendMessage({type:'scan'}); $('status').textContent=r.error||`完成：可投 ${r.verified}，线索 ${r.leads}`; };
refresh();

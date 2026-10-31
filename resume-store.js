const resumeStore=(()=>{
  const database='find-work-local-resume',store='files',key='master';
  const open=()=>new Promise((resolve,reject)=>{
    const request=indexedDB.open(database,1);
    request.onupgradeneeded=()=>request.result.createObjectStore(store);
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
  async function transact(mode,action){
    const db=await open();
    return new Promise((resolve,reject)=>{
      let result;
      const transaction=db.transaction(store,mode),request=action(transaction.objectStore(store));
      request.onsuccess=()=>{result=request.result;};
      transaction.oncomplete=()=>{db.close();resolve(result);};
      transaction.onerror=()=>{db.close();reject(transaction.error);};
      transaction.onabort=()=>{db.close();reject(transaction.error||new Error('文件保存已中止'));};
    });
  }
  return {
    save:file=>transact('readwrite',s=>s.put({file,name:file.name,size:file.size,type:file.type,lastModified:file.lastModified},key)),
    get:()=>transact('readonly',s=>s.get(key)),
    remove:()=>transact('readwrite',s=>s.delete(key))
  };
})();

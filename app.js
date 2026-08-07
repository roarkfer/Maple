(() => {
  const STORAGE_KEY='kompakt-lists-v1', DARK_KEY='maple-dark';
  const DEFAULT={labels:{habits:'Hábitos',tasks:'Tareas',exercises:'Ejercicios'},tasks:[],habits:[],folders:[],lastPurge:0};
  const DAY_LABELS=['L','M','M','J','V','S','D'];
  let store=loadStore(), tab='tasks', editing=false, openFolder=null, openHabit=null, draft='';
  let dark=localStorage.getItem(DARK_KEY)==='1';
  document.documentElement.classList.toggle('dark',dark);

  function clone(x){return JSON.parse(JSON.stringify(x))}
  function id(){return Math.random().toString(36).slice(2)+Date.now().toString(36)}
  function dateKey(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
  function mondayOf(d){const x=new Date(d);x.setHours(0,0,0,0);x.setDate(x.getDate()-((x.getDay()+6)%7));return x}
  function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
  function lastTwoAm(now=new Date()){const d=new Date(now);d.setHours(2,0,0,0);if(d>now)d.setDate(d.getDate()-1);return d.getTime()}
  function purge(s){const cutoff=lastTwoAm();if((s.lastPurge||0)>=cutoff)return s;return {...s,lastPurge:cutoff,tasks:(s.tasks||[]).filter(i=>!i.done)}}
  function migrate(raw={}){const p={...clone(DEFAULT),...raw};const legacy=raw.lists;const tasks=p.tasks?.length?p.tasks:(legacy?.tasks||[]);const habits=p.habits?.length?p.habits:(legacy?.habits||[]).map(i=>({id:i.id,name:i.text,marks:{}}));return {labels:{...DEFAULT.labels,...(p.labels||{})},tasks,habits:habits.map(h=>({...h,marks:h.marks||{}})),folders:p.folders||[],lastPurge:p.lastPurge||0}}
  function loadStore(){try{return purge(migrate(JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')))}catch{return clone(DEFAULT)}}
  function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(store))}
  function esc(s=''){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
  function today(){const d=new Date();d.setHours(0,0,0,0);return d}
  function icon(k){return {habits:'↻',tasks:'✓',exercises:'⌁'}[k]}
  function move(arr,from,to){if(to<0||to>=arr.length)return arr;const next=arr.slice();const [x]=next.splice(from,1);next.splice(to,0,x);return next}
  function reorder(kind,index,dir,folderId=null){
    if(kind==='tasks') store.tasks=move(store.tasks,index,index+dir);
    if(kind==='habits') store.habits=move(store.habits,index,index+dir);
    if(kind==='folders') store.folders=move(store.folders,index,index+dir);
    if(kind==='exercises'){
      const f=store.folders.find(x=>x.id===folderId);
      if(f) f.exercises=move(f.exercises,index,index+dir);
    }
    save(); render();
  }
  function reorderControls(kind,index,length,folderId=''){
    return `<span class="reorder">
      <button aria-label="Subir" data-reorder="${kind}" data-index="${index}" data-dir="-1" data-folder="${folderId}" ${index===0?'disabled':''}>⌃</button>
      <button aria-label="Bajar" data-reorder="${kind}" data-index="${index}" data-dir="1" data-folder="${folderId}" ${index===length-1?'disabled':''}>⌄</button>
    </span>`;
  }

  function render(){
    const folder=store.folders.find(f=>f.id===openFolder)||null;
    const habit=store.habits.find(h=>h.id===openHabit)||null;
    const inFolder=tab==='exercises'&&folder, inFolderList=tab==='exercises'&&!folder, inHabit=tab==='habits'&&habit;
    const title=inFolder?folder.name:inHabit?habit.name:store.labels[tab];
    document.getElementById('app').innerHTML=`<div class="app">
      <nav class="tabs">${['habits','tasks','exercises'].map(k=>`<button class="tab ${tab===k?'active':''}" data-tab="${k}"><span>${icon(k)}</span><span>${esc(store.labels[k])}</span></button>`).join('')}</nav>
      <button class="edit-btn ${editing?'active':''}" id="editBtn">${editing?'✕ Listo':'✎ Editar'}</button>
      ${editing?editPanel():''}
      <div class="section-head">${(inFolder||inHabit)?'<button class="back" id="backBtn" aria-label="Volver">‹</button>':''}<h1 class="section-title">${esc(title)}</h1></div>
      ${inHabit?yearView(habit):tab==='habits'?habitsView():inFolderList?foldersView():inFolder?exerciseView(folder):tasksView()}
      ${!inHabit?addForm(inFolderList,inFolder):''}
      <p class="footer">Las tareas completadas se borran a las 2:00 am</p>
    </div>`;
    wire();
  }

  function editPanel(){return `<section class="edit-panel"><p class="eyebrow">Nombres de pestañas</p>${['habits','tasks','exercises'].map(k=>`<label class="rename-row"><span>${icon(k)}</span><input data-label="${k}" value="${esc(store.labels[k])}"></label>`).join('')}<div class="mode-row"><span>${dark?'☾':'☀'} Modo oscuro</span><button class="switch ${dark?'on':''}" id="darkBtn"><span></span></button></div></section>`}

  function tasksView(){return `<ul class="list">${store.tasks.map((i,ti)=>`<li class="row task-row">
    <button class="check ${i.done?'on':''}" data-task-toggle="${i.id}">${i.done?'✓':''}</button>
    ${editing?`<input class="task-input ${i.done?'done':''}" data-task-name="${i.id}" value="${esc(i.text)}">`:`<button class="task-text ${i.done?'done':''}" data-task-toggle="${i.id}">${esc(i.text)}</button>`}
    ${editing?reorderControls('tasks',ti,store.tasks.length):''}
    ${editing?`<button class="delete" data-task-del="${i.id}">⌫</button>`:''}
  </li>`).join('')||'<li class="empty">Lista vacía.</li>'}</ul>`}

  function habitsView(){
    const t=today(),m=mondayOf(t),tk=dateKey(t),days=Array.from({length:7},(_,i)=>addDays(m,i));
    return `<ul class="list">${store.habits.map((h,hi)=>`<li class="row"><div class="habit-head">
      ${editing?`<input class="habit-name" data-habit-name="${h.id}" value="${esc(h.name)}">`:`<button class="habit-name" data-habit-open="${h.id}">${esc(h.name)}</button>`}
      ${editing?reorderControls('habits',hi,store.habits.length):''}
      ${editing?`<button class="delete" data-habit-del="${h.id}">⌫</button>`:''}
    </div><div class="week-grid">${days.map((d,i)=>{const k=dateKey(d),isToday=k===tk,on=!!h.marks[k];return `<div class="day ${isToday?'today':''}"><span class="day-label">${DAY_LABELS[i]}</span><button class="check ${on?'on':''}" ${isToday?`data-habit-toggle="${h.id}" data-date="${k}"`:'disabled'}>${on?'✓':''}</button></div>`}).join('')}</div></li>`).join('')||'<li class="empty">Sin hábitos.</li>'}</ul>`;
  }

  function foldersView(){return `<ul class="list">${store.folders.map((f,fi)=>`<li class="row folder-row">
    <span class="folder-icon">□</span>
    ${editing?`<input class="folder-name" data-folder-name="${f.id}" value="${esc(f.name)}">`:`<button class="folder-name" data-folder-open="${f.id}">${esc(f.name)}</button>`}
    <span class="count">${f.exercises.length}</span>
    ${editing?reorderControls('folders',fi,store.folders.length):''}
    ${editing?`<button class="delete" data-folder-del="${f.id}">⌫</button>`:''}
  </li>`).join('')||'<li class="empty">Sin carpetas. Agrega una abajo.</li>'}</ul>`}

  function stepper(val,type,fid,eid){return `<div class="stepper"><button data-step="-1" data-type="${type}" data-folder="${fid}" data-ex="${eid}">−</button><span>${val}</span><button data-step="1" data-type="${type}" data-folder="${fid}" data-ex="${eid}">+</button></div>`}

  function exerciseView(folder){return `<div class="list"><div class="exercise-header"><span style="text-align:center">Sets</span><span>Ejercicio</span><span style="text-align:center">Reps</span><span style="text-align:center">Kg</span></div>${folder.exercises.map((ex,xi)=>`<div class="row"><div class="exercise-grid">
    ${stepper(ex.sets,'sets',folder.id,ex.id)}
    <input class="exercise-name" data-ex-name="${ex.id}" data-folder="${folder.id}" value="${esc(ex.name)}">
    ${stepper(ex.reps,'reps',folder.id,ex.id)}
    ${stepper(ex.kg,'kg',folder.id,ex.id)}
  </div>${editing?`<div class="exercise-actions">${reorderControls('exercises',xi,folder.exercises.length,folder.id)}<button class="delete delete-text" data-ex-del="${ex.id}" data-folder="${folder.id}">⌫ Eliminar</button></div>`:''}</div>`).join('')||'<div class="empty">Sin ejercicios.</div>'}</div>`}

  function yearView(h){const t=today(),year=t.getFullYear(),start=mondayOf(new Date(year,0,1)),end=new Date(year,11,31),weeks=[];for(let d=new Date(start);d<=end;d=addDays(d,7))weeks.push(Array.from({length:7},(_,i)=>addDays(d,i)));const marked=Object.values(h.marks).filter(Boolean).length;return `<div class="list"><p class="eyebrow">${year} · ${marked} días marcados</p><div class="year-wrap"><div class="year-grid">${weeks.map(w=>`<div class="week-col">${w.map(d=>{const k=dateKey(d),inside=d.getFullYear()===year,on=!!h.marks[k];return `<span class="dot ${!inside?'out':on?'on':''}" title="${k}"></span>`}).join('')}</div>`).join('')}</div></div></div>`}

  function addForm(inFolderList,inFolder){const ph=inFolderList?'Nueva carpeta…':inFolder?'Nuevo ejercicio…':tab==='habits'?'Nuevo hábito…':'Agregar…';return `<form class="add-form" id="addForm"><input id="draft" placeholder="${ph}" value="${esc(draft)}"><button class="add" type="submit">${inFolderList?'□':'+'}</button></form>`}

  function addItem(){const text=(document.getElementById('draft')?.value||'').trim();if(!text)return;if(tab==='habits')store.habits.push({id:id(),name:text,marks:{}});else if(tab==='exercises'&&!openFolder)store.folders.push({id:id(),name:text,exercises:[]});else if(tab==='exercises'&&openFolder){const f=store.folders.find(x=>x.id===openFolder);f?.exercises.push({id:id(),name:text,sets:4,reps:12,kg:10})}else store.tasks.push({id:id(),text,done:false});draft='';save();render()}

  function wire(){
    document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;openFolder=null;openHabit=null;render()});
    document.getElementById('editBtn').onclick=()=>{editing=!editing;render()};
    document.getElementById('backBtn')?.addEventListener('click',()=>{openFolder=null;openHabit=null;render()});
    document.getElementById('darkBtn')?.addEventListener('click',()=>{dark=!dark;document.documentElement.classList.toggle('dark',dark);localStorage.setItem(DARK_KEY,dark?'1':'0');render()});
    document.querySelectorAll('[data-label]').forEach(i=>i.oninput=()=>{store.labels[i.dataset.label]=i.value;save()});
    document.querySelectorAll('[data-task-toggle]').forEach(b=>b.onclick=()=>{const i=store.tasks.find(x=>x.id===b.dataset.taskToggle);if(i)i.done=!i.done;save();render()});
    document.querySelectorAll('[data-task-name]').forEach(i=>i.oninput=()=>{const item=store.tasks.find(x=>x.id===i.dataset.taskName);if(item)item.text=i.value;save()});
    document.querySelectorAll('[data-task-del]').forEach(b=>b.onclick=()=>{store.tasks=store.tasks.filter(x=>x.id!==b.dataset.taskDel);save();render()});
    document.querySelectorAll('[data-habit-open]').forEach(b=>b.onclick=()=>{openHabit=b.dataset.habitOpen;render()});
    document.querySelectorAll('[data-habit-name]').forEach(i=>i.oninput=()=>{const h=store.habits.find(x=>x.id===i.dataset.habitName);if(h)h.name=i.value;save()});
    document.querySelectorAll('[data-habit-del]').forEach(b=>b.onclick=()=>{store.habits=store.habits.filter(x=>x.id!==b.dataset.habitDel);save();render()});
    document.querySelectorAll('[data-habit-toggle]').forEach(b=>b.onclick=()=>{const h=store.habits.find(x=>x.id===b.dataset.habitToggle);if(h)h.marks[b.dataset.date]=!h.marks[b.dataset.date];save();render()});
    document.querySelectorAll('[data-folder-open]').forEach(b=>b.onclick=()=>{openFolder=b.dataset.folderOpen;render()});
    document.querySelectorAll('[data-folder-name]').forEach(i=>i.oninput=()=>{const f=store.folders.find(x=>x.id===i.dataset.folderName);if(f)f.name=i.value;save()});
    document.querySelectorAll('[data-folder-del]').forEach(b=>b.onclick=()=>{store.folders=store.folders.filter(x=>x.id!==b.dataset.folderDel);save();render()});
    document.querySelectorAll('[data-ex-name]').forEach(i=>i.oninput=()=>{const f=store.folders.find(x=>x.id===i.dataset.folder);const e=f?.exercises.find(x=>x.id===i.dataset.exName);if(e)e.name=i.value;save()});
    document.querySelectorAll('[data-ex-del]').forEach(b=>b.onclick=()=>{const f=store.folders.find(x=>x.id===b.dataset.folder);if(f)f.exercises=f.exercises.filter(x=>x.id!==b.dataset.exDel);save();render()});
    document.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{const f=store.folders.find(x=>x.id===b.dataset.folder),e=f?.exercises.find(x=>x.id===b.dataset.ex);if(!e)return;const type=b.dataset.type,delta=Number(b.dataset.step);e[type]=Math.max(0,Number(e[type])+delta);save();render()});
    document.querySelectorAll('[data-reorder]').forEach(b=>b.onclick=()=>reorder(b.dataset.reorder,Number(b.dataset.index),Number(b.dataset.dir),b.dataset.folder||null));
    document.getElementById('addForm')?.addEventListener('submit',e=>{e.preventDefault();addItem()});
  }

  setInterval(()=>{const next=purge(store);if(next!==store){store=next;save();render()}},60000);
  if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js'));
  render();
})();

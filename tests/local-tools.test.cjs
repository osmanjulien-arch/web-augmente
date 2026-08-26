const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const source = ['toolbox','copy','feeds','source','notes'].map(name =>
  fs.readFileSync(path.join(root, `src/core/modules/${name}.js`), 'utf8')
).join('\n') + fs.readFileSync(path.join(root, 'src/core/local-tools.js'), 'utf8');
const PREF = 'wa-core:local-modules:v1';
const TOKEN = 'test-token-never-rendered';
const walk = el => [el, ...el.children.flatMap(walk)];

// Deliberately minimal DOM simulation: tests logic/lifecycle, not Safari rendering.
class Element {
  constructor(tag='div') {
    this.tagName = tag.toUpperCase(); this.children=[]; this.dataset={}; this.listeners={};
    this.attributes={}; this._text=''; this.value=''; this.isConnected=true; this.visible=true;
  }
  set textContent(value) { this._text=String(value); this.children=[]; }
  get textContent() { return this._text + this.children.map(c=>c.textContent).join(''); }
  append(...items) { for(const item of items) this.appendChild(item); }
  appendChild(item) { item.parent=this; this.children.push(item); return item; }
  replaceChildren(...items) { this._text=''; this.children=[]; this.append(...items); }
  remove() { if(this.parent) this.parent.children=this.parent.children.filter(c=>c!==this); this.isConnected=false; }
  setAttribute(name,value) { this.attributes[name]=value; }
  addEventListener(name,handler) { this.listeners[name]=handler; }
  querySelectorAll(selector) { return walk(this).slice(1).filter(c=>c.tagName.toLowerCase()===selector); }
  closest() { return this.excluded ? this : null; }
  getClientRects() { return this.visible ? [{}] : []; }
  scrollIntoView() { this.scrolled=true; }
  focus() { this.focused=true; }
  select() { this.selected=true; }
}

async function harness({store=new Map(),href='https://example.org/article?q=froid&utm_source=wa#section',clipboard=true}={}) {
  const root=new Element(), shadow=new Element(), head=new Element();
  const nodes=new Map();
  const calls={reads:[],writes:[],clipboard:[],network:0,prompts:0,close:0,scroll:[]};
  const behavior={failRead:false,failWrite:false,confirm:true};
  const listeners=new Map();
  const location={href,hostname:new URL(href).hostname,pathname:new URL(href).pathname};
  const document={
    title:'Cours [froid]',head,documentElement:new Element('html'),
    createElement:tag=>new Element(tag),
    querySelector:selector=>nodes.get(selector)?.[0]||null,
    querySelectorAll:selector=>nodes.get(selector)||[]
  };
  const window={
    confirm(){return behavior.confirm;},
    scrollTo(options){calls.scroll.push(options);},
    addEventListener(type,fn){listeners.set(type,fn);},
    removeEventListener(type,fn){if(listeners.get(type)===fn)listeners.delete(type);}
  };
  const status={};
  const options={panel:{querySelector:()=>root},shadow,
    getStored:async(key,fallback)=>{calls.reads.push(key);if(behavior.failRead)throw Error('read-failure');return store.has(key)?store.get(key):fallback;},
    setStored:async(key,value)=>{if(behavior.failWrite)throw Error('write-failure');calls.writes.push(key);store.set(key,value);},
    setStatus:(message,kind)=>Object.assign(status,{message,kind}),togglePanel:()=>{calls.close++;}
  };
  const context=vm.createContext({document,window,location,URL,Date,Set,Map,Error,options,
    navigator:{clipboard:clipboard?{writeText:async text=>calls.clipboard.push(text)}:undefined},
    fetch(){calls.network++;throw Error('network-forbidden');},
    prompt(){calls.prompts++;throw Error('prompt-forbidden');},
    localStorage:new Proxy({}, {get(){throw Error('page-storage-forbidden');}})
  });
  const manager=vm.runInContext(`${source}\ninstallLocalTools(options)`,context);
  await manager.ready;
  const find=(tag,text)=>walk(root).find(el=>el.tagName===tag&&el.textContent===text);
  const click=async label=>{const b=find('BUTTON',label);assert.ok(b,`button ${label}`);await b.listeners.click();};
  const checkbox=title=>walk(root).find(el=>el.attributes['aria-label']===`Afficher ${title}`);
  const toggle=async(title,on)=>{const el=checkbox(title);el.checked=on;await el.listeners.change();};
  const section=id=>walk(root).find(el=>el.dataset.waModule===id);
  return {root,shadow,head,nodes,calls,behavior,listeners,location,document,status,store,click,toggle,checkbox,section,
    editor:()=>walk(root).find(el=>el.attributes['aria-label']==='Note privée locale')};
}

test('five modules start inert, with no token read, request, prompt, observer or page style',async()=>{
  const h=await harness({store:new Map([['wa-core:token',TOKEN]])});
  assert.equal(walk(h.root).filter(el=>el.dataset.waModule).length,5);
  assert.deepEqual(h.calls.reads,[PREF]);assert.deepEqual(h.calls.writes,[]);
  assert.equal(h.calls.network,0);assert.equal(h.calls.prompts,0);assert.equal(h.listeners.size,0);
  assert.equal(h.head.children.length,0);assert.equal(h.root.textContent.includes(TOKEN),false);
  assert.doesNotMatch(source,/\b(?:fetch|xmlHttpRequest|MutationObserver|setInterval|eval)\s*\(/);
});

test('clean URL preserves semantic query and hash without navigating',async()=>{
  const h=await harness();const before=h.location.href;
  await h.click('Copier l’URL propre');
  assert.equal(h.calls.clipboard[0],'https://example.org/article?q=froid#section');
  assert.equal(h.location.href,before);assert.equal(h.calls.network,0);
});

test('Markdown title and URL are escaped',async()=>{
  const h=await harness({href:'https://example.org/a(b)?q=1'});
  await h.click('Copier le lien Markdown');
  assert.equal(h.calls.clipboard[0],'[Cours \\[froid\\]](<https://example.org/a%28b%29?q=1>)');
});

test('unavailable clipboard presents selected plain text without false success',async()=>{
  const h=await harness({clipboard:false});await h.click('Copier l’URL propre');
  const field=walk(h.root).find(el=>el.attributes['aria-label']==='Texte à copier manuellement');
  assert.ok(field.readOnly&&field.selected&&field.focused);assert.match(field.value,/example.org/);
  assert.match(h.status.message,/manuelle/);assert.notEqual(h.status.kind,'success');
});

test('outline excludes hidden and WA headings, navigates without adding IDs',async()=>{
  const h=await harness();const heading=new Element('h2');heading.textContent='Régulation';
  const hidden=new Element('h1');hidden.visible=false;hidden.textContent='Caché';
  const own=new Element('h2');own.excluded=true;own.textContent='WA';
  h.nodes.set('h1,h2,h3',[heading,hidden,own]);await h.click('Plan de la page');
  assert.equal(h.section('toolbox').textContent.includes('Caché'),false);
  const nav=walk(h.section('toolbox')).find(el=>el.tagName==='BUTTON'&&el.textContent==='— Régulation');
  nav.listeners.click();assert.equal(heading.scrolled,true);assert.equal(heading.id,undefined);assert.equal(h.calls.close,1);
  heading.isConnected=false;nav.listeners.click();assert.match(h.section('toolbox').textContent,/page a changé/);
});

test('top and bottom actions close the panel and scroll',async()=>{
  const h=await harness();h.document.documentElement.scrollHeight=1234;
  await h.click('Haut de page');await h.click('Bas de page');
  assert.deepEqual(h.calls.scroll.map(x=>x.top),[0,1234]);assert.equal(h.calls.close,2);
});

test('RSS lists all valid unique feeds, rejects dangerous URLs without network',async()=>{
  const h=await harness();h.nodes.set('link[type="application/rss+xml"],link[type="application/atom+xml"]',[
    {href:'/rss',title:'RSS'},{href:'/rss',title:'Duplicate'},{href:'https://example.org/atom',title:'<img onerror=alert(1)>'},
    {href:'javascript:alert(1)'},{href:'data:text/html,unsafe'},{href:'https://name:password@example.org/rss'}
  ]);await h.click('Chercher les flux de cette page');
  const links=walk(h.section('feeds')).filter(el=>el.tagName==='A');
  assert.equal(links.length,2);assert.equal(links[0].href,'https://example.org/rss');
  assert.equal(links[1].children.length,0);assert.equal(links[1].rel,'noopener noreferrer');assert.equal(h.calls.network,0);
});

test('RSS absence is reported without claiming the site has no feed',async()=>{
  const h=await harness();await h.click('Chercher les flux de cette page');
  assert.match(h.section('feeds').textContent,/Cela ne prouve pas/);
});

test('source capsule treats title as text and invalid canonical as unavailable',async()=>{
  const h=await harness();h.document.title='<img src=x onerror=alert(1)>';
  h.nodes.set('link[rel~="canonical"]',[{href:'javascript:alert(1)'}]);
  await h.click('Afficher la fiche source');
  assert.match(h.section('source').textContent,/<img src=x/);
  assert.match(h.section('source').textContent,/non indiquée ou invalide/);
  assert.equal(h.calls.network,0);
});

test('copy restoration is explicit, reversible, and leaves inputs/WA alone',async()=>{
  const h=await harness();await h.click('Activer le déblocage sur cette page');
  assert.equal(h.head.children.length,1);assert.equal(h.listeners.size,3);
  let stopped=0;
  h.listeners.get('copy')({target:new Element(),stopImmediatePropagation(){stopped++;}});
  const editor=new Element('input');editor.excluded=true;
  h.listeners.get('copy')({target:editor,stopImmediatePropagation(){stopped++;}});
  assert.equal(stopped,1);
  await h.click('Désactiver le déblocage sur cette page');
  assert.equal(h.head.children.length,0);assert.equal(h.listeners.size,0);
});

test('disabling copy module removes all effects; enabling never activates automatically',async()=>{
  const h=await harness();await h.click('Activer le déblocage sur cette page');
  await h.toggle('Sélection et copie',false);assert.equal(h.section('copy'),undefined);assert.equal(h.listeners.size,0);
  assert.equal(h.head.children.length,0);await h.toggle('Sélection et copie',true);assert.ok(h.section('copy'));
  assert.equal(h.listeners.size,0);assert.equal(h.head.children.length,0);
});

test('copy restoration rejects password and sensitive pages',async()=>{
  for(const password of [true,false]){
    const h=await harness({href:password?'https://example.org/':'https://example.org/payment'});
    if(password)h.nodes.set('input[type="password"]',[new Element('input')]);
    await h.click('Activer le déblocage sur cette page');
    assert.equal(h.listeners.size,0);assert.equal(h.head.children.length,0);assert.match(h.status.message,/sensible/);
  }
});

test('notes persist in GM across reload with no token, network or site storage',async()=>{
  const store=new Map([['wa-core:token',TOKEN]]);let h=await harness({store});
  assert.equal(h.editor().disabled,true);await h.click('Charger la note de cette page');
  h.editor().value='Note privée synthétique';await h.click('Enregistrer la note');
  assert.equal(store.get('wa-core:note:v1:https://example.org/article?q=froid#section'),'Note privée synthétique');
  assert.equal(h.calls.network,0);assert.equal(h.calls.prompts,0);assert.equal(store.get('wa-core:token'),TOKEN);
  h=await harness({store});await h.click('Charger la note de cette page');assert.equal(h.editor().value,'Note privée synthétique');
});

test('notes distinguish query parameters and SPA hash routes',async()=>{
  const store=new Map();
  for(const suffix of ['?id=1#/first','?id=2#/first','?id=1#/second']){
    const h=await harness({store,href:'https://example.org/'+suffix});await h.click('Charger la note de cette page');
    assert.equal(h.editor().value,'');h.editor().value=suffix;await h.click('Enregistrer la note');
  }
  assert.equal([...store.keys()].filter(k=>k.startsWith('wa-core:note:')).length,3);
});

test('a note cannot be accidentally saved against a new SPA location',async()=>{
  const h=await harness();await h.click('Charger la note de cette page');h.editor().value='Brouillon';
  h.location.href='https://example.org/other';await h.click('Enregistrer la note');
  assert.equal(h.calls.writes.length,0);assert.match(h.status.message,/page a changé/);assert.equal(h.editor().value,'Brouillon');
});

test('unsaved notes prevent module removal when confirmation is declined',async()=>{
  const h=await harness();await h.click('Charger la note de cette page');h.editor().value='Brouillon';
  h.behavior.confirm=false;await h.toggle('Notes privées locales',false);
  assert.ok(h.section('notes'));assert.equal(h.editor().value,'Brouillon');assert.equal(h.calls.writes.length,0);
});

test('note erasure requires confirmation and only clears the selected note',async()=>{
  const store=new Map([['wa-core:token',TOKEN]]);const h=await harness({store});
  await h.click('Charger la note de cette page');h.editor().value='Note';await h.click('Enregistrer la note');
  h.behavior.confirm=false;await h.click('Effacer la note');assert.equal(h.editor().value,'Note');
  h.behavior.confirm=true;await h.click('Effacer la note');assert.equal(h.editor().value,'');
  assert.equal(store.get('wa-core:token'),TOKEN);assert.match(h.status.message,/ne peut pas être annulée/);
});

test('failed note write preserves draft and reports failure',async()=>{
  const h=await harness();await h.click('Charger la note de cette page');h.editor().value='Brouillon';
  h.behavior.failWrite=true;await h.click('Enregistrer la note');
  assert.equal(h.status.kind,'error');assert.equal(h.editor().value,'Brouillon');assert.equal(h.calls.writes.length,0);
});

test('module choices persist across pages without touching endpoint or token',async()=>{
  const store=new Map([['wa-core:token',TOKEN],['wa-core:endpoint','https://example.test/api/wa']]);
  let h=await harness({store});await h.toggle('Flux RSS et Atom',false);assert.equal(h.section('feeds'),undefined);
  h=await harness({store,href:'https://another.example/'});assert.equal(h.section('feeds'),undefined);
  assert.equal(h.checkbox('Flux RSS et Atom').checked,false);assert.equal(store.get('wa-core:token'),TOKEN);
  await h.toggle('Flux RSS et Atom',true);assert.ok(h.section('feeds'));
});

test('failed preference write leaves module enabled and active effects unchanged',async()=>{
  const h=await harness();await h.click('Activer le déblocage sur cette page');h.behavior.failWrite=true;
  await h.toggle('Sélection et copie',false);assert.ok(h.section('copy'));assert.equal(h.checkbox('Sélection et copie').checked,true);
  assert.equal(h.listeners.size,3);assert.equal(h.status.kind,'error');
});

test('corrupt module preferences are not overwritten and leave local tools available',async()=>{
  const store=new Map([[PREF,'broken-json']]);const h=await harness({store});
  assert.ok(h.section('toolbox'));assert.equal(h.checkbox('Navigation et liens').disabled,true);
  assert.match(h.root.textContent,/non chargés/);assert.equal(store.get(PREF),'broken-json');assert.equal(h.calls.writes.length,0);
});

test('build output is reproducible and every local module is included once',()=>{
  const {execFileSync}=require('node:child_process');
  execFileSync(process.execPath,[path.join(root,'tools/build-core.cjs'),'--check']);
  const bundle=fs.readFileSync(path.join(root,'scripts/core/wa-core-ios.user.js'),'utf8');
  for(const name of ['Toolbox','Copy','Feeds','Source','Notes']){
    assert.equal(bundle.split(`function create${name}Module()`).length-1,1);
    const moduleSource=fs.readFileSync(path.join(root,`src/core/modules/${name.toLowerCase()}.js`),'utf8');
    assert.ok(bundle.includes(moduleSource),`exact source preserved: ${name}`);
  }
  assert.equal(bundle.includes('/* WA_LOCAL_MODULES */'),false);
  assert.match(bundle,/attachShadow\(\{ mode: 'closed' \}\)/);
});

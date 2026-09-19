(function(){
'use strict';

const KEY = 'saveme:v1';
const PALETTE = [
  {name:'Walnut', hex:'#7A4E2E'},
  {name:'Caramel', hex:'#A5693A'},
  {name:'Ochre', hex:'#8E6A1A'},
  {name:'Olive', hex:'#6B7340'},
  {name:'Sage', hex:'#547563'},
  {name:'Slate', hex:'#56707A'},
  {name:'Plum', hex:'#75536F'},
  {name:'Rose', hex:'#94595A'}
];
const DEFAULTS = {fontSize:28, view:'study', activeFolder:'all', shuffle:false};

const $ = id => document.getElementById(id);
const stage = $('stage');

const ic = p => '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
const ICON = {
  edit: ic('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>'),
  trash: ic('<path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>'),
  plus: ic('<path d="M12 5v14M5 12h14"/>'),
  left: ic('<path d="M15 18l-6-6 6-6"/>'),
  right: ic('<path d="M9 18l6-6-6-6"/>'),
  shuffle: ic('<path d="M16 3h5v5"/><path d="M4 20L21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/>')
};

const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const safeColor = c => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) ? c : PALETTE[0].hex;
const trunc = (s, n) => { s = String(s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '\u2026' : s; };

/* ---------- Storage ---------- */
let freshStart = false;
let storageWarned = false;

function seed(){
  freshStart = true;
  const f = {id:uid(), name:'Getting started', color:PALETTE[1].hex};
  const t = Date.now();
  const rows = [
    ['How do I flip a card?', 'Click it, or press Space.'],
    ['How do I move between cards?', 'Use the arrow buttons, or the left and right arrow keys.'],
    ['How do I pick a specific card?', 'Open All cards and click one, or use the Jump to list while studying.'],
    ['How do I change the text size?', 'Use the Text size slider at the top of the page.'],
    ['Where are my cards saved?', 'In this browser, on this device. Clearing your site data will erase them.']
  ];
  return {
    folders:[f],
    cards: rows.map((r, i) => ({id:uid(), folderId:f.id, front:r[0], back:r[1], created:t + i})),
    settings: Object.assign({}, DEFAULTS)
  };
}

function load(){
  try{
    const raw = localStorage.getItem(KEY);
    if(raw){
      const s = JSON.parse(raw);
      if(s && Array.isArray(s.folders) && Array.isArray(s.cards)){
        const folders = s.folders
          .filter(f => f && typeof f.id === 'string' && typeof f.name === 'string')
          .map(f => ({id:f.id, name:f.name, color:safeColor(f.color)}));
        const ids = new Set(folders.map(f => f.id));
        const cards = s.cards
          .filter(c => c && typeof c.id === 'string' && ids.has(c.folderId) && typeof c.front === 'string' && typeof c.back === 'string')
          .map((c, i) => ({id:c.id, folderId:c.folderId, front:c.front, back:c.back, created:Number(c.created) || i}));
        const st = Object.assign({}, DEFAULTS, s.settings || {});
        st.fontSize = Math.min(44, Math.max(16, Number(st.fontSize) || DEFAULTS.fontSize));
        st.view = st.view === 'grid' ? 'grid' : 'study';
        st.shuffle = !!st.shuffle;
        if(st.activeFolder !== 'all' && !ids.has(st.activeFolder)) st.activeFolder = 'all';
        return {folders, cards, settings:st};
      }
    }
  }catch(e){ /* fall through to a fresh start */ }
  return seed();
}

function save(){
  try{
    localStorage.setItem(KEY, JSON.stringify(state));
  }catch(e){
    if(!storageWarned){ storageWarned = true; toast('Saving is unavailable here, so changes will be lost on reload.'); }
  }
}

/* ---------- State ---------- */
const state = load();
let studyIndex = 0;
let flipped = false;
let shuffleOrder = [];
let query = '';
const revealed = new Set();
let editingCard = null;
let editingFolder = null;
let pendingCard = false;
let pickedColor = PALETTE[0].hex;
let lastFolder = null;

const activeId = () => state.settings.activeFolder;
const folderById = id => state.folders.find(f => f.id === id);
const count = id => id === 'all' ? state.cards.length : state.cards.filter(c => c.folderId === id).length;
const cardsIn = id => (id === 'all' ? state.cards : state.cards.filter(c => c.folderId === id)).slice().sort((a, b) => a.created - b.created);

function reshuffle(){
  const ids = cardsIn(activeId()).map(c => c.id);
  for(let i = ids.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  shuffleOrder = ids;
}

function studyList(){
  const base = cardsIn(activeId());
  if(!state.settings.shuffle) return base;
  const map = new Map(base.map(c => [c.id, c]));
  const ord = shuffleOrder.filter(id => map.has(id));
  base.forEach(c => { if(!ord.includes(c.id)) ord.push(c.id); });
  shuffleOrder = ord;
  return ord.map(id => map.get(id));
}

function gridList(){
  let list = cardsIn(activeId());
  const q = query.trim().toLowerCase();
  if(q) list = list.filter(c => (c.front + ' ' + c.back).toLowerCase().includes(q));
  return list;
}

/* ---------- Rendering ---------- */
function applyFont(){
  const n = state.settings.fontSize;
  document.documentElement.style.setProperty('--card-fs', n + 'px');
  $('size').value = n;
  $('sizeOut').textContent = n + ' px';
}

function renderSidebar(){
  const on = activeId();
  let h = '<li class="folder' + (on === 'all' ? ' on' : '') + '"><button class="fbtn" data-act="pick" data-id="all"' + (on === 'all' ? ' aria-current="true"' : '') + '><span class="dot all"></span><span class="fname">All subjects</span><span class="count">' + state.cards.length + '</span></button></li>';
  state.folders.forEach(f => {
    const isOn = on === f.id;
    h += '<li class="folder' + (isOn ? ' on' : '') + '" style="--folder:' + safeColor(f.color) + '">'
      + '<button class="fbtn" data-act="pick" data-id="' + esc(f.id) + '"' + (isOn ? ' aria-current="true"' : '') + '><span class="dot"></span><span class="fname">' + esc(f.name) + '</span><span class="count">' + count(f.id) + '</span></button>'
      + (isOn ? '<span class="factions"><button class="icon" data-act="edit-folder" data-id="' + esc(f.id) + '" aria-label="Edit ' + esc(f.name) + '" title="Edit subject">' + ICON.edit + '</button><button class="icon" data-act="delete-folder" data-id="' + esc(f.id) + '" aria-label="Delete ' + esc(f.name) + '" title="Delete subject">' + ICON.trash + '</button></span>' : '')
      + '</li>';
  });
  h += '<li class="folder add"><button class="fbtn addbtn" data-act="new-folder">' + ICON.plus + '<span>New subject</span></button></li>';
  $('folders').innerHTML = h;
}

function renderHeader(){
  const id = activeId();
  const f = folderById(id);
  $('viewTitle').innerHTML = f ? '<span class="dot" style="--folder:' + safeColor(f.color) + '"></span><span>' + esc(f.name) + '</span>' : 'All subjects';
  const n = count(id);
  $('viewMeta').textContent = n + (n === 1 ? ' card' : ' cards');
  document.querySelectorAll('[data-act="view"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === state.settings.view)));
  $('gridTools').hidden = state.settings.view !== 'grid';
}

function emptyHTML(){
  if(!state.folders.length){
    return '<div class="empty"><h2>Start with a subject</h2><p>Subjects keep your cards in separate folders, like Biology or History.</p><button class="btn primary" data-act="new-folder">New subject</button></div>';
  }
  const f = folderById(activeId());
  return '<div class="empty"><h2>' + (f ? 'No cards in ' + esc(f.name) + ' yet' : 'No cards yet') + '</h2><p>Add a card with a question on the front and the answer on the back.</p><button class="btn primary" data-act="new-card">New card</button></div>';
}

function renderStudy(){
  const list = studyList();
  if(!list.length){ stage.innerHTML = emptyHTML(); return; }
  if(studyIndex >= list.length) studyIndex = list.length - 1;
  if(studyIndex < 0) studyIndex = 0;
  const c = list[studyIndex];
  const f = folderById(c.folderId);
  const col = safeColor(f && f.color);
  const n = list.length;
  const pct = ((studyIndex + 1) / n) * 100;
  const opts = list.map((x, i) => '<option value="' + i + '"' + (i === studyIndex ? ' selected' : '') + '>' + (i + 1) + '. ' + esc(trunc(x.front, 44)) + '</option>').join('');
  stage.innerHTML =
    '<div class="study" style="--folder:' + col + '">'
    + '<div class="deck">'
    +   '<div class="tab">' + esc(f ? f.name : '') + '</div>'
    +   '<div class="card" role="button" tabindex="0" data-act="flip" aria-label="Card ' + (studyIndex + 1) + ' of ' + n + '. Press to flip between question and answer.">'
    +     '<span class="flipper' + (flipped ? ' is-flipped' : '') + '" id="flipper">'
    +       '<span class="face front" aria-hidden="' + flipped + '"><span class="lab">Question</span><span class="text">' + esc(c.front) + '</span></span>'
    +       '<span class="face back" aria-hidden="' + !flipped + '"><span class="lab">Answer</span><span class="text">' + esc(c.back) + '</span></span>'
    +     '</span>'
    +   '</div>'
    + '</div>'
    + '<div class="nav">'
    +   '<button class="round" data-act="prev" aria-label="Previous card"' + (n < 2 ? ' disabled' : '') + '>' + ICON.left + '</button>'
    +   '<div class="counter"><strong>' + (studyIndex + 1) + '</strong> of ' + n + '</div>'
    +   '<button class="round" data-act="next" aria-label="Next card"' + (n < 2 ? ' disabled' : '') + '>' + ICON.right + '</button>'
    + '</div>'
    + '<div class="bar" aria-hidden="true"><span style="width:' + pct + '%"></span></div>'
    + '<div class="extras">'
    +   '<label class="jump">Jump to <select id="jump">' + opts + '</select></label>'
    +   '<button class="chip" data-act="shuffle" aria-pressed="' + state.settings.shuffle + '">' + ICON.shuffle + 'Shuffle</button>'
    +   '<button class="chip" data-act="edit-card" data-id="' + esc(c.id) + '">' + ICON.edit + 'Edit</button>'
    +   '<button class="chip danger" data-act="delete-card" data-id="' + esc(c.id) + '">' + ICON.trash + 'Delete</button>'
    + '</div>'
    + '<p class="hint">Space flips the card. Left and right arrow keys move between cards.</p>'
    + '</div>';
}

function renderGrid(){
  const list = gridList();
  const ra = $('revealAll');
  if(!list.length){
    ra.disabled = true;
    const q = query.trim();
    stage.innerHTML = q
      ? '<div class="empty"><h2>No matches</h2><p>No card contains \u201c' + esc(q) + '\u201d.</p></div>'
      : emptyHTML();
    return;
  }
  ra.disabled = false;
  ra.textContent = list.every(c => revealed.has(c.id)) ? 'Hide all answers' : 'Show all answers';
  const single = activeId() !== 'all';
  stage.innerHTML = '<div class="grid">' + list.map(c => {
    const f = folderById(c.folderId);
    const col = safeColor(f && f.color);
    const rev = revealed.has(c.id);
    return '<article class="gcard" style="--folder:' + col + '">'
      + (single ? '' : '<span class="gsub"><span class="dot"></span>' + esc(f ? f.name : '') + '</span>')
      + '<button class="gopen" data-act="open-card" data-id="' + esc(c.id) + '" title="Study this card"><span class="t">' + esc(c.front) + '</span></button>'
      + (rev ? '<div class="gans">' + esc(c.back) + '</div>' : '')
      + '<div class="gfoot">'
      +   '<button class="lnk" data-act="reveal" data-id="' + esc(c.id) + '" aria-expanded="' + rev + '">' + (rev ? 'Hide answer' : 'Show answer') + '</button>'
      +   '<span class="spacer"></span>'
      +   '<button class="lnk" data-act="edit-card" data-id="' + esc(c.id) + '">Edit</button>'
      +   '<button class="lnk danger" data-act="delete-card" data-id="' + esc(c.id) + '">Delete</button>'
      + '</div>'
      + '</article>';
  }).join('') + '</div>';
}

const KEEP_FOCUS = ['prev', 'next', 'flip', 'shuffle', 'reveal'];
function renderStage(){
  const a = document.activeElement;
  let act = null, id = null, isJump = false;
  if(a && stage.contains(a)){ act = a.dataset.act || null; id = a.dataset.id || null; isJump = a.id === 'jump'; }
  if(state.settings.view === 'grid') renderGrid(); else renderStudy();
  let el = null;
  if(isJump) el = $('jump');
  else if(act && KEEP_FOCUS.indexOf(act) > -1){
    el = stage.querySelector('[data-act="' + act + '"]' + (id ? '[data-id="' + id + '"]' : ''));
  }
  if(el) el.focus({preventScroll:true});
}

function render(){
  applyFont();
  renderSidebar();
  renderHeader();
  renderStage();
}

/* ---------- Study actions ---------- */
function flip(){
  if(!studyList().length) return;
  flipped = !flipped;
  const fl = $('flipper');
  if(!fl) return;
  fl.classList.toggle('is-flipped', flipped);
  fl.querySelector('.front').setAttribute('aria-hidden', String(flipped));
  fl.querySelector('.back').setAttribute('aria-hidden', String(!flipped));
}

function go(d){
  const n = studyList().length;
  if(n < 2) return;
  studyIndex = (studyIndex + d + n) % n;
  flipped = false;
  renderStage();
}

function setFolder(id){
  if(id !== 'all' && !folderById(id)) return;
  state.settings.activeFolder = id;
  studyIndex = 0;
  flipped = false;
  if(state.settings.shuffle) reshuffle();
  save();
  render();
}

/* ---------- Dialogs ---------- */
function openCard(id){
  if(!state.folders.length){ openFolder(null, true); return; }
  editingCard = id;
  const c = id ? state.cards.find(x => x.id === id) : null;
  $('cardTitle').textContent = c ? 'Edit card' : 'New card';
  $('cFolder').innerHTML = state.folders.map(f => '<option value="' + esc(f.id) + '">' + esc(f.name) + '</option>').join('');
  let pick = state.folders[0].id;
  if(c) pick = c.folderId;
  else if(activeId() !== 'all') pick = activeId();
  else if(lastFolder && folderById(lastFolder)) pick = lastFolder;
  $('cFolder').value = pick;
  $('cFront').value = c ? c.front : '';
  $('cBack').value = c ? c.back : '';
  $('cErr').hidden = true;
  $('saveAnother').hidden = !!c;
  $('cardDlg').showModal();
  $('cFront').focus();
}

function saveCard(another){
  const front = $('cFront').value.trim();
  const back = $('cBack').value.trim();
  const folderId = $('cFolder').value;
  if(!front || !back){ $('cErr').hidden = false; (front ? $('cBack') : $('cFront')).focus(); return; }
  if(editingCard){
    const c = state.cards.find(x => x.id === editingCard);
    if(c){ c.front = front; c.back = back; c.folderId = folderId; }
  }else{
    state.cards.push({id:uid(), folderId, front, back, created:Date.now()});
    lastFolder = folderId;
  }
  save();
  if(another && !editingCard){
    $('cFront').value = '';
    $('cBack').value = '';
    $('cErr').hidden = true;
    $('cFront').focus();
  }else{
    $('cardDlg').close();
  }
  render();
  toast('Card saved');
}

function renderSwatches(){
  $('swatches').innerHTML = PALETTE.map(p =>
    '<button class="sw" role="radio" aria-checked="' + (p.hex === pickedColor) + '" aria-label="' + p.name + '" data-act="color" data-id="' + p.hex + '" style="--c:' + p.hex + '"></button>'
  ).join('');
}

function openFolder(id, fromCard){
  editingFolder = id;
  pendingCard = !!fromCard;
  const f = id ? folderById(id) : null;
  $('fTitle').textContent = f ? 'Edit subject' : 'New subject';
  $('fSave').textContent = f ? 'Save changes' : 'Create subject';
  $('fNote').hidden = !fromCard;
  $('fName').value = f ? f.name : '';
  pickedColor = f ? f.color : PALETTE[state.folders.length % PALETTE.length].hex;
  $('fErr').hidden = true;
  renderSwatches();
  $('folderDlg').showModal();
  $('fName').focus();
}

function saveFolder(){
  const name = $('fName').value.trim();
  if(!name){ $('fErr').hidden = false; $('fName').focus(); return; }
  const wasNew = !editingFolder;
  if(editingFolder){
    const f = folderById(editingFolder);
    if(f){ f.name = name; f.color = pickedColor; }
  }else{
    const f = {id:uid(), name, color:pickedColor};
    state.folders.push(f);
    state.settings.activeFolder = f.id;
    studyIndex = 0;
    flipped = false;
    if(state.settings.shuffle) reshuffle();
  }
  save();
  $('folderDlg').close();
  render();
  toast(wasNew ? 'Subject created' : 'Subject updated');
  if(wasNew && pendingCard) openCard(null);
}

function ask(title, body, okLabel){
  return new Promise(resolve => {
    const d = $('confDlg');
    $('confTitle').textContent = title;
    $('confBody').textContent = body;
    $('confOk').textContent = okLabel;
    d.returnValue = '';
    d.addEventListener('close', () => resolve(d.returnValue === 'ok'), {once:true});
    d.showModal();
  });
}

let toastTimer;
function toast(msg){
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ---------- Events ---------- */
async function act(a, id){
  switch(a){
    case 'pick': setFolder(id); break;
    case 'view':
      state.settings.view = id === 'grid' ? 'grid' : 'study';
      flipped = false;
      save();
      render();
      break;
    case 'new-folder': openFolder(null, false); break;
    case 'edit-folder': openFolder(id, false); break;
    case 'delete-folder': {
      const f = folderById(id);
      if(!f) break;
      const n = count(id);
      const ok = await ask('Delete \u201c' + f.name + '\u201d?',
        n ? 'Its ' + n + (n === 1 ? ' card' : ' cards') + ' will be deleted too. This cannot be undone.' : 'This subject has no cards.',
        'Delete subject');
      if(!ok) break;
      state.folders = state.folders.filter(x => x.id !== id);
      state.cards = state.cards.filter(c => c.folderId !== id);
      if(activeId() === id) state.settings.activeFolder = 'all';
      studyIndex = 0;
      flipped = false;
      if(state.settings.shuffle) reshuffle();
      save();
      render();
      toast('Subject deleted');
      break;
    }
    case 'new-card': openCard(null); break;
    case 'edit-card': openCard(id); break;
    case 'delete-card': {
      const c = state.cards.find(x => x.id === id);
      if(!c) break;
      const ok = await ask('Delete this card?', trunc(c.front, 90), 'Delete card');
      if(!ok) break;
      state.cards = state.cards.filter(x => x.id !== id);
      revealed.delete(id);
      flipped = false;
      save();
      render();
      toast('Card deleted');
      break;
    }
    case 'flip': flip(); break;
    case 'prev': go(-1); break;
    case 'next': go(1); break;
    case 'shuffle':
      state.settings.shuffle = !state.settings.shuffle;
      if(state.settings.shuffle) reshuffle();
      studyIndex = 0;
      flipped = false;
      save();
      renderStage();
      break;
    case 'open-card': {
      state.settings.view = 'study';
      const list = studyList();
      const i = list.findIndex(c => c.id === id);
      studyIndex = Math.max(0, i);
      flipped = false;
      save();
      render();
      window.scrollTo({top:0});
      break;
    }
    case 'reveal':
      if(revealed.has(id)) revealed.delete(id); else revealed.add(id);
      renderStage();
      break;
    case 'reveal-all': {
      const list = gridList();
      if(list.every(c => revealed.has(c.id))) list.forEach(c => revealed.delete(c.id));
      else list.forEach(c => revealed.add(c.id));
      renderStage();
      break;
    }
    case 'save-card': saveCard(false); break;
    case 'save-another': saveCard(true); break;
    case 'save-folder': saveFolder(); break;
    case 'color': pickedColor = id; renderSwatches(); break;
    case 'conf-ok': $('confDlg').close('ok'); break;
  }
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if(el){ act(el.dataset.act, el.dataset.id); return; }
  const cl = e.target.closest('[data-close]');
  if(cl){ const d = cl.closest('dialog'); if(d) d.close(); }
});

stage.addEventListener('change', e => {
  if(e.target && e.target.id === 'jump'){
    studyIndex = Number(e.target.value) || 0;
    flipped = false;
    renderStage();
  }
});

$('size').addEventListener('input', e => {
  state.settings.fontSize = Number(e.target.value);
  applyFont();
  save();
});

$('search').addEventListener('input', e => {
  query = e.target.value;
  if(state.settings.view === 'grid') renderStage();
});

document.addEventListener('keydown', e => {
  if(document.querySelector('dialog[open]')) return;
  if(state.settings.view !== 'study') return;
  if(e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  const tag = t && t.tagName;
  if(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if(e.key === 'ArrowRight'){ e.preventDefault(); go(1); }
  else if(e.key === 'ArrowLeft'){ e.preventDefault(); go(-1); }
  else if((e.key === ' ' || e.key === 'Enter') && tag !== 'BUTTON' && tag !== 'A'){ e.preventDefault(); flip(); }
});

$('cardDlg').addEventListener('keydown', e => {
  if(e.key === 'Enter' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); saveCard(false); }
});
$('fName').addEventListener('keydown', e => {
  if(e.key === 'Enter'){ e.preventDefault(); saveFolder(); }
});

(function(){
  const d = $('confDlg');
  let down = false;
  d.addEventListener('mousedown', e => { down = e.target === d; });
  d.addEventListener('click', e => { if(e.target === d && down) d.close(); });
})();

/* ---------- Start ---------- */
$('newCard').innerHTML = ICON.plus + '<span>New card</span>';
if(state.settings.shuffle) reshuffle();
render();
if(freshStart) save();
})();

// Pregnancy Tracker for SillyTavern (roleplay use). Tracks an in-story pregnancy per chat.
(() => {
  const KEY = 'pregnancyTracker';
  const C = () => SillyTavern.getContext();
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- reference data (approximate, general knowledge) ---------- */
  const FRUIT = 'poppy seed,sesame seed,lentil,blueberry,raspberry,cherry,strawberry,fig,lime,lemon,peach,apple,avocado,pear,bell pepper,mango,banana,carrot,papaya,grapefruit,corn cob,rutabaga,scallion,cauliflower,eggplant,butternut squash,cabbage,coconut,jicama,pineapple,cantaloupe,honeydew melon,romaine lettuce,swiss chard,leek,mini watermelon,pumpkin'.split(',');
  const EMO = { 'poppy seed': '🌱', blueberry: '🫐', cherry: '🍒', strawberry: '🍓', lemon: '🍋', lime: '🍋', peach: '🍑', apple: '🍎', avocado: '🥑', pear: '🍐', 'bell pepper': '🫑', mango: '🥭', banana: '🍌', carrot: '🥕', 'corn cob': '🌽', cauliflower: '🥦', eggplant: '🍆', coconut: '🥥', pineapple: '🍍', cantaloupe: '🍈', 'honeydew melon': '🍈', 'romaine lettuce': '🥬', 'mini watermelon': '🍉', pumpkin: '🎃' };
  const ANCH = [[4, 0.2, 0], [8, 1.6, 1], [12, 5.4, 14], [16, 11.6, 100], [20, 25, 300], [24, 30, 600], [28, 37, 1000], [32, 42, 1700], [36, 47, 2600], [40, 51, 3400]];
  const DEV = [[3, 'Conception window. There is no baby yet; the cycle is being counted from here.'], [5, 'Implantation. The neural tube starts forming and a test can turn positive.'], [8, 'The heartbeat begins. Limb buds and facial features start to form.'], [12, 'All major organs are formed. Fingers and toes separate and reflexes begin.'], [16, 'Facial expressions, fine hair and a growing skeleton. Sex may be visible on a scan.'], [20, 'Can hear sounds. First flutters may be felt. Anatomy scan time.'], [24, 'Regular movement, lungs developing. Close to the viability milestone.'], [28, 'Eyes open, sleep cycles, responds to voices and light.'], [32, 'Rapid brain growth and fat gain. Kicks are strong and clear.'], [36, 'Lungs maturing. Usually head-down and dropping lower.'], [99, 'Full term. Ready to arrive any day.']];
  const SYM = {
    1: ['Nausea and food aversions', 'Tiredness and sleepiness', 'Tender breasts', 'Frequent urination', 'Mood swings', 'Heightened sense of smell'],
    2: ['More energy', 'Growing bump', 'Round ligament aches', 'Heartburn', 'Stretching skin and itch', 'First kicks and flutters'],
    3: ['Backache and heavy belly', 'Braxton Hicks practice contractions', 'Swollen feet and ankles', 'Trouble sleeping', 'Shortness of breath', 'Nesting urges']
  };
  const MILE = [[6, 'Heartbeat can be detected'], [8, 'First prenatal visit'], [12, 'End of first trimester, first screening scan'], [16, 'Sex may be visible on a scan'], [18, 'First kicks may be felt (weeks 18 to 25)'], [20, 'Halfway point, anatomy scan'], [24, 'Viability milestone'], [28, 'Third trimester begins, glucose test'], [32, 'Visits every 2 weeks'], [36, 'Weekly visits, baby may turn head-down'], [37, 'Early term'], [39, 'Full term']];
  const APPT = [8, 12, 16, 20, 24, 28, 30, 32, 34, 36, 37, 38, 39, 40];
  const TERM = { 1: 40, 2: 37, 3: 35 };

  /* ---------- state (stored in the chat so each chat has its own) ---------- */
  const newT = n => ({ name: n || '', day: 0, babies: 1, storyDate: '', inject: true, kicks: 0, weights: [], notes: [], done: {} });
  function store() {
    const m = C().chatMetadata;
    if (!m[KEY]) m[KEY] = { list: [newT(C().name2 || '')], sel: 0 };
    return m[KEY];
  }
  const cur = () => { const s = store(); return s.list[Math.min(s.sel, s.list.length - 1)]; };
  const persist = () => { const c = C(); (c.saveMetadata || c.saveMetadataDebounced)?.call(c); applyPrompt(); };

  /* ---------- maths ---------- */
  function info(t) {
    const d = Math.max(0, t.day), w = Math.floor(d / 7), r = d % 7, termW = TERM[t.babies] || 40, term = termW * 7;
    const wk = Math.max(1, w + 1);
    let len = 0, wt = 0;
    if (w >= 4) {
      const a = ANCH.filter(x => x[0] <= w).pop(), b = ANCH.find(x => x[0] > w) || a;
      const f = b[0] === a[0] ? 0 : (w + r / 7 - a[0]) / (b[0] - a[0]);
      len = a[1] + (b[1] - a[1]) * f; wt = a[2] + (b[2] - a[2]) * f;
    }
    const fruit = w < 4 ? '' : FRUIT[Math.min(w, 40) - 4];
    return { d, w, r, termW, term, left: term - d, pct: Math.min(100, d / term * 100), month: Math.min(10, Math.floor(d / 30.4) + 1), tri: w < 13 ? 1 : w < 27 ? 2 : 3, len, wt, fruit, wk };
  }
  const fmtW = g => g < 1000 ? Math.round(g) + ' g' : (g / 1000).toFixed(2) + ' kg';
  const belly = w => w < 12 ? 'No visible bump yet' : w < 16 ? 'Slight fullness' : w < 20 ? 'A small bump is starting to show' : w < 28 ? 'A clear, round bump' : w < 36 ? 'A big bump, belly button may pop out' : 'Very large, baby has dropped low';
  const dev = w => DEV.find(x => w <= x[0])[1];
  const addDays = (iso, n) => { const x = new Date(iso + 'T00:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const prettyDate = iso => new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  function advance(t, n) { t.day = Math.max(0, Math.min(330, t.day + n)); if (t.storyDate) t.storyDate = addDays(t.storyDate, n); }

  /* ---------- hidden note for the AI ---------- */
  function applyPrompt() {
    const c = C(), s = store();
    const lines = s.list.filter(t => t.inject && t.name && t.day > 0).map(t => {
      const i = info(t);
      const due = i.left > 0 ? `due in about ${i.left} days` : `${-i.left} days past the due date`;
      return `${t.name} is ${i.w} weeks and ${i.r} days pregnant (month ${i.month}, trimester ${i.tri})${t.babies > 1 ? ` with ${t.babies === 2 ? 'twins' : 'triplets'}` : ''}, ${due}. ${belly(i.w)}.${i.fruit ? ` The baby is about the size of a ${i.fruit}.` : ''}`;
    });
    c.setExtensionPrompt?.('pregnancy_tracker', lines.length ? `[Pregnancy status: ${lines.join(' ')} Reflect realistic symptoms, energy, appetite and body changes for this stage naturally in the roleplay, without overdoing it.]` : '', 1, 2);
  }

  /* ---------- UI ---------- */
  const st = document.createElement('style');
  st.textContent = `
#pt_modal{position:fixed;inset:0;background:#000a;z-index:99999;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:16px 8px}
.pt{width:100%;max-width:520px;background:var(--SmartThemeBlurTintColor,#1e1b2e);color:var(--SmartThemeBodyColor,#eee);border:1px solid var(--SmartThemeBorderColor,#4a4560);border-radius:14px;overflow:hidden;font-size:14px;line-height:1.45}
.pt *{box-sizing:border-box}
.pt-h{background:linear-gradient(135deg,#ff9ec4,#c58bff);color:#2b1030;padding:12px 14px;display:flex;justify-content:space-between;align-items:center}
.pt-h b{font-size:16px}
.pt-b{padding:12px 14px;display:grid;gap:12px}
.pt-card{background:#ffffff10;border:1px solid #ffffff20;border-radius:10px;padding:10px}
.pt-card h4{margin:0 0 6px;font-size:13px;opacity:.85}
.pt-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.pt button{cursor:pointer;border:0;border-radius:8px;padding:5px 10px;background:#ff8fb8;color:#2b1030;font-weight:700}
.pt button.g{background:#ffffff20;color:inherit}
.pt input[type=text],.pt input[type=number],.pt input[type=date],.pt select{background:#0004;color:inherit;border:1px solid #ffffff30;border-radius:6px;padding:4px 6px;max-width:100%}
.pt input[type=number]{width:64px}
.pt-ring{display:flex;gap:12px;align-items:center}
.pt-big{font-size:22px;font-weight:700}
.pt-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.pt-bar{height:10px;background:#ffffff25;border-radius:6px;position:relative}
.pt-bar i{position:absolute;left:0;top:0;bottom:0;border-radius:6px;background:linear-gradient(90deg,#ff9ec4,#c58bff)}
.pt-tl{position:relative;height:34px;margin-top:6px}
.pt-tl s{position:absolute;top:0;width:2px;height:10px;background:#fff6}
.pt-tl em{position:absolute;top:12px;font-size:10px;font-style:normal;opacity:.7;transform:translateX(-50%)}
.pt ul{margin:0;padding-left:18px}
.pt-chip{padding:2px 8px;border-radius:10px;background:#ffffff18;cursor:pointer;font-size:12px}
.pt-chip.on{background:#ff8fb8;color:#2b1030}
.pt-muted{opacity:.65;font-size:12px}`;
  document.head.appendChild(st);

  let modal = null;
  function open() { if (!modal) { modal = document.createElement('div'); modal.id = 'pt_modal'; document.body.appendChild(modal); bind(); } modal.style.display = 'flex'; draw(); }
  const close = () => { if (modal) modal.style.display = 'none'; };

  function draw() {
    const s = store(), t = cur(), i = info(t);
    const due = t.storyDate ? prettyDate(addDays(t.storyDate, i.left)) : '';
    const ringC = 2 * Math.PI * 34;
    const tabs = s.list.map((x, n) => `<span class="pt-chip ${n === s.sel ? 'on' : ''}" data-a="sel" data-n="${n}">${esc(x.name || 'Person ' + (n + 1))}</span>`).join('') + '<span class="pt-chip" data-a="add">+ add</span>';
    const tl = [0, 13, 27, i.termW].map(w => `<s style="left:${w / i.termW * 100}%"></s><em style="left:${w / i.termW * 100}%">${w}w</em>`).join('');
    const nextM = MILE.filter(m => m[0] * 7 > i.d).slice(0, 3);
    const appts = APPT.filter(w => w <= i.termW).map(w => `<span class="pt-chip ${t.done[w] ? 'on' : ''}" data-a="appt" data-n="${w}" title="Tap to mark done">Wk ${w}${w * 7 <= i.d && !t.done[w] ? ' ·' : ''}</span>`).join('');
    modal.innerHTML = `<div class="pt">
<div class="pt-h"><b>🤰 Pregnancy Tracker</b><span class="pt-row"><button data-a="post" title="Post a status card into the chat">Post to chat</button><button class="g" data-a="close" style="color:#2b1030">✕</button></span></div>
<div class="pt-b">
<div class="pt-row">${tabs}</div>
<div class="pt-card"><div class="pt-ring">
<svg width="84" height="84" viewBox="0 0 84 84"><circle cx="42" cy="42" r="34" fill="none" stroke="#ffffff25" stroke-width="8"/><circle cx="42" cy="42" r="34" fill="none" stroke="#ff8fb8" stroke-width="8" stroke-linecap="round" stroke-dasharray="${ringC * i.pct / 100} ${ringC}" transform="rotate(-90 42 42)"/><text x="42" y="47" text-anchor="middle" fill="currentColor" font-size="16" font-weight="700">${Math.round(i.pct)}%</text></svg>
<div><div class="pt-big">Week ${i.w} + ${i.r}d</div><div>Day ${i.d} · Month ${i.month} · Trimester ${i.tri}</div><div class="pt-muted">${i.left > 0 ? `${i.left} days to go (${Math.floor(i.left / 7)}w ${i.left % 7}d)` : `${-i.left} days past term`}${due ? ` · due ${due}` : ''}</div></div></div>
<div class="pt-tl"><div class="pt-bar"><i style="width:${i.pct}%"></i></div>${tl}</div></div>

<div class="pt-card"><h4>Name, time and settings</h4><div class="pt-row">
<input type="text" data-f="name" value="${esc(t.name)}" placeholder="Name" style="width:130px">
<select data-f="babies">${[1, 2, 3].map(n => `<option value="${n}" ${t.babies === n ? 'selected' : ''}>${['', 'Single', 'Twins', 'Triplets'][n]}</option>`).join('')}</select>
<label class="pt-muted">Story date <input type="date" data-f="storyDate" value="${esc(t.storyDate)}"></label></div>
<div class="pt-row" style="margin-top:8px"><button class="g" data-a="d" data-n="-1">−1 day</button><button data-a="d" data-n="1">+1 day</button><button data-a="d" data-n="7">+1 week</button><button data-a="d" data-n="30">+1 month</button>
<span class="pt-muted">Set:</span><input type="number" id="pt_w" min="0" max="45" value="${i.w}"> w <input type="number" id="pt_dd" min="0" max="6" value="${i.r}"> d <button class="g" data-a="set">Go</button></div>
<label class="pt-row" style="margin-top:8px"><input type="checkbox" data-f="inject" ${t.inject ? 'checked' : ''}> Tell the AI about this stage (hidden note in the prompt)</label></div>

<div class="pt-grid">
<div class="pt-card"><h4>Baby this week</h4><div class="pt-big">${i.fruit ? (EMO[i.fruit] || '🍼') + ' ' + esc(i.fruit) : '🧬 Not yet'}</div><div class="pt-muted">${i.len ? `About ${i.len.toFixed(1)} cm · ${fmtW(i.wt)}` : 'Too early to measure'}</div></div>
<div class="pt-card"><h4>Body</h4><div>${belly(i.w)}</div></div></div>
<div class="pt-card"><h4>What is happening</h4>${dev(i.w)}</div>
<div class="pt-card"><h4>Common now (trimester ${i.tri})</h4><ul>${SYM[i.tri].map(x => `<li>${x}</li>`).join('')}</ul></div>
<div class="pt-card"><h4>Coming up</h4><ul>${nextM.length ? nextM.map(m => `<li>Week ${m[0]}: ${m[1]} <span class="pt-muted">(in ${m[0] * 7 - i.d} days)</span></li>`).join('') : '<li>You have reached the final stretch.</li>'}</ul></div>
<div class="pt-card"><h4>Check-ups <span class="pt-muted">tap to mark done</span></h4><div class="pt-row">${appts}</div></div>

<div class="pt-card"><h4>Kick counter</h4><div class="pt-row"><span class="pt-big">${t.kicks}</span><button data-a="kick">+1 kick</button><button class="g" data-a="kickreset">Reset</button></div></div>
<div class="pt-card"><h4>Weight log (kg)</h4><div class="pt-row"><input type="number" step="0.1" id="pt_wt" style="width:80px"><button data-a="wt">Add</button></div>
<div class="pt-muted">${t.weights.slice(-5).map(x => `Wk ${x.w}: ${x.v} kg`).join(' · ') || 'No entries yet'}</div></div>
<div class="pt-card"><h4>Notes and mood</h4><div class="pt-row"><input type="text" id="pt_note" placeholder="e.g. craving pickles, mood swings" style="flex:1;min-width:150px"><button data-a="note">Add</button></div>
<ul class="pt-muted">${t.notes.slice(-5).reverse().map(x => `<li>Wk ${x.w}+${x.r}: ${esc(x.t)}</li>`).join('')}</ul></div>
<div class="pt-row"><button class="g" data-a="del">Remove this person</button><span class="pt-muted">General information only, for roleplay. Sizes are approximate.</span></div>
</div></div>`;
  }

  function bind() {
    modal.addEventListener('click', e => {
      if (e.target === modal) return close();
      const a = e.target.closest('[data-a]'); if (!a) return;
      const act = a.dataset.a, n = +a.dataset.n, s = store(), t = cur(), i = info(t);
      if (act === 'close') return close();
      if (act === 'sel') s.sel = n;
      else if (act === 'add') { s.list.push(newT()); s.sel = s.list.length - 1; }
      else if (act === 'del') { if (s.list.length > 1) { s.list.splice(s.sel, 1); s.sel = 0; } else s.list[0] = newT(); }
      else if (act === 'd') advance(t, n);
      else if (act === 'set') t.day = Math.max(0, (+modal.querySelector('#pt_w').value || 0) * 7 + (+modal.querySelector('#pt_dd').value || 0));
      else if (act === 'appt') t.done[n] = !t.done[n];
      else if (act === 'kick') t.kicks++;
      else if (act === 'kickreset') t.kicks = 0;
      else if (act === 'wt') { const v = modal.querySelector('#pt_wt').value; if (v) t.weights.push({ w: i.w, v }); }
      else if (act === 'note') { const v = modal.querySelector('#pt_note').value.trim(); if (v) t.notes.push({ w: i.w, r: i.r, t: v }); }
      else if (act === 'post') return post(t);
      persist(); draw();
    });
    modal.addEventListener('change', e => {
      const f = e.target.dataset.f; if (!f) return;
      const t = cur();
      t[f] = f === 'babies' ? +e.target.value : f === 'inject' ? e.target.checked : e.target.value;
      persist(); draw();
    });
  }

  function post(t) {
    const c = C(), i = info(t);
    const due = t.storyDate ? ` · due ${prettyDate(addDays(t.storyDate, i.left))}` : '';
    const html = `<div style="border:1px solid #ff8fb8;border-radius:12px;padding:10px;max-width:420px;background:linear-gradient(135deg,#ffe3ee,#e9d6ff);color:#3a1a2e"><b>🤰 ${esc(t.name || 'Pregnancy')}</b><br>Week ${i.w} + ${i.r}d · Month ${i.month} · Trimester ${i.tri}<br>${i.fruit ? (EMO[i.fruit] || '🍼') + ' Baby is about the size of a ' + esc(i.fruit) + ' (' + i.len.toFixed(1) + ' cm, ' + fmtW(i.wt) + ')<br>' : ''}${i.left > 0 ? i.left + ' days to go' : -i.left + ' days past term'}${due}<div style="height:8px;background:#fff9;border-radius:6px;margin-top:6px"><div style="width:${i.pct.toFixed(0)}%;height:8px;background:#ff6fa5;border-radius:6px"></div></div></div>`;
    try {
      const msg = { name: 'Pregnancy Tracker', is_user: false, is_system: true, send_date: Date.now(), mes: html, extra: {} };
      c.chat.push(msg); c.addOneMessage(msg); c.saveChat?.();
      close();
    } catch (e) { console.error('[PregnancyTracker]', e); window.toastr?.error('Could not post to chat.', 'Pregnancy Tracker'); }
  }

  /* ---------- wand menu entry ---------- */
  function wand() {
    const menu = document.getElementById('extensionsMenu');
    if (!menu) return setTimeout(wand, 1000);
    if (document.getElementById('pt_wand')) return;
    menu.insertAdjacentHTML('beforeend', '<div id="pt_wand" class="list-group-item flex-container flexGap5 interactable" tabindex="0" role="listitem"><div class="extensionsMenuExtensionButton fa-solid fa-baby"></div><span>Pregnancy Tracker</span></div>');
    document.getElementById('pt_wand').addEventListener('click', () => { menu.style.display = 'none'; open(); });
  }
  const c0 = C();
  c0.eventSource.on(c0.event_types.CHAT_CHANGED, () => setTimeout(applyPrompt, 300));
  wand();
  setTimeout(applyPrompt, 800);
  setTimeout(() => window.toastr?.success('Pregnancy Tracker is connected. Find it in the wand menu.', 'Pregnancy Tracker'), 1500);
})();

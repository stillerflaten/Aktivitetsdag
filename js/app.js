// Brukergrensesnittet: tegner sidene og reagerer på det brukeren gjør.
(function () {
  const { esc } = Print;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // ---------- Hjelpefunksjoner ----------

  // Kort melding nederst på skjermen. Med «undo» får meldingen en Angre-knapp.
  function toast(msg, undo) {
    const t = $('#toast');
    t.innerHTML = `<span>${esc(msg)}</span>` + (undo ? '<button type="button" class="toast-undo">Angre</button>' : '');
    t.classList.toggle('has-undo', !!undo);
    toast.undo = undo || null;
    toast.last = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.classList.remove('show'); toast.undo = null; }, Math.max(undo ? 7000 : 3500, msg.length * 60));
  }

  // Beskjeder om resultatet som skal bli stående over oppsettet (ikke bare vises et øyeblikk nederst).
  // De lagres ikke, og forsvinner når siden lastes på nytt eller resultatet lages på nytt.
  let notes = {};
  function note(page, msg, done) {
    const rest = msg.startsWith(done) ? msg.slice(done.length).trim() : msg;
    notes[page] = rest;
    toast(!rest ? done : msg.startsWith(done) ? done + ' Se merknaden over resultatet.' : 'Se merknaden over resultatet.');
  }
  function renderNotes() {
    for (const page of ['kamp', 'dommer', 'oppgaver']) $('#note-' + page).textContent = notes[page] || '';
  }

  // ---------- Angre ----------
  // Før noe slettes eller lages på nytt, tas det vare på en kopi av alt. «Angre» legger kopien tilbake.

  function offerUndo(before, msg) {
    if (JSON.stringify(S) === before) return;
    toast(msg, () => {
      Store.replace(JSON.parse(before));
      $('#team-repeat-info').textContent = '';
      notes = {};
      renderAll();
      toast('Angret.');
    });
  }

  // Meldingen som vises med Angre når handlingen ikke selv har sagt noe.
  const undoMsg = {
    'del-player': (i) => `${(S.players[i] || {}).name || 'Spilleren'} er fjernet.`,
    'del-guest': (i) => `${(S.schedule.guests[i] || {}).name || 'Laget'} er fjernet.`,
    'del-bane': (i) => `${(S.schedule.banes[i] || {}).name || 'Banen'} er fjernet.`,
    'del-slot': (i) => ((S.schedule.slots[i] || {}).type === 'break' ? 'Pausen er fjernet.' : 'Kamprunden er fjernet.'),
    'del-task': (i) => `${(S.tasks[i] || {}).name || 'Oppgaven'} er fjernet.`,
    'del-ref': (i) => `${(S.refs.people[i] || {}).name || 'Dommeren'} er fjernet.`,
    'btn-make-teams': () => 'Ny laginndeling laget.',
    'btn-make-schedule': () => 'Nytt kampoppsett laget.',
    'btn-make-refs': () => 'Nytt dommeroppsett laget.',
    'btn-fill-tasks': () => 'Oppgaver fordelt.',
    'btn-clear-tasks': () => 'Fordelingen er tømt.',
    'btn-gen-times': () => 'Tidspunktene er laget på nytt.'
  };

  // Ruller til resultatet etter «Lag …», men bare hvis det ikke allerede synes på skjermen.
  function revealResult(sel) {
    const el = $(sel);
    if (!el) return;
    const card = el.closest('.card') || el;
    const r = card.getBoundingClientRect();
    if (r.top >= 0 && r.top < innerHeight * 0.6) return;
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    card.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
  }

  function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }

  function setPath(obj, path, value) {
    const keys = path.split('.');
    let o = obj;
    keys.slice(0, -1).forEach((k, i) => {
      if (o[k] == null || typeof o[k] !== 'object') o[k] = /^\d+$/.test(keys[i + 1]) ? [] : {};
      o = o[k];
    });
    o[keys[keys.length - 1]] = value;
  }

  function readValue(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.dataset.type === 'number') return el.value === '' ? 0 : Number(el.value);
    return el.value;
  }

  const toMin = (t) => {
    const m = /^(\d{1,2})[:.](\d{2})/.exec(t || '');
    return m ? m[1] * 60 + +m[2] : null;
  };
  const fromMin = (n) => `${String(Math.floor(n / 60) % 24).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

  function options(list, selected, blank = '') {
    return `<option value="">${esc(blank)}</option>` +
      list.map((o) => `<option value="${esc(o.id)}"${o.id === selected ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
  }

  // ---------- Avledede data ----------

  const presentPlayers = () => S.players.filter((p) => p.present && p.name.trim());

  // Klassen til en spiller: egen klasse hvis satt, ellers årsklassen for egne lag.
  const playerClass = (p) => (p.klasse || '').trim() || (S.event.ageGroup || '').trim();
  const byClass = (a, b) => a.localeCompare(b, 'nb', { numeric: true });

  // Når spillerne er i flere klasser (f.eks. micro med U6, U7 og U8), lages lagene klasse for klasse.
  // Gir null når alle er i samme klasse.
  function classPlan() {
    const groups = {};
    for (const p of presentPlayers()) (groups[playerClass(p)] = groups[playerClass(p)] || []).push(p.id);
    const keys = Object.keys(groups).sort(byClass);
    if (keys.length < 2) return null;
    return keys.map((klasse) => {
      const n = groups[klasse].length;
      const k = S.teams.mode === 'count'
        ? Math.max(1, Math.min(n, S.teams.count || 1))
        : Math.max(1, Math.ceil(n / Math.max(1, S.teams.perTeam || 1)));
      return { klasse, ids: groups[klasse], k };
    });
  }

  function teamCount() {
    const plan = classPlan();
    if (plan) return plan.reduce((s, c) => s + c.k, 0);
    const n = presentPlayers().length;
    if (S.teams.mode === 'count') return Math.max(1, S.teams.count || 1);
    return Math.max(1, Math.ceil(n / Math.max(1, S.teams.perTeam || 1)));
  }

  // Klassen til hvert lag, i samme rekkefølge som lagnavnene.
  function teamClasses() {
    const plan = classPlan();
    if (!plan) return [];
    return plan.flatMap((c) => Array(c.k).fill(c.klasse));
  }

  function ensureTeamNames(k) {
    while (S.teams.names.length < k) {
      const i = S.teams.names.length;
      S.teams.names.push({
        id: Store.uid('lag'),
        name: Store.TEAM_NAMES[i] || 'Lag ' + (i + 1),
        color: Store.COLORS[i % Store.COLORS.length],
        coaches: ''
      });
    }
  }

  function currentTeams() {
    const k = teamCount();
    ensureTeamNames(k);
    const classes = teamClasses();
    const teams = S.teams.names.slice(0, k).map((t, i) => ({ ...t, klasse: classes[i] || (S.event.ageGroup || '').trim(), players: [] }));
    const byId = Object.fromEntries(teams.map((t) => [t.id, t]));
    for (const p of presentPlayers()) {
      const t = byId[S.teams.assignment[p.id]];
      if (t) t.players.push(p);
    }
    return teams;
  }

  function teamLabel(name, club, klasse) {
    let label = (name || '').trim();
    if (club && !label.toLowerCase().includes(club.toLowerCase())) label = club + ' ' + label;
    if (klasse && !label.toLowerCase().includes(klasse.toLowerCase())) label = label + ' ' + klasse;
    return label.trim();
  }

  // Kort navn i kampoppsettet: klubben tas bare med når lagnavnet ikke allerede sier hvilken klubb det er.
  // «Sjøvik» fra Sjøvik HK blir «Sjøvik HK», og «Nordby 1» fra Nordby IL blir stående som det er.
  function shortLabel(name, club) {
    const n = (name || '').trim();
    const c = (club || '').trim();
    if (!c) return n;
    const lc = c.toLowerCase(), ln = n.toLowerCase();
    if (lc.includes(ln)) return c;
    if (ln.includes(lc) || ln.split(/\s+/)[0] === lc.split(/\s+/)[0]) return n;
    return c + ' ' + n;
  }

  // Alle lag som er med i kampoppsettet, både egne og besøkende.
  function teamMap() {
    const list = [];
    if (S.schedule.includeOwn && presentPlayers().length) {
      for (const t of currentTeams()) list.push({ id: t.id, name: t.name, club: S.event.club, klasse: t.klasse, color: t.color });
    }
    const colors = guestColors();
    for (const g of S.schedule.guests) {
      if (!g.name.trim()) continue;
      list.push({ id: g.id, name: g.name, club: g.club, klasse: g.klasse, color: colors[g.id] });
    }
    // Klassen vises bare når lagene er fra ulike klasser (lag uten klasse teller ikke). Blir to navn like, brukes det fulle navnet.
    const oneClass = new Set(list.map((t) => (t.klasse || '').trim().toLowerCase()).filter(Boolean)).size <= 1;
    const short = list.map((t) => {
      const l = shortLabel(t.name, t.club);
      return oneClass || !t.klasse || l.toLowerCase().includes(t.klasse.toLowerCase()) ? l : l + ' ' + t.klasse;
    });
    const dup = (l) => short.filter((x) => x.toLowerCase() === l.toLowerCase()).length > 1;
    const map = {};
    list.forEach((t, i) => {
      map[t.id] = { id: t.id, label: dup(short[i]) ? teamLabel(t.name, t.club, t.klasse) : short[i], club: t.club, klasse: t.klasse, color: t.color };
    });
    return map;
  }

  // Besøkende lag uten egen farge får den første ledige fra paletten, så ingen lag deler farge
  // så lenge paletten rekker. Egne lag og lag med valgt farge beholder sin.
  function guestColors() {
    const used = new Set();
    if (S.schedule.includeOwn) S.teams.names.slice(0, teamCount()).forEach((t) => used.add((t.color || '').toLowerCase()));
    S.schedule.guests.forEach((g) => g.color && used.add(g.color.toLowerCase()));
    // Den mørke skiferfargen hoppes over: den er sidens egen farge og forsvinner i mørk modus.
    const free = Store.COLORS.filter((c) => !used.has(c.toLowerCase()) && c !== '#2F4858');
    const out = {};
    let n = 0;
    for (const g of S.schedule.guests) {
      if (g.color) { out[g.id] = g.color; continue; }
      out[g.id] = free[n] || Store.COLORS[n % Store.COLORS.length];
      n++;
    }
    return out;
  }

  // Lagfargen som en svak flate med en tydelig stripe til venstre, så den ikke blir glorete.
  function teamStyle(t) {
    return t && t.color ? ` style="--tc:${esc(t.color)};--tc-soft:${Print.tint(t.color, 0.26)}"` : '';
  }

  // Grupper som skal ha like mange kamper: puljene, og med «bare egen klasse» hver klasse i puljen.
  function fairGroups(teams) {
    const pul = Algo.puljer(teams, S.schedule.banes);
    if (!S.schedule.sameClass) return pul;
    return pul.flatMap((p) => {
      const by = {};
      for (const t of p.teams) (by[(t.klasse || '').trim().toLowerCase()] = by[(t.klasse || '').trim().toLowerCase()] || []).push(t);
      return Object.values(by).map((ts) => ({ ...p, label: ts[0].klasse || p.label, teams: ts }));
    });
  }

  function matchSlots() {
    return S.schedule.slots.filter((s) => s.type === 'match');
  }

  function matchCounts() {
    const c = {};
    for (const s of matchSlots()) {
      for (const m of Object.values(S.schedule.matches[s.id] || {})) {
        for (const id of m || []) if (id) c[id] = (c[id] || 0) + 1;
      }
    }
    return c;
  }

  function refCounts() {
    const c = {};
    for (const s of matchSlots()) {
      const row = S.refs.assignment[s.id] || {};
      for (const b of S.schedule.banes) {
        if (!(S.schedule.matches[s.id] || {})[b.id]) continue;
        for (const id of row[b.id] || []) if (id) c[id] = (c[id] || 0) + 1;
      }
    }
    return c;
  }

  function familyMap() {
    const out = {};
    for (const p of S.players) {
      if (!p.name.trim()) continue;
      const first = p.name.trim().split(/\s+/)[0];
      out[p.id] = p.parents && p.parents.trim() ? `${p.parents.trim()} (${first})` : `Foresatte til ${p.name.trim()}`;
    }
    return out;
  }

  // Familiene som kan få oppgaver: alle, eller bare de med barn som er med i dag.
  function taskFamilyMap() {
    const fam = familyMap();
    if (!S.tasksOnlyPresent) return fam;
    const present = new Set(presentPlayers().map((p) => p.id));
    return Object.fromEntries(Object.entries(fam).filter(([id]) => present.has(id)));
  }

  function historyTaskCounts() {
    const c = {};
    for (const h of S.history) for (const id of h.taskFamilies || []) c[id] = (c[id] || 0) + 1;
    return c;
  }

  // ---------- Tegning av sidene ----------

  function renderSport() {
    const found = Store.SPORTS.find(([name]) => name === S.event.sport);
    $('#sport-icon').textContent = found ? found[1] : '';
    // Banestørrelsene gjelder ishockey, så de skjules når en annen idrett er valgt.
    $('#rinks').hidden = !!S.event.sport && S.event.sport !== 'Ishockey';
  }

  function renderBinds() {
    renderSport();
    for (const el of $$('[data-bind]')) {
      if (el === document.activeElement) continue;
      const v = getPath(S, el.dataset.bind);
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = v == null ? '' : v;
    }
  }

  function renderHistory() {
    const el = $('#history-list');
    if (!S.history.length) {
      el.innerHTML = '<p class="muted">Ingen dager i historikken ennå.</p>';
      return;
    }
    el.innerHTML = '<h3>Historikk</h3><ul class="history">' + S.history.map((h, i) =>
      `<li><span>${esc(Print.shortDate(h.date))} – ${esc(h.title || 'Aktivitetsdag')} (${(h.groups || []).length} lag)</span>
       <button class="icon" data-action="del-history" data-i="${i}" title="Slett">✕</button></li>`).join('') + '</ul>';
  }

  function renderPlayers() {
    $('#player-count').textContent = `${presentPlayers().length} med / ${S.players.length}`;
    $('#player-table tbody').innerHTML = S.players.map((p, i) => `
      <tr class="${p.present ? '' : 'absent'}">
        <td><input type="checkbox" data-path="players.${i}.present"${p.present ? ' checked' : ''}></td>
        <td><input data-path="players.${i}.name" value="${esc(p.name)}" aria-label="Navn"></td>
        <td data-label="Klasse"><input data-path="players.${i}.klasse" value="${esc(p.klasse || '')}" placeholder="${esc(S.event.ageGroup || '')}" list="class-list" class="short" aria-label="Klasse"></td>
        <td data-label="Foresatte"><input data-path="players.${i}.parents" value="${esc(p.parents || '')}"${i === 0 ? ' placeholder="Navn på foresatte"' : ''} aria-label="Foresatte"></td>
        <td><button class="icon" data-action="del-player" data-i="${i}" title="Fjern" aria-label="Fjern ${esc(p.name)}">✕</button></td>
      </tr>`).join('') || '<tr><td colspan="5" class="muted">Ingen spillere ennå.</td></tr>';
  }

  function renderTeamSettings() {
    const k = teamCount();
    ensureTeamNames(k);
    $('#lbl-perteam').hidden = S.teams.mode !== 'size';
    $('#lbl-count').hidden = S.teams.mode !== 'count';
    const n = presentPlayers().length;
    const min = Math.floor(n / k);
    const max = Math.ceil(n / k);
    const plan = classPlan();
    $('#lbl-count').firstChild.textContent = plan ? 'Antall lag per klasse' : 'Antall lag';
    $('#team-info').textContent = plan
      ? 'Lagene lages klasse for klasse: ' + plan.map((c) => `${c.klasse || 'uten klasse'} ${c.ids.length} spillere i ${c.k} lag`).join(', ') + '.'
      : n
        ? `${n} spillere blir ${k} lag med ${min === max ? min : min + '–' + max} spillere hver.`
        : 'Legg inn spillere først.';
    const classes = teamClasses();
    $('#team-class-th').hidden = !plan;
    $('#team-table tbody').innerHTML = S.teams.names.slice(0, k).map((t, i) => `
      <tr>
        <td><input type="color" data-path="teams.names.${i}.color" value="${esc(t.color)}"></td>
        <td><input data-path="teams.names.${i}.name" value="${esc(t.name)}"></td>${plan ? `<td><b>${esc(classes[i])}</b></td>` : ''}
        <td><input data-path="teams.names.${i}.coaches" value="${esc(t.coaches)}" placeholder="Trener 1/Trener 2"></td>
      </tr>`).join('');
  }

  function renderTeamResult() {
    const teams = currentTeams();
    const multi = !!classPlan();
    const opts = teams.map((t) => ({ id: t.id, label: multi ? `${t.name} ${t.klasse}` : t.name }));
    const assigned = new Set(teams.flatMap((t) => t.players.map((p) => p.id)));
    const unassigned = presentPlayers().filter((p) => !assigned.has(p.id));
    const playerRow = (p, teamId) => `
      <li><span>${esc(p.name)}</span>
        <select data-path="teams.assignment.${p.id}" aria-label="Flytt ${esc(p.name)}">${options(opts, teamId, '– uten lag –')}</select></li>`;
    let html = teams.map((t) => `
      <div class="team-card">
        <div class="team-head" style="background:${esc(t.color)};color:${Print.textOn(t.color)}">${esc(t.name)}${multi ? ' ' + esc(t.klasse) : ''} <small>(${t.players.length})</small></div>
        <div class="team-coach">${esc(t.coaches)}</div>
        <ul>${t.players.map((p) => playerRow(p, t.id)).join('')}</ul>
      </div>`).join('');
    if (unassigned.length) {
      html += `<div class="team-card unassigned"><div class="team-head">Uten lag (${unassigned.length})</div>
        <ul>${unassigned.map((p) => playerRow(p, '')).join('')}</ul></div>`;
    }
    $('#team-result').innerHTML = html;
  }

  function classOptions() {
    const set = new Set();
    if (S.schedule.includeOwn && S.event.ageGroup) set.add(S.event.ageGroup);
    if (S.schedule.includeOwn) S.players.forEach((p) => p.klasse && p.klasse.trim() && set.add(p.klasse.trim()));
    S.schedule.guests.forEach((g) => g.klasse && set.add(g.klasse));
    return [...set];
  }

  function renderGuests() {
    const colors = guestColors();
    $('#guest-table tbody').innerHTML = S.schedule.guests.map((g, i) => `
      <tr>
        <td><input type="color" data-path="schedule.guests.${i}.color" value="${esc(colors[g.id])}" title="Lagfarge i kampoppsettet"></td>
        <td><input data-path="schedule.guests.${i}.name" value="${esc(g.name)}" placeholder="Redwings" aria-label="Lagnavn"></td>
        <td data-label="Klubb"><input data-path="schedule.guests.${i}.club" value="${esc(g.club)}" placeholder="Nidaros" list="club-list" aria-label="Klubb"></td>
        <td data-label="Klasse"><input data-path="schedule.guests.${i}.klasse" value="${esc(g.klasse)}" placeholder="U9" list="class-list" class="short" aria-label="Klasse"></td>
        <td><button class="icon" data-action="del-guest" data-i="${i}" title="Fjern">✕</button></td>
      </tr>`).join('') || '<tr><td colspan="5" class="muted">Ingen besøkende lag ennå.</td></tr>';
    const clubs = [...new Set(S.schedule.guests.map((g) => g.club).filter(Boolean))];
    let dl = $('#club-list');
    if (!dl) { dl = document.createElement('datalist'); dl.id = 'club-list'; document.body.appendChild(dl); }
    dl.innerHTML = clubs.map((c) => `<option value="${esc(c)}">`).join('');
  }

  function renderBanes() {
    let dl = $('#class-list');
    if (!dl) { dl = document.createElement('datalist'); dl.id = 'class-list'; document.body.appendChild(dl); }
    dl.innerHTML = classOptions().map((c) => `<option value="${esc(c)}">`).join('');
    $('#bane-table tbody').innerHTML = S.schedule.banes.map((b, i) => `
      <tr>
        <td><input data-path="schedule.banes.${i}.name" value="${esc(b.name)}"></td>
        <td><input data-path="schedule.banes.${i}.klasse" value="${esc(b.klasse)}" list="class-list" placeholder="Alle" class="short"></td>
        <td><button class="icon" data-action="del-bane" data-i="${i}" title="Fjern">✕</button></td>
      </tr>`).join('');
  }

  // Hvilke lag kan spille på hver bane (ut fra klasse).
  function baneTeamOptions() {
    const teams = Object.values(teamMap());
    const out = {};
    for (const p of Algo.puljer(teams, S.schedule.banes)) {
      for (const b of p.banes) out[b] = p.teams.map((t) => ({ id: t.id, label: t.label }));
    }
    return out;
  }

  function slotTimeCells(slot, i) {
    return `<td class="time">
      <input data-path="schedule.slots.${i}.from" value="${esc(slot.from)}" inputmode="numeric" placeholder="09:30" aria-label="Fra">
      <input data-path="schedule.slots.${i}.to" value="${esc(slot.to)}" inputmode="numeric" placeholder="09:45" aria-label="Til"></td>`;
  }

  function renderRoundsInfo() {
    const t = S.schedule.timing;
    $('#lbl-games').hidden = !gamesMode();
    $('#lbl-rounds').hidden = gamesMode();
    const start = toMin(t.start);
    const r = plannedRounds();
    const end = start == null ? null : start + r * ((t.matchMin || 0) + (t.breakMin || 0)) - (t.breakMin || 0);
    const time = end == null ? '' : ` Siste kamp er ferdig kl. ${fromMin(end)}.`;
    const made = matchSlots();
    if (made.length && S.schedule.timingUsed === timingKey()) {
      const lastTo = made[made.length - 1].to;
      $('#rounds-info').textContent = `Oppsettet har ${made.length} kamprunde${made.length === 1 ? '' : 'r'}.` +
        (lastTo ? ` Siste kamp er ferdig kl. ${lastTo}.` : '');
      return;
    }
    $('#rounds-info').textContent = gamesMode()
      ? `Det trengs minst ${r} kamprunde${r === 1 ? '' : 'r'} for at alle lag skal få ${t.gamesPerTeam || 1} kamper.${time}`
      : `${r} kamprunde${r === 1 ? '' : 'r'}.${time}`;
  }

  function renderSchedule() {
    renderRoundsInfo();
    const sch = S.schedule;
    const banes = sch.banes;
    const opts = baneTeamOptions();
    const tm = teamMap();
    let html = `<thead><tr><th>Tidspunkt</th>${banes.map((b) => `<th colspan="2">${esc(b.name)}${b.klasse ? ' <small>' + esc(b.klasse) + '</small>' : ''}</th>`).join('')}<th></th></tr></thead><tbody>`;
    sch.slots.forEach((slot, i) => {
      if (slot.type === 'break') {
        html += `<tr class="break">${slotTimeCells(slot, i)}
          <td colspan="${banes.length * 2}"><input data-path="schedule.slots.${i}.label" value="${esc(slot.label)}"></td>
          <td><button class="icon" data-action="del-slot" data-i="${i}" title="Fjern">✕</button></td></tr>`;
        return;
      }
      const row = sch.matches[slot.id] || {};
      // Marker lag som står oppført to ganger i samme runde.
      const seen = {};
      Object.values(row).forEach((m) => (m || []).forEach((id) => { if (id) seen[id] = (seen[id] || 0) + 1; }));
      html += `<tr>${slotTimeCells(slot, i)}`;
      for (const b of banes) {
        const m = row[b.id] || ['', ''];
        for (const side of [0, 1]) {
          const id = m[side] || '';
          const cls = [seen[id] > 1 ? 'conflict' : '', tm[id] ? 'tc' : ''].filter(Boolean).join(' ');
          // data-label viser banenavnet over kampen når tabellen vises som kort på mobil.
          html += `<td class="${cls}" data-label="${side ? '' : esc(b.name)}"${seen[id] > 1 ? '' : teamStyle(tm[id])}><select data-path="schedule.matches.${slot.id}.${b.id}.${side}" aria-label="${esc(b.name)}, lag ${side + 1}">${options(opts[b.id] || [], id)}</select></td>`;
        }
      }
      html += `<td><button class="icon" data-action="del-slot" data-i="${i}" title="Fjern">✕</button></td></tr>`;
    });
    if (!sch.slots.length) html += `<tr><td colspan="${banes.length * 2 + 2}" class="muted">Trykk «Lag tidspunkter» for å komme i gang.</td></tr>`;
    $('#schedule-table').innerHTML = html + '</tbody>';

    const counts = matchCounts();
    const teams = Object.values(teamMap());
    $('#match-count').innerHTML = teams.length
      ? '<ul class="counts">' + teams.map((t) => `<li><span><i class="dot" style="background:${esc(t.color)}"></i>${esc(t.label)}</span><b>${counts[t.id] || 0}</b></li>`).join('') + '</ul>'
      : '<p class="muted">Ingen lag ennå.</p>';
  }

  // Sjekker et ferdig oppsett mot reglene som er valgt. Oppsettet kan være laget før en regel ble
  // slått på, eller endret for hånd, og da skal det synes.
  function scheduleProblems() {
    const slots = matchSlots();
    const tm = teamMap();
    const out = [];
    if (S.schedule.avoidThreeInRow) {
      const tired = [];
      for (const [id, t] of Object.entries(tm)) {
        let streak = 0, max = 0;
        for (const s of slots) {
          const plays = Object.values(S.schedule.matches[s.id] || {}).some((m) => (m || []).includes(id));
          streak = plays ? streak + 1 : 0;
          max = Math.max(max, streak);
        }
        if (max >= 3) tired.push(t.label);
      }
      if (tired.length) out.push(`${listNames(tired)} spiller tre kamper på rad`);
    }
    if (S.schedule.avoidRematch) {
      // Bare der det var mulig å unngå: ingen lag i gruppen har flere kamper enn det finnes motstandere.
      const c = matchCounts();
      const groupOf = {};
      for (const p of fairGroups(Object.values(tm))) {
        const ok = p.teams.every((t) => (c[t.id] || 0) <= p.teams.length - 1);
        p.teams.forEach((t) => { groupOf[t.id] = ok; });
      }
      const met = {}, twice = [];
      for (const s of slots) {
        for (const m of Object.values(S.schedule.matches[s.id] || {})) {
          if (!m || !m[0] || !m[1] || !tm[m[0]] || !tm[m[1]]) continue;
          const k = [m[0], m[1]].sort().join('|');
          met[k] = (met[k] || 0) + 1;
          if (met[k] === 2 && groupOf[m[0]]) twice.push(`${tm[m[0]].label} og ${tm[m[1]].label}`);
        }
      }
      if (twice.length) out.push(`${listNames(twice)} møtes mer enn én gang`);
    }
    if (S.schedule.sameClass) {
      const cross = slots.some((s) => Object.values(S.schedule.matches[s.id] || {}).some((m) =>
        m && m[0] && m[1] && tm[m[0]] && tm[m[1]] && (tm[m[0]].klasse || '') !== (tm[m[1]].klasse || '')));
      if (cross) out.push('noen kamper er mellom lag i ulike klasser');
    }
    if (S.schedule.equalGames) {
      const c = matchCounts();
      const uneven = fairGroups(Object.values(tm)).some((p) => {
        const g = p.teams.map((t) => c[t.id] || 0);
        return g.length > 1 && Math.max(...g) !== Math.min(...g);
      });
      if (uneven && Object.keys(c).length) out.push('ikke alle lag spiller like mange kamper');
    }
    return out;
  }

  function listNames(a) {
    return a.length > 1 ? a.slice(0, -1).join(', ') + ' og ' + a[a.length - 1] : a[0];
  }

  function renderScheduleWarn() {
    const p = scheduleProblems();
    $('#schedule-warn').textContent = p.length
      ? `Dette oppsettet følger ikke reglene: ${p.join(', og ')}. Trykk «Lag kampoppsett» på nytt.`
      : '';
  }

  function renderTasks() {
    const all = familyMap();
    const fam = taskFamilyMap();
    const famOpts = Object.entries(fam).map(([id, label]) => ({ id, label }));
    const taken = new Set(S.tasksHideAssigned ? S.tasks.flatMap((t) => t.assigned.slice(0, t.needed).filter(Boolean)) : []);
    $('#task-table tbody').innerHTML = S.tasks.map((t, i) => {
      const sels = [];
      for (let j = 0; j < (t.needed || 0); j++) {
        const id = t.assigned[j] || '';
        // Den som står valgt i feltet, vises alltid der selv om familien er skjult i de andre listene.
        const free = famOpts.filter((o) => o.id === id || !taken.has(o.id));
        // En familie som allerede er valgt, men ikke er med i dag, vises markert i stedet for å forsvinne.
        const out = id && !fam[id] && all[id];
        const opts = out ? free.concat({ id, label: `${all[id]} – ikke med i dag` }) : free;
        sels.push(`<select data-path="tasks.${i}.assigned.${j}"${out ? ' class="conflict"' : ''}>${options(opts, id, '–')}</select>`);
      }
      return `<tr>
        <td data-label="Oppgave"><input data-path="tasks.${i}.name" value="${esc(t.name)}" aria-label="Oppgave"></td>
        <td data-label="Tidspunkt"><input data-path="tasks.${i}.time" value="${esc(t.time)}" placeholder="Valgfritt" class="timefield" aria-label="Tidspunkt"></td>
        <td data-label="Antall"><input type="number" min="0" max="20" data-type="number" aria-label="Antall" data-path="tasks.${i}.needed" value="${t.needed}" class="tiny"></td>
        <td class="assign" data-label="Ansvarlige"><div class="assign-wrap">${sels.join('')}</div></td>
        <td><button class="icon" data-action="del-task" data-i="${i}" title="Fjern">✕</button></td>
      </tr>`;
    }).join('') || '<tr><td colspan="5" class="muted">Ingen oppgaver.</td></tr>';

    const count = {};
    S.tasks.forEach((t) => t.assigned.slice(0, t.needed).forEach((id) => { if (id) count[id] = (count[id] || 0) + 1; }));
    const total = Object.keys(fam).length;
    const used = Object.keys(count).filter((id) => fam[id]).length;
    $('#task-info').textContent = total
      ? `${used} av ${total} familier${S.tasksOnlyPresent ? ' med barn som er med i dag' : ''} har fått en oppgave.`
      : S.tasksOnlyPresent && S.players.length
        ? 'Ingen spillere er huket av som med i dag. Huk dem av under Laginndeling.'
        : 'Legg inn spillere under Laginndeling for å kunne fordele oppgaver.';
  }

  function renderRefs() {
    const counts = refCounts();
    $('#ref-table tbody').innerHTML = S.refs.people.map((p, i) => `
      <tr>
        <td><input data-path="refs.people.${i}.name" value="${esc(p.name)}"></td>
        <td>${counts[p.id] || 0}</td>
        <td><button class="icon" data-action="del-ref" data-i="${i}" title="Fjern">✕</button></td>
      </tr>`).join('') || '<tr><td colspan="3" class="muted">Ingen dommere ennå.</td></tr>';

    const banes = S.schedule.banes;
    const refOpts = S.refs.people.map((p) => ({ id: p.id, label: p.name }));
    const tm = teamMap();
    const per = Math.max(1, S.refs.perMatch || 1);
    let html = `<thead><tr><th>Tidspunkt</th>${banes.map((b) => `<th>${esc(b.name)}</th>`).join('')}</tr></thead><tbody>`;
    for (const slot of S.schedule.slots) {
      const time = `${esc(slot.from)}${slot.to ? '–' + esc(slot.to) : ''}`;
      if (slot.type === 'break') {
        html += `<tr class="break"><td class="time">${time}</td><td colspan="${banes.length}">${esc(slot.label)}</td></tr>`;
        continue;
      }
      const row = S.refs.assignment[slot.id] || {};
      const seen = {};
      for (const b of banes) {
        if (!(S.schedule.matches[slot.id] || {})[b.id]) continue;
        (row[b.id] || []).forEach((id) => { if (id) seen[id] = (seen[id] || 0) + 1; });
      }
      html += `<tr><td class="time">${time}</td>`;
      for (const b of banes) {
        const m = (S.schedule.matches[slot.id] || {})[b.id];
        if (!m) { html += '<td></td>'; continue; }
        const cur = row[b.id] || [];
        const sels = [];
        for (let j = 0; j < per; j++) {
          const id = cur[j] || '';
          sels.push(`<select class="${seen[id] > 1 ? 'conflict' : ''}" data-path="refs.assignment.${slot.id}.${b.id}.${j}">${options(refOpts, id, '–')}</select>`);
        }
        html += `<td>${sels.join('')}<div class="match-sub">${esc((tm[m[0]] || {}).label || '')} – ${esc((tm[m[1]] || {}).label || '')}</div></td>`;
      }
      html += '</tr>';
    }
    if (!S.schedule.slots.length) html += `<tr><td colspan="${banes.length + 1}" class="muted">Lag kampoppsettet først.</td></tr>`;
    $('#ref-schedule').innerHTML = html + '</tbody>';
  }

  const renderers = [
    ['#history-list', renderHistory],
    ['#player-table', renderPlayers],
    ['#team-table', renderTeamSettings],
    ['#team-result', renderTeamResult],
    ['#guest-table', renderGuests],
    ['#bane-table', renderBanes],
    ['#schedule-table', renderSchedule],
    ['#schedule-warn', renderScheduleWarn],
    ['#task-table', renderTasks],
    ['#ref-table', renderRefs],
    ['#note-kamp', renderNotes]
  ];

  // Tegner alt på nytt, men lar være den tabellen brukeren skriver i akkurat nå.
  function renderAll(except) {
    renderBinds();
    for (const [sel, fn] of renderers) {
      const el = $(sel);
      if (except && el.contains(except)) continue;
      fn();
    }
  }

  // ---------- Handlinger ----------

  // Én spiller per linje. Er listen kopiert fra et regneark med foresatte i neste kolonne (tabulator),
  // eller skrevet som «Ola Nordmann, Kari Nordmann», blir resten av linjen foresatte.
  function parsePlayerLine(line) {
    let parts = line.split('\t').map((x) => x.trim()).filter(Boolean);
    if (parts.length < 2 && line.includes(',')) {
      const [first, ...rest] = line.split(',').map((x) => x.trim());
      // «Nordmann, Ola» er etternavn først og ikke en foresatt: da står det bare ett ord etter kommaet.
      if (rest.length && rest.join(' ').includes(' ')) parts = [first, ...rest.filter(Boolean)];
    }
    if (parts.length < 2) return { name: line.trim(), parents: '' };
    return { name: parts[0], parents: parts.slice(1).join(', ') };
  }

  function addPlayers() {
    const lines = $('#player-paste').value.split(/\n|;/).map((s) => s.trim()).filter(Boolean);
    if (!lines.length) { toast('Skriv inn minst ett navn.'); return; }
    const klasse = $('#player-class').value.trim();
    const byName = new Map(S.players.map((p) => [p.name.toLowerCase(), p]));
    let added = 0, skipped = 0, filled = 0;
    for (const line of lines) {
      const { name, parents } = parsePlayerLine(line);
      if (!name) continue;
      const old = byName.get(name.toLowerCase());
      if (old) {
        // Finnes spilleren fra før, fylles bare foresatte inn hvis feltet er tomt.
        if (parents && !old.parents) { old.parents = parents; filled++; } else skipped++;
        continue;
      }
      const p = { id: Store.uid('p'), name, present: true, parents, klasse };
      S.players.push(p);
      byName.set(name.toLowerCase(), p);
      added++;
    }
    $('#player-paste').value = '';
    const parts = added || (!filled && !skipped) ? [`${added} spiller${added === 1 ? '' : 'e'} lagt til.`] : [];
    if (filled) parts.push(`Foresatte fylt inn for ${filled} som fantes fra før.`);
    if (skipped) parts.push(`${skipped} fantes fra før og ble hoppet over.`);
    toast(parts.join(' '));
  }

  function makeTeams() {
    const players = presentPlayers();
    if (players.length < 2) { toast('Legg inn minst to spillere først.'); return; }
    const k = teamCount();
    ensureTeamNames(k);
    const plan = classPlan();
    // Med flere klasser deles hver klasse for seg, så lagene bare får spillere fra én klasse.
    const groups = plan
      ? plan.flatMap((c) => Algo.makeTeams(c.ids, c.k, S.teams.method, S.history))
      : Algo.makeTeams(players.map((p) => p.id), k, S.teams.method, S.history);
    S.teams.assignment = {};
    groups.forEach((g, i) => g.forEach((id) => { S.teams.assignment[id] = S.teams.names[i].id; }));
    const repeats = S.history.length ? Algo.countRepeats(groups, S.history) : 0;
    $('#team-repeat-info').textContent = S.history.length
      ? `Ut fra ${S.history.length} tidligere dag${S.history.length === 1 ? '' : 'er'} i historikken: ${repeats} par av spillere har vært på lag sammen før.`
      : 'Tips: Lagre dagen i historikken (under «Dagen»), så får spillerne nye lagkamerater neste gang.';
    toast('Ny laginndeling laget.');
  }

  const gamesMode = () => S.schedule.timing.mode === 'games';

  // Antall kamprunder som trengs. Med «kamper per lag» regnes det ut fra lag og baner i hver pulje.
  function plannedRounds() {
    const t = S.schedule.timing;
    if (!gamesMode()) return Math.max(1, t.rounds || 1);
    const g = Math.max(1, t.gamesPerTeam || 1);
    let rounds = 1;
    for (const p of Algo.puljer(Object.values(teamMap()), S.schedule.banes)) {
      const nB = Algo.usableBanes(p.teams, p.banes.length, S.schedule.sameClass);
      if (nB < 1) continue;
      const groups = fairGroups(p.teams).filter((q) => q.teams.length >= 2);
      const games = groups.reduce((sum, q) => sum + Math.ceil((q.teams.length * g) / 2), 0);
      rounds = Math.max(rounds, Math.ceil(games / nB));
      // En klasse kan ikke spille flere kamper samtidig enn den har par av lag.
      for (const q of groups) rounds = Math.max(rounds, Math.ceil(Math.ceil((q.teams.length * g) / 2) / Math.floor(q.teams.length / 2)));
    }
    return rounds;
  }

  const timingKey = () => JSON.stringify({ ...S.schedule.timing, rounds: plannedRounds() });

  function genTimes() {
    const t = { ...S.schedule.timing, rounds: plannedRounds() };
    let start = toMin(t.start);
    if (start == null) { toast('Skriv inn tidspunkt for første kamp.'); return; }
    const oldMatch = matchSlots();
    const slots = [];
    for (let i = 0; i < Math.max(1, t.rounds || 1); i++) {
      const from = start + i * ((t.matchMin || 0) + (t.breakMin || 0));
      slots.push({ id: oldMatch[i] ? oldMatch[i].id : Store.uid('s'), type: 'match', from: fromMin(from), to: fromMin(from + (t.matchMin || 0)), label: '' });
    }
    if (t.endLabel && t.endLabel.trim()) {
      const from = toMin(slots[slots.length - 1].to);
      slots.push({ id: Store.uid('s'), type: 'break', from: fromMin(from), to: t.endMin ? fromMin(from + t.endMin) : '', label: t.endLabel.trim() });
    }
    S.schedule.slots = slots;
    S.schedule.timingUsed = timingKey();
    toast(`${t.rounds} kamprunder laget.`);
  }

  function makeSchedule() {
    // Er tidsinnstillingene (f.eks. antall kamprunder) endret siden tidspunktene ble laget,
    // lages tidspunktene på nytt først. Ellers ville oppsettet brukt de gamle rundene.
    if (!matchSlots().length || S.schedule.timingUsed !== timingKey()) genTimes();
    const teams = Object.values(teamMap());
    if (teams.length < 2) { toast('Det trengs minst to lag. Lag laginndeling eller legg til besøkende lag.'); return; }
    const pul = Algo.puljer(teams, S.schedule.banes);
    const fair = fairGroups(teams);
    const thin = fair.filter((p) => p.teams.length < 2);
    const target = gamesMode() ? Math.max(1, S.schedule.timing.gamesPerTeam || 1) : null;
    const reportSchedule = (msg) => note('kamp', msg, 'Nytt kampoppsett laget.');
    const build = () => {
      S.schedule.matches = Algo.makeSchedule(teams, S.schedule.banes, matchSlots().map((s) => s.id),
        { ...S.schedule, targetGames: target });
    };
    // Alle i puljen har fått så mange kamper som valgt (eller én mindre når regnestykket ikke går opp).
    const targetMet = () => {
      const c = matchCounts();
      return fair.every((p) => {
        const n = p.teams.length;
        if (n < 2) return true;
        const odd = (n * target) % 2 === 1;
        const total = p.teams.reduce((s, t) => s + (c[t.id] || 0), 0);
        const want = S.schedule.equalGames ? n * (odd ? target - 1 : target) : n * target - (odd ? 1 : 0);
        return total >= want;
      });
    };
    build();
    // Med «kamper per lag» legges det til runder til reglene kan overholdes (f.eks. nok pauser for «tre på rad»).
    let added = 0;
    if (target) {
      while (!targetMet() && added < 8) {
        addSlot('match');
        added++;
        build();
      }
    }
    const counts = matchCounts();
    const uneven = fair.filter((p) => {
      const g = p.teams.map((t) => counts[t.id] || 0);
      return g.length && Math.max(...g) !== Math.min(...g);
    });
    const usable = S.schedule.sameClass ? null : pul.find((p) => p.teams.length >= 2 && p.banes.length > Math.floor(p.teams.length / 2));
    const extra = added ? ` Det trengtes ${added} ekstra kamprunde${added === 1 ? '' : 'r'} for å få plass til pauser.` : '';
    const banesNote = usable ? ` Med ${usable.teams.length} lag kan bare ${Math.floor(usable.teams.length / 2)} baner brukes samtidig.` : '';
    if (thin.length) {
      reportSchedule(`Obs: ${thin.map((p) => p.label || 'baner uten klasse').join(', ')} har færre enn to lag. Sjekk klassene.`);
    } else if (gamesMode() && S.schedule.equalGames && fair.some((p) => (p.teams.length * (S.schedule.timing.gamesPerTeam || 1)) % 2)) {
      const p = fair.find((q) => (q.teams.length * (S.schedule.timing.gamesPerTeam || 1)) % 2);
      const g = S.schedule.timing.gamesPerTeam || 1;
      reportSchedule(`${p.teams.length} lag kan ikke spille ${g} kamper hver, fordi hver kamp har to lag. ` +
        `Alle får derfor ${g - 1}. Velg ${g + 1} kamper, eller skru av «like mange kamper» så får ett lag én kamp mindre.`);
    } else if (S.schedule.equalGames && uneven.length) {
      reportSchedule('Klarte ikke å gi alle like mange kamper med disse reglene og rundene. Prøv flere kamprunder, eller velg «antall kamper per lag».' + banesNote);
    } else if (S.schedule.equalGames) {
      const g = fair.map((p) => counts[(p.teams[0] || {}).id] || 0);
      let empty = 0;
      for (const slot of matchSlots()) {
        for (const p of pul) {
          if (p.teams.length < 2) continue;
          const usableBanes = Algo.usableBanes(p.teams, p.banes.length, S.schedule.sameClass);
          empty += usableBanes - p.banes.filter((b) => (S.schedule.matches[slot.id] || {})[b]).length;
        }
      }
      reportSchedule(`Nytt kampoppsett laget. Alle lag får ${[...new Set(g)].join('/')} kamper.` + extra +
        (empty ? ` ${empty === 1 ? '1 baneplass står tom' : empty + ' baneplasser står tomme'} i løpet av dagen.` : '') + banesNote);
    } else {
      reportSchedule('Nytt kampoppsett laget.' + extra + banesNote);
    }
  }

  function addSlot(type) {
    const slots = S.schedule.slots;
    const t = S.schedule.timing;
    if (type === 'break') {
      const prev = slots[slots.length - 1];
      const from = prev && toMin(prev.to) != null ? toMin(prev.to) : toMin(t.start) || 600;
      slots.push({ id: Store.uid('s'), type: 'break', from: fromMin(from), to: fromMin(from + 15), label: 'Pause / vanning' });
      return;
    }
    let idx = -1;
    slots.forEach((s, i) => { if (s.type === 'match') idx = i; });
    const prev = slots[idx];
    const from = prev && toMin(prev.to) != null ? toMin(prev.to) + (t.breakMin || 0) : toMin(t.start) || 600;
    const len = t.matchMin || 15;
    // Skyv det som kommer etter (f.eks. premieutdeling) like mye senere.
    const shift = len + (t.breakMin || 0);
    slots.slice(idx + 1).forEach((s) => {
      if (toMin(s.from) != null) s.from = fromMin(toMin(s.from) + shift);
      if (toMin(s.to) != null) s.to = fromMin(toMin(s.to) + shift);
    });
    slots.splice(idx + 1, 0, { id: Store.uid('s'), type: 'match', from: fromMin(from), to: fromMin(from + len), label: '' });
  }

  function makeRefs() {
    if (!S.refs.people.length) { toast('Legg inn dommere først.'); return; }
    if (!matchSlots().length) { toast('Lag kampoppsettet først.'); return; }
    S.refs.assignment = Algo.makeRefs(S.refs.people, S.schedule.banes.map((b) => b.id), matchSlots().map((s) => s.id),
      S.schedule.matches, Math.max(1, S.refs.perMatch || 1), Math.max(1, S.refs.block || 1), S.refs.sameBane);
    if (S.refs.sameBane) {
      const groups = Algo.refGroups(S.refs.people, S.schedule.banes.map((b) => b.id), matchSlots().map((s) => s.id), S.schedule.matches);
      const per = Math.max(1, S.refs.perMatch || 1);
      const short = S.schedule.banes.filter((b) => groups[b.id] && groups[b.id].length < per);
      note('dommer', short.length
        ? `Nytt dommeroppsett laget, men det er for få dommere: ${short.map((b) => b.name).join(', ')} mangler dommer. Legg til flere, eller skru av «samme bane hele dagen».`
        : 'Nytt dommeroppsett laget. Hver dommer holder seg på sin bane.', 'Nytt dommeroppsett laget.');
    } else {
      note('dommer', 'Nytt dommeroppsett laget.', 'Nytt dommeroppsett laget.');
    }
  }

  function fillTasks() {
    const fam = Object.keys(taskFamilyMap());
    if (!fam.length) {
      toast(S.tasksOnlyPresent && S.players.length ? 'Ingen spillere er huket av som med i dag. Huk dem av under Laginndeling, eller skru av «bare foresatte til barn som er med».' : 'Legg inn spillere under Laginndeling først.');
      return;
    }
    const res = Algo.makeTasks(S.tasks, fam, historyTaskCounts());
    S.tasks.forEach((t, i) => { t.assigned = res[i]; });
    const need = S.tasks.reduce((s, t) => s + (t.needed || 0), 0);
    note('oppgaver', need > fam.length ? `Oppgaver fordelt. Noen familier har fått mer enn én oppgave (${need} plasser, ${fam.length} familier).` : 'Oppgaver fordelt.', 'Oppgaver fordelt.');
  }

  // quiet: brukes når dagen lagres fra «Start ny aktivitetsdag». Da byttes en lagret dag med samme dato ut uten å spørre.
  function archiveDay(quiet) {
    const teams = currentTeams();
    const groups = teams.map((t) => t.players.map((p) => p.id)).filter((g) => g.length);
    if (!groups.length) { if (!quiet) toast('Lag en laginndeling før du lagrer dagen.'); return false; }
    const entry = {
      id: Store.uid('h'),
      date: S.event.date,
      title: S.event.title,
      groups,
      taskFamilies: S.tasks.flatMap((t) => t.assigned.slice(0, t.needed).filter(Boolean))
    };
    const i = S.history.findIndex((h) => h.date === entry.date);
    if (i >= 0) {
      if (!quiet && !confirm('Det finnes allerede en dag med denne datoen i historikken. Vil du erstatte den?')) return false;
      S.history[i] = entry;
    } else {
      S.history.push(entry);
      S.history.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    }
    if (!quiet) toast('Dagen er lagret i historikken.');
    return true;
  }

  // Er dagen allerede lagret i historikken, med samme lag som nå?
  function dayArchived() {
    const h = S.history.find((x) => x.date === S.event.date);
    if (!h) return false;
    const now = currentTeams().map((t) => t.players.map((p) => p.id).sort().join()).filter(Boolean).sort().join('|');
    const saved = (h.groups || []).map((g) => [...g].sort().join()).sort().join('|');
    return now === saved;
  }

  // «Start ny aktivitetsdag» åpner en dialog. Har dagen lag som ikke er lagret i historikken,
  // er «Lagre dagen i historikken først» huket av, så rulleringen ikke går tapt.
  function askNewDay() {
    const dlg = $('#newday-dialog');
    const hasTeams = currentTeams().some((t) => t.players.length);
    const show = hasTeams && !dayArchived();
    $('#newday-archive-row').hidden = !show;
    $('#newday-archive').checked = show;
    dlg.returnValue = '';
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else if (confirm('Starte en ny aktivitetsdag? Laginndeling, kampoppsett, oppgaver og dommeroppsett tømmes.')) startNewDay(show);
  }

  function startNewDay(archive) {
    const before = JSON.stringify(S);
    const archived = archive && archiveDay(true);
    S.teams.assignment = {};
    S.schedule.matches = {};
    S.refs.assignment = {};
    S.tasks.forEach((t) => { t.assigned = []; });
    S.players.forEach((p) => { p.present = true; });
    const d = new Date((S.event.date || new Date().toISOString().slice(0, 10)) + 'T12:00');
    d.setDate(d.getDate() + 7);
    S.event.date = d.toISOString().slice(0, 10);
    $('#team-repeat-info').textContent = '';
    notes = {};
    Store.save();
    renderAll();
    offerUndo(before, archived ? 'Dagen er lagret i historikken, og du er klar for en ny.' : 'Klar for ny aktivitetsdag.');
  }

  function saveFile() {
    const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `aktivitetsdag-${S.event.date || 'data'}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function openFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || typeof data !== 'object' || !data.event) throw new Error('feil format');
        Store.replace(data);
        notes = {};
        renderAll();
        toast('Filen er åpnet.');
      } catch (e) {
        toast('Klarte ikke å lese filen. Er det en fil lagret fra denne siden?');
      }
    };
    reader.readAsText(file);
  }

  const actions = {
    'del-player': (i) => {
      const p = S.players[i];
      S.players.splice(i, 1);
      delete S.teams.assignment[p.id];
    },
    'del-guest': (i) => { S.schedule.guests.splice(i, 1); },
    'del-bane': (i) => { S.schedule.banes.splice(i, 1); },
    'del-slot': (i) => {
      const s = S.schedule.slots[i];
      S.schedule.slots.splice(i, 1);
      delete S.schedule.matches[s.id];
      delete S.refs.assignment[s.id];
    },
    'del-task': (i) => { S.tasks.splice(i, 1); },
    'del-ref': (i) => { S.refs.people.splice(i, 1); },
    'del-history': (i) => {
      if (confirm('Slette denne dagen fra historikken?')) S.history.splice(i, 1);
    }
  };

  // Fantes det noe i den delen knappen lager på nytt?
  function hadContent(id, old) {
    const filled = (o) => Object.values(o || {}).some((v) => (v && typeof v === 'object' ? filled(v) : !!v));
    switch (id) {
      case 'btn-make-teams': return filled(old.teams.assignment);
      case 'btn-make-schedule': return filled(old.schedule.matches);
      case 'btn-make-refs': return filled(old.refs.assignment);
      case 'btn-fill-tasks':
      case 'btn-clear-tasks': return old.tasks.some((t) => t.assigned.some(Boolean));
      case 'btn-gen-times': return old.schedule.slots.length > 0;
      default: return false;
    }
  }

  const buttons = {
    'btn-add-players': addPlayers,
    'btn-make-teams': makeTeams,
    'btn-add-guest': () => S.schedule.guests.push({ id: Store.uid('g'), name: '', club: '', klasse: S.event.ageGroup || '' }),
    'btn-add-bane': () => S.schedule.banes.push({ id: Store.uid('b'), name: 'Bane ' + (S.schedule.banes.length + 1), klasse: '' }),
    'btn-gen-times': genTimes,
    'btn-make-schedule': makeSchedule,
    'btn-add-slot': () => addSlot('match'),
    'btn-add-break': () => addSlot('break'),
    'btn-add-task': () => S.tasks.push({ id: Store.uid('t'), name: 'Ny oppgave', time: '', needed: 1, assigned: [] }),
    'btn-fill-tasks': fillTasks,
    'btn-clear-tasks': () => S.tasks.forEach((t) => { t.assigned = []; }),
    'btn-add-refs': () => {
      const names = $('#ref-paste').value.split('\n').map((s) => s.trim()).filter(Boolean);
      names.forEach((name) => S.refs.people.push({ id: Store.uid('d'), name }));
      $('#ref-paste').value = '';
    },
    'btn-make-refs': makeRefs,
    'btn-archive': () => archiveDay(),
    'btn-newday': askNewDay,
    'btn-save-file': saveFile,
    'btn-reset': () => {
      if (confirm('Er du sikker? Alt du har lagt inn slettes fra denne nettleseren.')) {
        Store.reset();
        notes = {};
        $('#team-repeat-info').textContent = '';
      }
    }
  };

  // Lager en ekte PDF-fil som havner i Nedlastinger.
  let pdfBusy = false;
  function downloadPdf(sections) {
    if (pdfBusy) return;
    pdfBusy = true;
    toast('Lager PDF …');
    Print.download(sections)
      .then(() => toast(`PDF-en er lagret som «${Print.fileName(sections)}» i Nedlastinger.`))
      .catch(() => toast('Klarte ikke å lage PDF-en. Prøv «Skriv ut» og velg «Lagre som PDF» i utskriftsvinduet.'))
      .finally(() => { pdfBusy = false; });
  }

  // ---------- Faner ----------

  function showTab(name) {
    if (!$('#page-' + name)) name = 'dag';
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    $$('.page').forEach((p) => p.classList.toggle('active', p.id === 'page-' + name));
    $('#btn-settings').classList.toggle('active', name === 'innstillinger');
    try { localStorage.setItem('aktivitetsdag.tab', name); } catch (e) { /* ignorer */ }
  }

  // ---------- Utseende ----------
  // Lagres for seg (ikke i S), så valget ikke følger med når en fil deles med en annen trener.

  function currentTheme() {
    try { return localStorage.getItem('aktivitetsdag.theme') || 'auto'; } catch (e) { return 'auto'; }
  }

  function setTheme(theme) {
    if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
    try { localStorage.setItem('aktivitetsdag.theme', theme); } catch (e) { /* ignorer */ }
  }

  // ---------- Oppstart ----------

  function init() {
    $('#sport-select').insertAdjacentHTML('beforeend',
      Store.SPORTS.map(([name, icon]) => `<option value="${esc(name)}">${icon} ${esc(name)}</option>`).join(''));

    document.addEventListener('click', (e) => {
      const tab = e.target.closest('.tab, [data-goto]');
      if (tab) {
        e.preventDefault();
        showTab(tab.dataset.tab || tab.dataset.goto);
        window.scrollTo(0, 0);
        return;
      }

      const pr = e.target.closest('[data-print]');
      if (pr) { Print.print([pr.dataset.print]); return; }

      if (e.target.closest('.toast-undo')) {
        const undo = toast.undo;
        if (undo) undo();
        return;
      }

      const act = e.target.closest('[data-action]');
      if (act && actions[act.dataset.action]) {
        const name = act.dataset.action, i = Number(act.dataset.i);
        const before = JSON.stringify(S);
        const msg = undoMsg[name] && undoMsg[name](i);
        actions[name](i);
        Store.save();
        renderAll();
        if (msg) offerUndo(before, msg);
        return;
      }

      const btn = e.target.closest('button[id]');
      if (btn && buttons[btn.id]) {
        const before = JSON.stringify(S);
        toast.last = null;
        buttons[btn.id]();
        Store.save();
        renderAll();
        // Bare når noe som fantes fra før, ble endret (en tom laginndeling er ikke noe å angre).
        if (undoMsg[btn.id] && hadContent(btn.id, JSON.parse(before))) offerUndo(before, toast.last || undoMsg[btn.id]());
        const result = { 'btn-make-teams': '#team-result', 'btn-make-schedule': '#schedule-table', 'btn-make-refs': '#ref-schedule' }[btn.id];
        if (result && JSON.stringify(S) !== before) revealResult(result);
      }
    });

    // Feltene i skjemaene oppdaterer tilstanden fortløpende.
    document.addEventListener('input', (e) => {
      const el = e.target;
      const path = el.dataset.bind || el.dataset.path;
      if (!path) return;
      setPath(S, path, readValue(el));
      Store.save();
      if (el.type === 'checkbox' || el.tagName === 'SELECT' || el.type === 'color') return; // tegnes på change
      renderAll(el.closest('table') || el);
    });

    document.addEventListener('change', (e) => {
      const el = e.target;
      if (el.id === 'file-open') {
        if (el.files[0]) openFile(el.files[0]);
        el.value = '';
        return;
      }
      const path = el.dataset.bind || el.dataset.path;
      if (!path) return;
      setPath(S, path, readValue(el));
      Store.save();
      const full = el.type === 'checkbox' || el.type === 'color' || el.tagName === 'SELECT' || el.dataset.type === 'number';
      renderAll(full ? null : el.closest('table') || el);
    });

    // PDF-knappen øverst: velg hvilke deler som skal med, og om de skal lastes ned eller skrives ut.
    // Står du på en av de fire sidene, er bare den valgt fra start. Fra «Dagen» er alle valgt.
    const all = ['lag', 'kamp', 'oppgaver', 'dommer'];
    const dlg = $('#export-dialog');
    $('#btn-export').addEventListener('click', () => {
      const tab = ($('.tab.active') || {}).dataset || {};
      const only = all.includes(tab.tab) ? tab.tab : null;
      all.forEach((n) => { dlg.querySelector(`[name=${n}]`).checked = !only || n === only; });
      dlg.returnValue = ''; // Esc lukker uten å endre returnValue, så den må nullstilles
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else downloadPdf(all);
    });
    dlg.addEventListener('close', () => {
      const chosen = all.filter((n) => dlg.querySelector(`[name=${n}]`).checked);
      if (!chosen.length || dlg.returnValue === 'cancel' || !dlg.returnValue) return;
      if (dlg.returnValue === 'print') Print.print(chosen);
      if (dlg.returnValue === 'download') downloadPdf(chosen);
    });

    const nd = $('#newday-dialog');
    nd.addEventListener('close', () => {
      if (nd.returnValue === 'ok') startNewDay(!$('#newday-archive-row').hidden && $('#newday-archive').checked);
    });

    $$('input[name=theme]').forEach((r) => {
      r.checked = r.value === currentTheme();
      r.addEventListener('change', () => setTheme(r.value));
    });

    let tab = 'dag';
    try { tab = localStorage.getItem('aktivitetsdag.tab') || (S.players.length ? 'lag' : 'dag'); } catch (e) { /* ignorer */ }
    showTab(tab);
    renderAll();
  }

  window.App = { currentTeams, teamLabel, teamMap, matchCounts, refCounts, familyMap };
  document.addEventListener('DOMContentLoaded', init);
})();

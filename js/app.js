// Brukergrensesnittet: tegner sidene og reagerer på det brukeren gjør.
(function () {
  const { esc } = Print;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // ---------- Hjelpefunksjoner ----------

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), Math.max(3500, msg.length * 60));
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

  function teamCount() {
    const n = presentPlayers().length;
    if (S.teams.mode === 'count') return Math.max(1, S.teams.count || 1);
    return Math.max(1, Math.ceil(n / Math.max(1, S.teams.perTeam || 1)));
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
    const teams = S.teams.names.slice(0, k).map((t) => ({ ...t, players: [] }));
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

  // Alle lag som er med i kampoppsettet, både egne og besøkende.
  function teamMap() {
    const map = {};
    if (S.schedule.includeOwn && presentPlayers().length) {
      for (const t of currentTeams()) {
        map[t.id] = { id: t.id, label: teamLabel(t.name, S.event.club, S.event.ageGroup), club: S.event.club, klasse: S.event.ageGroup };
      }
    }
    for (const g of S.schedule.guests) {
      if (!g.name.trim()) continue;
      map[g.id] = { id: g.id, label: teamLabel(g.name, g.club, g.klasse), club: g.club, klasse: g.klasse };
    }
    return map;
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

  function historyTaskCounts() {
    const c = {};
    for (const h of S.history) for (const id of h.taskFamilies || []) c[id] = (c[id] || 0) + 1;
    return c;
  }

  // ---------- Tegning av sidene ----------

  function renderSport() {
    const found = Store.SPORTS.find(([name]) => name === S.event.sport);
    $('#sport-icon').textContent = found ? found[1] : '⭐';
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
        <td><input data-path="players.${i}.name" value="${esc(p.name)}"></td>
        <td><input data-path="players.${i}.parents" value="${esc(p.parents || '')}" placeholder="Navn på foresatte"></td>
        <td><button class="icon" data-action="del-player" data-i="${i}" title="Fjern">✕</button></td>
      </tr>`).join('') || '<tr><td colspan="4" class="muted">Ingen spillere ennå.</td></tr>';
  }

  function renderTeamSettings() {
    const k = teamCount();
    ensureTeamNames(k);
    $('#lbl-perteam').hidden = S.teams.mode !== 'size';
    $('#lbl-count').hidden = S.teams.mode !== 'count';
    const n = presentPlayers().length;
    const min = Math.floor(n / k);
    const max = Math.ceil(n / k);
    $('#team-info').textContent = n
      ? `${n} spillere blir ${k} lag med ${min === max ? min : min + '–' + max} spillere hver.`
      : 'Legg inn spillere først.';
    $('#team-table tbody').innerHTML = S.teams.names.slice(0, k).map((t, i) => `
      <tr>
        <td><input type="color" data-path="teams.names.${i}.color" value="${esc(t.color)}"></td>
        <td><input data-path="teams.names.${i}.name" value="${esc(t.name)}"></td>
        <td><input data-path="teams.names.${i}.coaches" value="${esc(t.coaches)}" placeholder="Trener 1/Trener 2"></td>
      </tr>`).join('');
  }

  function renderTeamResult() {
    const teams = currentTeams();
    const opts = teams.map((t) => ({ id: t.id, label: t.name }));
    const assigned = new Set(teams.flatMap((t) => t.players.map((p) => p.id)));
    const unassigned = presentPlayers().filter((p) => !assigned.has(p.id));
    const playerRow = (p, teamId) => `
      <li><span>${esc(p.name)}</span>
        <select data-path="teams.assignment.${p.id}" aria-label="Flytt ${esc(p.name)}">${options(opts, teamId, '– uten lag –')}</select></li>`;
    let html = teams.map((t) => `
      <div class="team-card">
        <div class="team-head" style="background:${esc(t.color)};color:${Print.textOn(t.color)}">${esc(t.name)} <small>(${t.players.length})</small></div>
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
    S.schedule.guests.forEach((g) => g.klasse && set.add(g.klasse));
    return [...set];
  }

  function renderGuests() {
    $('#guest-table tbody').innerHTML = S.schedule.guests.map((g, i) => `
      <tr>
        <td><input data-path="schedule.guests.${i}.name" value="${esc(g.name)}" placeholder="Redwings"></td>
        <td><input data-path="schedule.guests.${i}.club" value="${esc(g.club)}" placeholder="Nidaros" list="club-list"></td>
        <td><input data-path="schedule.guests.${i}.klasse" value="${esc(g.klasse)}" placeholder="U9" list="class-list" class="short"></td>
        <td><button class="icon" data-action="del-guest" data-i="${i}" title="Fjern">✕</button></td>
      </tr>`).join('') || '<tr><td colspan="4" class="muted">Ingen besøkende lag ennå.</td></tr>';
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
    $('#rounds-info').textContent = gamesMode()
      ? `Det trengs ${r} kamprunde${r === 1 ? '' : 'r'} for at alle lag skal få ${t.gamesPerTeam || 1} kamper.${time}`
      : `${r} kamprunde${r === 1 ? '' : 'r'}.${time}`;
  }

  function renderSchedule() {
    renderRoundsInfo();
    const sch = S.schedule;
    const banes = sch.banes;
    const opts = baneTeamOptions();
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
          html += `<td class="${seen[id] > 1 ? 'conflict' : ''}"><select data-path="schedule.matches.${slot.id}.${b.id}.${side}">${options(opts[b.id] || [], id)}</select></td>`;
        }
      }
      html += `<td><button class="icon" data-action="del-slot" data-i="${i}" title="Fjern">✕</button></td></tr>`;
    });
    if (!sch.slots.length) html += `<tr><td colspan="${banes.length * 2 + 2}" class="muted">Trykk «Lag tidspunkter» for å komme i gang.</td></tr>`;
    $('#schedule-table').innerHTML = html + '</tbody>';

    const counts = matchCounts();
    const teams = Object.values(teamMap());
    $('#match-count').innerHTML = teams.length
      ? '<ul class="counts">' + teams.map((t) => `<li><span>${esc(t.label)}</span><b>${counts[t.id] || 0}</b></li>`).join('') + '</ul>'
      : '<p class="muted">Ingen lag ennå.</p>';
  }

  function renderTasks() {
    const fam = familyMap();
    const famOpts = Object.entries(fam).map(([id, label]) => ({ id, label }));
    $('#task-table tbody').innerHTML = S.tasks.map((t, i) => {
      const sels = [];
      for (let j = 0; j < (t.needed || 0); j++) {
        sels.push(`<select data-path="tasks.${i}.assigned.${j}">${options(famOpts, t.assigned[j] || '', '–')}</select>`);
      }
      return `<tr>
        <td><input data-path="tasks.${i}.name" value="${esc(t.name)}"></td>
        <td><input data-path="tasks.${i}.time" value="${esc(t.time)}" placeholder="09:00-11:00" class="short"></td>
        <td><input type="number" min="0" max="20" data-type="number" data-path="tasks.${i}.needed" value="${t.needed}" class="tiny"></td>
        <td class="assign">${sels.join('')}</td>
        <td><button class="icon" data-action="del-task" data-i="${i}" title="Fjern">✕</button></td>
      </tr>`;
    }).join('') || '<tr><td colspan="5" class="muted">Ingen oppgaver.</td></tr>';

    const count = {};
    S.tasks.forEach((t) => t.assigned.slice(0, t.needed).forEach((id) => { if (id) count[id] = (count[id] || 0) + 1; }));
    const total = Object.keys(fam).length;
    const used = Object.keys(count).length;
    $('#task-info').textContent = total
      ? `${used} av ${total} familier har fått en oppgave.`
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
    ['#task-table', renderTasks],
    ['#ref-table', renderRefs]
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

  function addPlayers() {
    const names = $('#player-paste').value.split(/\n|;/).map((s) => s.trim()).filter(Boolean);
    if (!names.length) { toast('Skriv inn minst ett navn.'); return; }
    const existing = new Set(S.players.map((p) => p.name.toLowerCase()));
    let added = 0;
    for (const name of names) {
      if (existing.has(name.toLowerCase())) continue;
      S.players.push({ id: Store.uid('p'), name, present: true, parents: '' });
      existing.add(name.toLowerCase());
      added++;
    }
    $('#player-paste').value = '';
    toast(`${added} spiller${added === 1 ? '' : 'e'} lagt til.`);
  }

  function makeTeams() {
    const players = presentPlayers();
    if (players.length < 2) { toast('Legg inn minst to spillere først.'); return; }
    const k = teamCount();
    ensureTeamNames(k);
    const groups = Algo.makeTeams(players.map((p) => p.id), k, S.teams.method, S.history);
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
      const nB = Math.min(p.banes.length, Math.floor(p.teams.length / 2));
      if (nB < 1) continue;
      rounds = Math.max(rounds, Math.ceil(Math.ceil((p.teams.length * g) / 2) / nB));
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
    const thin = pul.filter((p) => p.teams.length < 2);
    S.schedule.matches = Algo.makeSchedule(teams, S.schedule.banes, matchSlots().map((s) => s.id),
      { ...S.schedule, targetGames: gamesMode() ? Math.max(1, S.schedule.timing.gamesPerTeam || 1) : null });
    const counts = matchCounts();
    const uneven = pul.filter((p) => {
      const g = p.teams.map((t) => counts[t.id] || 0);
      return g.length && Math.max(...g) !== Math.min(...g);
    });
    if (thin.length) {
      toast(`Obs: ${thin.map((p) => p.label || 'baner uten klasse').join(', ')} har færre enn to lag. Sjekk klassene.`);
    } else if (gamesMode() && S.schedule.equalGames && pul.some((p) => (p.teams.length * (S.schedule.timing.gamesPerTeam || 1)) % 2)) {
      const p = pul.find((q) => (q.teams.length * (S.schedule.timing.gamesPerTeam || 1)) % 2);
      const g = S.schedule.timing.gamesPerTeam || 1;
      toast(`${p.teams.length} lag kan ikke spille ${g} kamper hver, fordi hver kamp har to lag. ` +
        `Alle får derfor ${g - 1}. Velg ${g + 1} kamper, eller skru av «like mange kamper» så får ett lag én kamp mindre.`);
    } else if (S.schedule.equalGames && uneven.length) {
      toast('Klarte ikke helt å gi alle like mange kamper. Prøv å endre antall kamprunder eller baner.');
    } else if (S.schedule.equalGames) {
      const g = pul.map((p) => counts[(p.teams[0] || {}).id] || 0);
      let empty = 0;
      for (const slot of matchSlots()) {
        for (const p of pul) if (p.teams.length >= 2) empty += p.banes.filter((b) => !(S.schedule.matches[slot.id] || {})[b]).length;
      }
      toast(`Nytt kampoppsett laget. Alle lag får ${[...new Set(g)].join('/')} kamper.` +
        (empty ? ` ${empty === 1 ? '1 baneplass står tom' : empty + ' baneplasser står tomme'} i løpet av dagen.` : ''));
    } else {
      toast('Nytt kampoppsett laget.');
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
    slots.splice(idx + 1, 0, { id: Store.uid('s'), type: 'match', from: fromMin(from), to: fromMin(from + (t.matchMin || 15)), label: '' });
  }

  function makeRefs() {
    if (!S.refs.people.length) { toast('Legg inn dommere først.'); return; }
    if (!matchSlots().length) { toast('Lag kampoppsettet først.'); return; }
    S.refs.assignment = Algo.makeRefs(S.refs.people, S.schedule.banes.map((b) => b.id), matchSlots().map((s) => s.id),
      S.schedule.matches, Math.max(1, S.refs.perMatch || 1), Math.max(1, S.refs.block || 1));
    toast('Nytt dommeroppsett laget.');
  }

  function fillTasks() {
    const fam = Object.keys(familyMap());
    if (!fam.length) { toast('Legg inn spillere under Laginndeling først.'); return; }
    const res = Algo.makeTasks(S.tasks, fam, historyTaskCounts());
    S.tasks.forEach((t, i) => { t.assigned = res[i]; });
    const need = S.tasks.reduce((s, t) => s + (t.needed || 0), 0);
    toast(need > fam.length ? `Oppgaver fordelt. Noen familier har fått mer enn én (${need} plasser, ${fam.length} familier).` : 'Oppgaver fordelt.');
  }

  function archiveDay() {
    const teams = currentTeams();
    const groups = teams.map((t) => t.players.map((p) => p.id)).filter((g) => g.length);
    if (!groups.length) { toast('Lag en laginndeling før du lagrer dagen.'); return; }
    const entry = {
      id: Store.uid('h'),
      date: S.event.date,
      title: S.event.title,
      groups,
      taskFamilies: S.tasks.flatMap((t) => t.assigned.slice(0, t.needed).filter(Boolean))
    };
    const i = S.history.findIndex((h) => h.date === entry.date);
    if (i >= 0) {
      if (!confirm('Det finnes allerede en dag med denne datoen i historikken. Vil du erstatte den?')) return;
      S.history[i] = entry;
    } else {
      S.history.push(entry);
      S.history.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    }
    toast('Dagen er lagret i historikken.');
  }

  function newDay() {
    if (!confirm('Starte en ny aktivitetsdag? Laginndeling, kampoppsett, oppgaver og dommeroppsett tømmes. Spillere, lag, baner og dommere beholdes. Husk å lagre dagen i historikken først hvis du vil ha rullering.')) return;
    S.teams.assignment = {};
    S.schedule.matches = {};
    S.refs.assignment = {};
    S.tasks.forEach((t) => { t.assigned = []; });
    S.players.forEach((p) => { p.present = true; });
    const d = new Date((S.event.date || new Date().toISOString().slice(0, 10)) + 'T12:00');
    d.setDate(d.getDate() + 7);
    S.event.date = d.toISOString().slice(0, 10);
    $('#team-repeat-info').textContent = '';
    toast('Klar for ny aktivitetsdag.');
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
    'btn-archive': archiveDay,
    'btn-newday': newDay,
    'btn-save-file': saveFile,
    'btn-reset': () => {
      if (confirm('Er du sikker? Alt du har lagt inn slettes fra denne nettleseren.')) {
        Store.reset();
        $('#team-repeat-info').textContent = '';
      }
    }
  };

  // ---------- Faner ----------

  function showTab(name) {
    if (!$('#page-' + name)) name = 'dag';
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    $$('.page').forEach((p) => p.classList.toggle('active', p.id === 'page-' + name));
    try { localStorage.setItem('aktivitetsdag.tab', name); } catch (e) { /* ignorer */ }
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

      const act = e.target.closest('[data-action]');
      if (act && actions[act.dataset.action]) {
        actions[act.dataset.action](Number(act.dataset.i));
        Store.save();
        renderAll();
        return;
      }

      const btn = e.target.closest('button[id]');
      if (btn && buttons[btn.id]) {
        buttons[btn.id]();
        Store.save();
        renderAll();
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

    const dlg = $('#export-dialog');
    $('#btn-export').addEventListener('click', () => {
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else Print.print(['lag', 'kamp', 'oppgaver', 'dommer']);
    });
    dlg.addEventListener('close', () => {
      if (dlg.returnValue !== 'ok') return;
      const chosen = ['lag', 'kamp', 'oppgaver', 'dommer'].filter((n) => dlg.querySelector(`[name=${n}]`).checked);
      if (chosen.length) Print.print(chosen);
    });

    let tab = 'dag';
    try { tab = localStorage.getItem('aktivitetsdag.tab') || (S.players.length ? 'lag' : 'dag'); } catch (e) { /* ignorer */ }
    showTab(tab);
    renderAll();
  }

  window.App = { currentTeams, teamMap, matchCounts, refCounts, familyMap };
  document.addEventListener('DOMContentLoaded', init);
})();

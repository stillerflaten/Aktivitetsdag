// Logikken som fordeler lag, kamper, dommere og oppgaver.
(function () {
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);

  function argmin(items, score) {
    let best = null;
    let bestScore = Infinity;
    for (const it of items) {
      const s = score(it);
      if (s < bestScore) { bestScore = s; best = it; }
    }
    return best;
  }

  // ---------- Laginndeling ----------

  // Hvor mange ganger to spillere har vært på lag sammen før. Nyere dager teller mer.
  function pairWeights(history) {
    const w = new Map();
    history.forEach((day, i) => {
      const weight = 1 + (i + 1) / history.length;
      for (const group of day.groups || []) {
        for (let x = 0; x < group.length; x++) {
          for (let y = x + 1; y < group.length; y++) {
            const k = pairKey(group[x], group[y]);
            w.set(k, (w.get(k) || 0) + weight);
          }
        }
      }
    });
    return w;
  }

  function deal(ids, k) {
    const groups = Array.from({ length: k }, () => []);
    ids.forEach((id, i) => groups[i % k].push(id));
    return groups;
  }

  function groupCost(group, w) {
    let c = 0;
    for (let x = 0; x < group.length; x++) {
      for (let y = x + 1; y < group.length; y++) c += w.get(pairKey(group[x], group[y])) || 0;
    }
    return c;
  }

  // Deler spillerne i k lag så jevnt som mulig. Med "mix" velges inndelingen
  // der færrest spillere havner sammen med de samme lagkameratene som før.
  function makeTeams(playerIds, k, method, history) {
    k = Math.max(1, Math.min(k, playerIds.length || 1));
    if (method !== 'mix' || !history.length) return deal(shuffle(playerIds), k);

    const w = pairWeights(history);
    let best = null;
    let bestCost = Infinity;
    for (let attempt = 0; attempt < 60; attempt++) {
      const groups = deal(shuffle(playerIds), k);
      let improved = true;
      let rounds = 0;
      while (improved && rounds < 30) {
        improved = false;
        rounds++;
        for (let g1 = 0; g1 < k; g1++) {
          for (let g2 = g1 + 1; g2 < k; g2++) {
            for (let i = 0; i < groups[g1].length; i++) {
              for (let j = 0; j < groups[g2].length; j++) {
                const before = groupCost(groups[g1], w) + groupCost(groups[g2], w);
                [groups[g1][i], groups[g2][j]] = [groups[g2][j], groups[g1][i]];
                const after = groupCost(groups[g1], w) + groupCost(groups[g2], w);
                if (after < before - 1e-9) improved = true;
                else [groups[g1][i], groups[g2][j]] = [groups[g2][j], groups[g1][i]];
              }
            }
          }
        }
      }
      const cost = groups.reduce((s, g) => s + groupCost(g, w), 0);
      if (cost < bestCost) { bestCost = cost; best = groups; }
      if (cost === 0) break;
    }
    return best;
  }

  // Antall par av spillere i inndelingen som har vært sammen før.
  function countRepeats(groups, history) {
    const seen = new Set();
    for (const day of history) {
      for (const g of day.groups || []) {
        for (let x = 0; x < g.length; x++) for (let y = x + 1; y < g.length; y++) seen.add(pairKey(g[x], g[y]));
      }
    }
    let n = 0;
    for (const g of groups) {
      for (let x = 0; x < g.length; x++) for (let y = x + 1; y < g.length; y++) if (seen.has(pairKey(g[x], g[y]))) n++;
    }
    return n;
  }

  // ---------- Kampoppsett ----------

  // Finner hvilke lag som hører til hver bane. Baner med samme klasse deler lag.
  // En bane uten klasse tar alle lag som ikke har en egen bane.
  function puljer(teams, banes) {
    const dedicated = new Set(banes.map((b) => b.klasse.trim().toLowerCase()).filter(Boolean));
    const map = new Map();
    for (const b of banes) {
      const key = b.klasse.trim().toLowerCase();
      if (!map.has(key)) {
        const pool = key
          ? teams.filter((t) => (t.klasse || '').trim().toLowerCase() === key)
          : teams.filter((t) => !dedicated.has((t.klasse || '').trim().toLowerCase()));
        map.set(key, { key, label: b.klasse.trim(), banes: [], teams: pool });
      }
      map.get(key).banes.push(b.id);
    }
    return [...map.values()];
  }

  function schedulePulje(teams, baneIds, slotIds, opts) {
    const ids = teams.map((t) => t.id);
    const club = Object.fromEntries(teams.map((t) => [t.id, (t.club || '').trim().toLowerCase()]));
    const nB = Math.min(baneIds.length, Math.floor(ids.length / 2));
    if (nB === 0) return {};

    let best = null;
    let bestScore = Infinity;
    for (let attempt = 0; attempt < 400; attempt++) {
      const games = Object.fromEntries(ids.map((id) => [id, 0]));
      const last = {};
      const pairs = new Map();
      const result = {};
      let backToBack = 0;
      let sameClub = 0;
      let repeats = 0;

      slotIds.forEach((slotId, si) => {
        const used = new Set();
        result[slotId] = {};
        for (let bi = 0; bi < nB; bi++) {
          const avail = ids.filter((id) => !used.has(id));
          const rest = (id) => (opts.avoidBackToBack && last[id] === si - 1 ? 5 : 0);
          const a = argmin(avail, (id) => games[id] * 10 + rest(id) + Math.random() * 3);
          const b = argmin(avail.filter((id) => id !== a), (id) =>
            games[id] * 10 + rest(id) +
            (pairs.get(pairKey(a, id)) || 0) * 9 +
            (opts.avoidSameClub && club[a] && club[a] === club[id] ? 7 : 0) +
            Math.random() * 3);
          if (!b) break;
          used.add(a); used.add(b);
          for (const id of [a, b]) {
            if (last[id] === si - 1) backToBack++;
            last[id] = si;
            games[id]++;
          }
          const pk = pairKey(a, b);
          if (pairs.get(pk)) repeats += pairs.get(pk);
          pairs.set(pk, (pairs.get(pk) || 0) + 1);
          if (club[a] && club[a] === club[b]) sameClub++;
          // Bytt hvilken side lagene står på annenhver gang, så det varierer.
          result[slotId][baneIds[bi]] = Math.random() < 0.5 ? [a, b] : [b, a];
        }
      });

      const g = Object.values(games);
      const score = (Math.max(...g) - Math.min(...g)) * 100 + repeats * 12 +
        (opts.avoidBackToBack ? backToBack * 6 : 0) + (opts.avoidSameClub ? sameClub * 8 : 0);
      if (score < bestScore) { bestScore = score; best = result; }
    }
    // Varier banene: roter rekkefølgen per runde slik at lag ikke alltid står på samme bane.
    slotIds.forEach((slotId, si) => {
      const row = best[slotId];
      const entries = baneIds.map((b) => row[b]).filter(Boolean);
      const out = {};
      entries.forEach((m, i) => { out[baneIds[(i + si) % baneIds.length]] = m; });
      best[slotId] = out;
    });
    return best;
  }

  function makeSchedule(teams, banes, slotIds, opts) {
    const matches = Object.fromEntries(slotIds.map((id) => [id, {}]));
    for (const p of puljer(teams, banes)) {
      const res = schedulePulje(p.teams, p.banes, slotIds, opts);
      for (const slotId of slotIds) Object.assign(matches[slotId], res[slotId] || {});
    }
    return matches;
  }

  // ---------- Dommeroppsett ----------

  function makeRefs(people, baneIds, slotIds, matches, perMatch, block) {
    const counts = Object.fromEntries(people.map((p) => [p.id, 0]));
    const current = {};
    const out = {};
    for (const slotId of slotIds) {
      out[slotId] = {};
      const usedNow = new Set();
      for (const baneId of baneIds) {
        if (!(matches[slotId] || {})[baneId]) continue;
        const cur = current[baneId];
        let refs;
        if (cur && cur.left > 0 && cur.refs.every((r) => !usedNow.has(r))) {
          refs = cur.refs;
          cur.left--;
        } else {
          refs = [];
          for (let i = 0; i < perMatch; i++) {
            const free = people.map((p) => p.id).filter((id) => !usedNow.has(id) && !refs.includes(id));
            const pick = argmin(free, (id) => counts[id] * 10 + (cur && cur.refs.includes(id) ? 3 : 0) + Math.random());
            if (pick) refs.push(pick);
          }
          current[baneId] = { refs, left: block - 1 };
        }
        refs.forEach((r) => { usedNow.add(r); counts[r]++; });
        out[slotId][baneId] = refs.slice();
      }
    }
    return out;
  }

  // ---------- Oppgavefordeling ----------

  function parseRange(text) {
    const m = /(\d{1,2})[:.](\d{2})\s*[-–]\s*(\d{1,2})[:.](\d{2})/.exec(text || '');
    if (!m) return null;
    return [m[1] * 60 + +m[2], m[3] * 60 + +m[4]];
  }

  function overlaps(a, b) {
    const ra = parseRange(a);
    const rb = parseRange(b);
    return ra && rb && ra[0] < rb[1] && rb[0] < ra[1];
  }

  // Fordeler familier på oppgavene. Familier med færrest oppgaver (i dag og tidligere) velges først,
  // og ingen får to oppgaver som overlapper i tid.
  function makeTasks(tasks, familyIds, historyCounts) {
    const now = Object.fromEntries(familyIds.map((id) => [id, 0]));
    const taken = Object.fromEntries(familyIds.map((id) => [id, []]));
    return tasks.map((task) => {
      const assigned = [];
      for (let i = 0; i < (task.needed || 0); i++) {
        const free = familyIds.filter((id) => !assigned.includes(id));
        const pick = argmin(free, (id) =>
          now[id] * 100 +
          (taken[id].some((t) => overlaps(t, task.time)) ? 1000 : 0) +
          (historyCounts[id] || 0) * 5 +
          Math.random());
        if (!pick) break;
        assigned.push(pick);
        now[pick]++;
        taken[pick].push(task.time);
      }
      return assigned;
    });
  }

  window.Algo = { shuffle, makeTeams, countRepeats, puljer, makeSchedule, makeRefs, makeTasks, parseRange };
})();

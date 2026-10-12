// Tilstand for hele appen. Lagres i nettleseren (localStorage).
(function () {
  const KEY = 'aktivitetsdag.v1';

  const COLORS = ['#C9785A', '#5B8BA0', '#D8B45C', '#6F9A78', '#2F4858', '#9A7BA6', '#4F9A94', '#C98A9A', '#8C7B6B', '#7D8C96'];
  const TEAM_NAMES = ['Ørn', 'Ulv', 'Bjørn', 'Rev', 'Gaupe', 'Elg', 'Ugle', 'Oter', 'Hare', 'Ekorn'];
  const SPORTS = [
    ['Fotball', '⚽'], ['Håndball', '🤾'], ['Ishockey', '🏒'], ['Bandy', '🏑'], ['Innebandy', '🏑'],
    ['Basketball', '🏀'], ['Volleyball', '🏐'], ['Hockey (landhockey)', '🏑'], ['Rugby', '🏉'], ['Annen idrett', '⭐']
  ];

  let seq = Date.now();
  function uid(prefix) {
    seq += 1;
    return (prefix || 'id') + seq.toString(36) + Math.random().toString(36).slice(2, 5);
  }

  function nextSaturday() {
    const d = new Date();
    d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
    return d.toISOString().slice(0, 10);
  }

  function defaultTasks() {
    return [
      ['Kiosk', '09:00-11:00', 2],
      ['Kiosk', '11:00-13:00', 2],
      ['Sekretariat / tidtaking', '09:30-13:00', 1],
      ['Opprigg av baner og utstyr', '09:00-09:30', 3],
      ['Nedrigg og rydding', '13:05-13:45', 3],
      ['Kakebaking', '', 3],
      ['Garderobevakt', '09:00-13:00', 1]
    ].map(([name, time, needed]) => ({ id: uid('t'), name, time, needed, assigned: [] }));
  }

  function defaults() {
    return {
      version: 1,
      event: { title: 'Aktivitetsdag', sport: '', date: nextSaturday(), place: '', club: '', ageGroup: '' },
      players: [],
      teams: {
        mode: 'size',
        perTeam: 6,
        count: 3,
        method: 'mix',
        names: TEAM_NAMES.slice(0, 3).map((n, i) => ({ id: uid('lag'), name: n, color: COLORS[i], coaches: '' })),
        assignment: {} // spillerId -> lagId
      },
      schedule: {
        includeOwn: true,
        guests: [], // { id, name, club, klasse }
        banes: [{ id: uid('b'), name: 'Bane 1', klasse: '' }, { id: uid('b'), name: 'Bane 2', klasse: '' }],
        timing: { mode: 'games', gamesPerTeam: 4, start: '09:30', matchMin: 15, breakMin: 10, rounds: 8, endLabel: 'Premieutdeling og rydding', endMin: 40 },
        slots: [], // { id, from, to, type: 'match'|'break', label }
        matches: {}, // slotId -> baneId -> [lagA, lagB]
        avoidSameClub: true,
        avoidBackToBack: true,
        avoidThreeInRow: true,
        equalGames: false
      },
      tasks: defaultTasks(),
      tasksHideAssigned: false, // skjul familier som allerede har en oppgave i de andre listene
      tasksOnlyPresent: true, // bare foresatte til barn som er med i dag kan få oppgaver
      refs: {
        people: [], // { id, name }
        perMatch: 1,
        block: 2,
        sameBane: true,
        assignment: {} // slotId -> baneId -> [dommerId]
      },
      history: [] // { id, date, title, groups: [[spillerId]], taskFamilies: [spillerId] }
    };
  }

  // Fyller inn felter som mangler (f.eks. fra en eldre lagret fil).
  function merge(base, saved) {
    if (Array.isArray(base)) return Array.isArray(saved) ? saved : base;
    if (base && typeof base === 'object') {
      const out = {};
      for (const k of Object.keys(base)) out[k] = saved && k in saved ? merge(base[k], saved[k]) : base[k];
      if (saved && typeof saved === 'object') {
        for (const k of Object.keys(saved)) if (!(k in out)) out[k] = saved[k];
      }
      return out;
    }
    return saved === undefined || saved === null ? base : saved;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return merge(defaults(), JSON.parse(raw));
    } catch (e) { /* tom eller blokkert lagring */ }
    return defaults();
  }

  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(window.S)); } catch (e) { /* ignorer */ }
    }, 150);
  }

  function replace(obj) {
    window.S = merge(defaults(), obj);
    save();
  }

  function reset() {
    window.S = defaults();
    save();
  }

  window.S = load();
  window.Store = { uid, save, replace, reset, defaults, defaultTasks, COLORS, TEAM_NAMES, SPORTS };
})();

// Bygger rene utskriftsversjoner av hver side (brukes til PDF).
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function shortDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${+d}.${+m}.${y.slice(2)}`;
  }

  // Lys tekst på mørk bakgrunn og omvendt.
  function textOn(hex) {
    const h = (hex || '#ffffff').replace('#', '');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16));
    return (r * 299 + g * 587 + b * 114) / 1000 > 140 ? '#111' : '#fff';
  }

  function heading(title, sub) {
    const e = S.event;
    const place = [e.title || 'Aktivitetsdag', e.place, shortDate(e.date)].filter(Boolean).join(' ');
    return `<div class="p-head"><div class="p-title">${esc(place)}</div><div class="p-sub">${esc(sub || title)}</div></div>`;
  }

  function lag() {
    const teams = App.currentTeams();
    const club = S.event.club ? S.event.club + ' ' : '';
    const age = S.event.ageGroup ? ' ' + S.event.ageGroup : '';
    const cols = teams.map((t) => `
      <div class="p-team" style="--c:${esc(t.color)}">
        <div class="p-team-name" style="background:${esc(t.color)};color:${textOn(t.color)}">${esc(club + t.name + age)}</div>
        <div class="p-team-coach">${esc(t.coaches) || '&nbsp;'}</div>
        <ol>${t.players.map((p) => `<li>${esc(p.name)}</li>`).join('')}</ol>
      </div>`).join('');
    return `<section class="p-page">${heading('', 'LAGINNDELING')}<div class="p-teams">${cols || '<p>Ingen laginndeling ennå.</p>'}</div></section>`;
  }

  function kamp() {
    const sch = S.schedule;
    const banes = sch.banes;
    const teamMap = App.teamMap();
    const classes = [...new Set(Object.values(teamMap).map((t) => t.klasse).filter(Boolean))];
    let html = `<table class="p-table"><thead><tr><th rowspan="2">Tidspunkt</th>`;
    html += banes.map((b) => `<th colspan="2">${esc(b.name)}${b.klasse ? ' – ' + esc(b.klasse) : ''}</th>`).join('');
    html += `</tr><tr>${banes.map(() => '<th>Lag</th><th>Lag</th>').join('')}</tr></thead><tbody>`;
    for (const slot of sch.slots) {
      const time = `${esc(slot.from)}${slot.to ? '-' + esc(slot.to) : ''}`;
      if (slot.type === 'break') {
        html += `<tr class="p-break"><td>${time}</td><td colspan="${banes.length * 2}">${esc(slot.label)}</td></tr>`;
        continue;
      }
      html += `<tr><td>${time}</td>`;
      for (const b of banes) {
        const m = (sch.matches[slot.id] || {})[b.id];
        html += m ? `<td>${esc((teamMap[m[0]] || {}).label)}</td><td>${esc((teamMap[m[1]] || {}).label)}</td>` : '<td></td><td></td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table>';

    const counts = App.matchCounts();
    const list = Object.values(teamMap).map((t) => `<tr><td>${esc(t.label)}</td><td>${counts[t.id] || 0}</td></tr>`).join('');
    html += `<table class="p-table p-small"><thead><tr><th>Lag</th><th>Kamper</th></tr></thead><tbody>${list}</tbody></table>`;
    return `<section class="p-page">${heading('', 'KAMPOPPSETT' + (classes.length ? ' ' + classes.join(', ') : ''))}${html}</section>`;
  }

  function oppgaver() {
    const fam = App.familyMap();
    const rows = S.tasks.map((t) => `<tr><td>${esc(t.name)}</td><td>${esc(t.time)}</td><td>${t.assigned.map((id) => esc(fam[id] || '')).filter(Boolean).join('<br>')}</td></tr>`).join('');
    return `<section class="p-page">${heading('', 'OPPGAVEFORDELING')}
      <table class="p-table p-tasks"><thead><tr><th>Oppgave</th><th>Tidspunkt</th><th>Ansvarlige</th></tr></thead><tbody>${rows}</tbody></table></section>`;
  }

  function dommer() {
    const sch = S.schedule;
    const banes = sch.banes;
    const names = Object.fromEntries(S.refs.people.map((p) => [p.id, p.name]));
    const teamMap = App.teamMap();
    let html = `<table class="p-table"><thead><tr><th>Tidspunkt</th>${banes.map((b) => `<th>${esc(b.name)}</th>`).join('')}</tr></thead><tbody>`;
    for (const slot of sch.slots) {
      const time = `${esc(slot.from)}${slot.to ? '-' + esc(slot.to) : ''}`;
      if (slot.type === 'break') {
        html += `<tr class="p-break"><td>${time}</td><td colspan="${banes.length}">${esc(slot.label)}</td></tr>`;
        continue;
      }
      html += `<tr><td>${time}</td>`;
      for (const b of banes) {
        const m = (sch.matches[slot.id] || {})[b.id];
        const refs = ((S.refs.assignment[slot.id] || {})[b.id] || []).map((id) => names[id]).filter(Boolean);
        html += m
          ? `<td><b>${refs.map(esc).join(' / ') || '–'}</b><div class="p-match">${esc((teamMap[m[0]] || {}).label)} – ${esc((teamMap[m[1]] || {}).label)}</div></td>`
          : '<td></td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    const counts = App.refCounts();
    html += `<table class="p-table p-small"><thead><tr><th>Dommer</th><th>Kamper</th></tr></thead><tbody>${S.refs.people.map((p) => `<tr><td>${esc(p.name)}</td><td>${counts[p.id] || 0}</td></tr>`).join('')}</tbody></table>`;
    return `<section class="p-page">${heading('', 'DOMMEROPPSETT')}${html}</section>`;
  }

  const builders = { lag, kamp, oppgaver, dommer };

  // Topp- og bunntekst på hver side, f.eks. «Aktivitetsdag - Astor».
  function runningText() {
    const e = S.event;
    return [e.title || 'Aktivitetsdag', e.club].filter((x) => x && x.trim()).join(' - ');
  }

  function print(sections) {
    const area = document.getElementById('print-area');
    const text = esc(runningText());
    // Topptekst i <thead> gjentas øverst på hver utskrevne side. Bunnteksten står fast nederst,
    // og en tom <tfoot> holder av plass til den så innholdet ikke havner oppå.
    area.innerHTML = `<div class="p-runfoot">${text}</div>` + sections.map((s) => builders[s]()
      .replace('<section class="p-page">', `<section class="p-page"><table class="p-wrap"><thead><tr><td><div class="p-runhead">${text}</div></td></tr></thead><tbody><tr><td>`)
      .replace(/<\/section>$/, '</td></tr></tbody><tfoot><tr><td><div class="p-footspace"></div></td></tr></tfoot></table></section>')).join('');
    // Gi nettleseren et øyeblikk til å tegne før utskriftsvinduet åpnes.
    setTimeout(() => window.print(), 50);
  }

  // «Lagre som PDF»: lager en ekte PDF-fil som lastes ned direkte (havner i Nedlastinger),
  // uten utskriftsvinduet. Biblioteket (html2pdf.js) lastes først når knappen brukes.
  let libPromise = null;
  function loadLib() {
    if (window.html2pdf) return Promise.resolve();
    if (!libPromise) {
      libPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'js/vendor/html2pdf.bundle.min.js';
        s.onload = resolve;
        s.onerror = () => { libPromise = null; reject(new Error('lasting feilet')); };
        document.head.appendChild(s);
      });
    }
    return libPromise;
  }

  function fileName() {
    const e = S.event;
    const slug = (x) => (x || '').toLowerCase().replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return [slug(e.title) || 'aktivitetsdag', slug(e.club), e.date].filter(Boolean).join('-') + '.pdf';
  }

  async function download(sections) {
    await loadLib();
    const el = document.createElement('div');
    el.className = 'p-doc p-download';
    // A4 liggende minus marger (277 mm) i skjermpiksler, så skriftstørrelsene blir som ved utskrift.
    el.style.width = '1047px';
    el.innerHTML = sections.map((s) => builders[s]()).join('<div class="html2pdf__page-break"></div>');
    const text = runningText();
    await window.html2pdf().set({
      margin: [14, 10, 14, 10],
      filename: fileName(),
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', '.p-team'] }
    }).from(el).toPdf().get('pdf').then((pdf) => {
      // Topp- og bunntekst på hver side.
      const n = pdf.internal.getNumberOfPages();
      const w = pdf.internal.pageSize.getWidth();
      const h = pdf.internal.pageSize.getHeight();
      for (let i = 1; i <= n; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8.5);
        pdf.setTextColor(95, 107, 114);
        pdf.text(text, w / 2, 8, { align: 'center' });
        pdf.text(text, w / 2, h - 6, { align: 'center' });
      }
    }).save();
  }

  window.Print = { print, download, fileName, esc, shortDate, textOn };
})();

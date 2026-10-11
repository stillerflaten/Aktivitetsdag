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

  // Logoen «Banen» som innebygd SVG, så den kommer med både i utskrift og nedlastet PDF.
  const LOGO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="225" fill="#2F4858"/>'
    + '<g fill="none" stroke="#EDE6DA" stroke-width="40" stroke-linecap="round"><rect x="212" y="292" width="600" height="440" rx="110"/>'
    + '<line x1="512" y1="292" x2="512" y2="732"/><circle cx="512" cy="512" r="96"/></g><circle cx="666" cy="420" r="46" fill="#E3A587"/></svg>';
  const LOGO = `<img class="p-logo" alt="" width="40" height="40" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(LOGO_SVG)}">`;

  function heading(title, sub) {
    const e = S.event;
    const meta = [e.place, shortDate(e.date), e.club].filter(Boolean).join('  ·  ');
    return `<div class="p-head">${LOGO}<div class="p-head-text"><div class="p-sub">${esc(sub || title)}</div>`
      + `<div class="p-title">${esc(e.title || 'Aktivitetsdag')}</div><div class="p-meta">${esc(meta)}</div></div></div>`;
  }

  function lag() {
    const teams = App.currentTeams();
    const cols = teams.map((t) => `
      <div class="p-team" style="--c:${esc(t.color)}">
        <div class="p-team-name" style="background:${esc(t.color)};color:${textOn(t.color)}">${esc(App.teamLabel(t.name, S.event.club, S.event.ageGroup))}</div>
        ${t.coaches ? `<div class="p-team-coach">${esc(t.coaches)}</div>` : ''}
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
    area.innerHTML = `<div class="p-runfoot"><span>${text}</span><span class="p-maker"><img src="assets/tillerflaten-design.svg" alt="" width="12" height="12"> Laget av Tillerflaten Design · post@tillerflatendesign.no</span></div>` + sections.map((s) => builders[s]()
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

  // Diskret avsender nederst på hver PDF-side: Tillerflaten Design-logoen og navnet, med lenke til e-post.
  function maker(pdf, cx, y) {
    const label = 'Laget av Tillerflaten Design';
    pdf.setFontSize(7);
    pdf.setTextColor(95, 107, 114);
    const tw = pdf.getTextWidth(label);
    const s = 3.2; // logoens størrelse i mm
    const x = cx - (tw + s + 1.2) / 2;
    const k = s / 32;
    pdf.setFillColor(23, 50, 58);
    pdf.roundedRect(x, y - s + 0.6, s, s, 7 * k, 7 * k, 'F');
    pdf.setFillColor(140, 198, 206);
    pdf.lines([[8.5 * k, -15 * k], [4.5 * k, 7.5 * k], [4 * k, -5.5 * k], [7 * k, 13 * k]], x + 4 * k, y - s + 0.6 + 25 * k, [1, 1], 'F', true);
    pdf.textWithLink(label, x + s + 1.2, y, { url: 'mailto:post@tillerflatendesign.no' });
  }

  // Hver del (laginndeling, kampoppsett …) tegnes for seg og legges på egne sider.
  // Det gir like sideskift i alle nettlesere (også Safari).
  async function download(sections) {
    await loadLib();
    const fmt = { unit: 'mm', format: 'a4', orientation: 'landscape' };
    const opt = { margin: [14, 10, 14, 10], jsPDF: fmt, html2canvas: { scale: 2, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0 } };
    const canvases = [];
    // html2canvas (særlig i Safari) tegner feil utsnitt hvis siden er rullet ned. Rull til toppen mens vi tegner.
    const sx = window.scrollX, sy = window.scrollY;
    window.scrollTo(0, 0);
    try {
      for (const s of sections) {
        const el = document.createElement('div');
        el.className = 'p-doc p-download';
        el.innerHTML = builders[s]();
        // Mål hvor hver tabellrad slutter, så lange deler kan deles mellom rader og ikke midt i dem.
        el.style.cssText = 'position:absolute;left:-20000px;top:0;width:1047px';
        document.body.appendChild(el);
        const y0 = el.getBoundingClientRect().top;
        const cuts = [...el.querySelectorAll('tr, .p-head, .p-team')].map((r) => r.getBoundingClientRect().bottom - y0);
        el.remove();
        el.style.cssText = '';
        // Bredden settes av html2pdf ut fra sidestørrelse og marger (277 mm), så skriften blir som ved utskrift.
        const cv = await window.html2pdf().set(opt).from(el).toCanvas().get('canvas');
        cv.cuts = cuts;
        canvases.push(cv);
      }
    } finally {
      window.scrollTo(sx, sy);
    }
    // jsPDF ligger inne i html2pdf-pakken; vi starter fra et tomt dokument og fyller første side selv.
    const pdf = await window.html2pdf().set(opt).from('<div></div>', 'string').toPdf().get('pdf');
    const W = 297, H = 210, mx = 10, top = 14, areaW = W - 2 * mx, areaH = H - 2 * top;
    let first = true;
    const addImg = (cv, w, h, x) => {
      if (!first) pdf.addPage();
      first = false;
      pdf.addImage(cv.toDataURL('image/jpeg', 0.95), 'JPEG', x, top, w, h);
    };
    for (const cv of canvases) {
      const h = cv.height * areaW / cv.width;
      if (h <= areaH * 1.35) {
        // Får plass på én side (krymper litt om nødvendig).
        const k = Math.min(1, areaH / h);
        addImg(cv, areaW * k, h * k, mx + areaW * (1 - k) / 2);
      } else {
        // Veldig lang del: del opp over flere sider.
        const slicePx = Math.floor(areaH * cv.width / areaW);
        const px = cv.width / 1047; // canvas-piksler per skjermpiksel
        for (let y = 0; y < cv.height;) {
          let end = Math.min(y + slicePx, cv.height);
          if (end < cv.height) {
            const cut = Math.max(...cv.cuts.map((c) => Math.round(c * px)).filter((c) => c > y + slicePx / 2 && c <= end));
            if (isFinite(cut)) end = cut;
          }
          const part = document.createElement('canvas');
          part.width = cv.width;
          part.height = end - y;
          const ctx = part.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, part.width, part.height);
          ctx.drawImage(cv, 0, -y);
          addImg(part, areaW, part.height * areaW / cv.width, mx);
          y = end;
        }
      }
    }
    // Topp- og bunntekst på hver side.
    const text = runningText();
    const n = pdf.internal.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      pdf.setPage(i);
      pdf.setDrawColor(47, 72, 88);
      pdf.setLineWidth(0.3);
      pdf.line(mx, 10, W - mx, 10);
      pdf.line(mx, H - 10, W - mx, H - 10);
      pdf.setFontSize(8);
      pdf.setTextColor(47, 72, 88);
      pdf.text(text, mx, 7.5);
      pdf.text(text, mx, H - 5.5);
      pdf.setTextColor(184, 104, 74);
      pdf.text(`Side ${i} av ${n}`, W - mx, H - 5.5, { align: 'right' });
      maker(pdf, W / 2, H - 5.5);
    }
    pdf.save(fileName());
  }

  window.Print = { print, download, fileName, esc, shortDate, textOn };
})();

/* Bolão Balera 2026 — Mata-Mata · App de Ranking (Geral)
   JS puro. Dados em window.CHAVEAMENTO e window.ELENCOS (dados-mm.js).
   Pontuação (fixa por time no jogo):
     Placar exato 10 · Vencedor/Empate 5 · Artilheiros (nomes) 10 · Artilheiros na ordem 15 (vale o maior). */
(function () {
  'use strict';
  var IS_AMARO = window.APP_VARIANT === 'amaro';
  var JOGOS = (window.CHAVEAMENTO && window.CHAVEAMENTO.jogos) || [];
  var ELENCOS = window.ELENCOS || {};
  var GOL_CONTRA = '(gol contra)';

  var LS_RES = 'mm_realResults';
  var LS_PART = 'mm_participants';

  // ---------- estado ----------
  function load(k, def) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var realResults = load(LS_RES, {});   // { id: {home,away,homeScorers:[],awayScorers:[]} }
  var participants = load(LS_PART, []); // [{name,cpf,guesses:{id:{home,away,homeScorers,awayScorers}}}]
  var activeTab = participants.length ? 'ranking' : 'carregar';
  var search = '';

  // ---------- helpers ----------
  function norm(s) { return (s == null ? '' : String(s)).trim().toLowerCase(); }
  function jogoById(id) { for (var i = 0; i < JOGOS.length; i++) if (JOGOS[i].id === id) return JOGOS[i]; return null; }
  function playersOf(team) { return (ELENCOS[team] || []); }
  function esc(s){ return (s==null?'':String(s)).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }

  function hasResult(r) { return r && r.home !== undefined && r.home !== '' && r.home !== null && r.away !== undefined && r.away !== '' && r.away !== null; }

  function placarScore(g, r) {
    if (!g || !hasResult(r) || g.home === undefined || g.home === '' || g.away === undefined || g.away === '') return { pts: 0, type: 'none' };
    var gh = +g.home, ga = +g.away, rh = +r.home, ra = +r.away;
    if (gh === rh && ga === ra) return { pts: 10, type: 'exact' };
    if (Math.sign(gh - ga) === Math.sign(rh - ra)) return { pts: 5, type: 'winner' };
    return { pts: 0, type: 'miss' };
  }
  // compara lista de artilheiros (de um time) do palpite vs real
  function scorerScore(guess, real) {
    var r = (real || []).map(norm).filter(function (x) { return x; });
    if (r.length === 0) return { pts: 0, type: 'none' };            // time não marcou: sem pontos de artilheiro
    var g = (guess || []).map(norm).filter(function (x) { return x; });
    if (g.length === 0) return { pts: 0, type: 'empty' };
    var orderMatch = g.length === r.length && g.every(function (x, i) { return x === r[i]; });
    if (orderMatch) return { pts: 15, type: 'order' };
    var sameSet = g.length === r.length && g.slice().sort().join('|') === r.slice().sort().join('|');
    if (sameSet) return { pts: 10, type: 'names' };
    return { pts: 0, type: 'miss' };
  }

  function scoreParticipant(p) {
    var tot = 0, exact = 0, placarPts = 0, scorerPts = 0, winner = 0, ordersHit = 0, namesHit = 0, processed = 0;
    var detail = [];
    JOGOS.forEach(function (j) {
      var r = realResults[j.id];
      if (!hasResult(r)) return;
      processed++;
      var g = (p.guesses || {})[j.id] || {};
      var ps = placarScore(g, r);
      var hs = scorerScore(g.homeScorers, r.homeScorers);
      var as = scorerScore(g.awayScorers, r.awayScorers);
      placarPts += ps.pts; scorerPts += hs.pts + as.pts;
      if (ps.type === 'exact') exact++; if (ps.type === 'winner') winner++;
      if (hs.type === 'order') ordersHit++; if (as.type === 'order') ordersHit++;
      if (hs.type === 'names') namesHit++; if (as.type === 'names') namesHit++;
      tot += ps.pts + hs.pts + as.pts;
      detail.push({ j: j, g: g, r: r, ps: ps, hs: hs, as: as });
    });
    return { name: p.name, cpf: p.cpf, total: tot, exact: exact, winner: winner, placarPts: placarPts, scorerPts: scorerPts, ordersHit: ordersHit, namesHit: namesHit, processed: processed, detail: detail };
  }

  function ranking() {
    var arr = participants.map(scoreParticipant);
    arr.sort(function (a, b) {
      return b.total - a.total || b.exact - a.exact || b.ordersHit - a.ordersHit || b.namesHit - a.namesHit || b.winner - a.winner || a.name.localeCompare(b.name);
    });
    arr.forEach(function (x, i) { x.pos = i + 1; });
    return arr;
  }

  // ---------- render ----------
  var view = document.getElementById('view');
  function render() {
    document.querySelectorAll('#tabs button').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === activeTab); });
    if (activeTab === 'ranking') return renderRanking();
    if (activeTab === 'jogos') return renderJogos();
    if (activeTab === 'regras') return renderRegras();
    if (activeTab === 'carregar') return renderCarregar();
  }

  function badges(j) {
    return (j.brasil ? '<span class="badge b-brasil">BRASIL</span> ' : '') + (j.provisorio ? '<span class="badge b-prov">provisório</span>' : '');
  }

  function renderRanking() {
    if (!participants.length) {
      view.innerHTML = '<div class="card"><div class="empty">Nenhum palpite carregado ainda.<br><br><button class="btn ciano" onclick="MM.go(\'carregar\')">Carregar planilha de palpites</button></div></div>';
      return;
    }
    var rk = ranking();
    var finished = JOGOS.filter(function (j) { return hasResult(realResults[j.id]); }).length;
    var filtered = search ? rk.filter(function (x) { return norm(x.name).indexOf(norm(search)) >= 0; }) : rk;
    var rows = filtered.map(function (x) {
      return '<tr onclick="MM.detalhe(\'' + esc(x.cpf || x.name) + '\')">' +
        '<td class="rankpos">' + x.pos + 'º</td>' +
        '<td class="nome">' + esc(x.name) + '</td>' +
        '<td>' + x.exact + '</td>' +
        '<td>' + x.placarPts + '</td>' +
        '<td>' + x.scorerPts + '</td>' +
        '<td><span class="pill tot">' + x.total + '</span></td>' +
        '</tr>';
    }).join('');
    view.innerHTML =
      '<div class="card">' +
      '<div class="hd"><div><h2>Ranking Atualizado</h2><div class="muted">' + participants.length + ' participantes · ' + finished + '/' + JOGOS.length + ' jogos com resultado</div></div>' +
      '<input class="search" placeholder="Buscar participante..." value="' + esc(search) + '" oninput="MM.busca(this.value)"></div>' +
      '<div class="tablewrap"><table><thead><tr>' +
      '<th>Pos</th><th class="nome">Participante</th><th title="Placares exatos (cravadas)">Cravadas</th><th title="Pontos de placar (10/5)">Placar</th><th title="Pontos de artilheiros (10/15)">Artilheiros</th><th>Total</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
      (IS_AMARO ? '<div class="hd" style="border-top:1px solid var(--linha);border-bottom:0"><div class="muted">Exportar ranking no layout da Intranet</div><button class="btn ouro" onclick="MM.exportar()">Exportar Excel</button></div>' : '') +
      '</div>';
  }

  function scorerEditor(j, side, team, n, values) {
    if (n <= 0) return '';
    var opts = playersOf(team).concat([GOL_CONTRA]);
    var rows = '';
    for (var i = 0; i < n; i++) {
      var val = (values && values[i]) || '';
      var os = '<option value="">— artilheiro —</option>' + opts.map(function (nm) {
        return '<option value="' + esc(nm) + '"' + (norm(nm) === norm(val) ? ' selected' : '') + '>' + esc(nm) + '</option>';
      }).join('');
      rows += '<div class="srow"><span class="sidx">' + (i + 1) + '</span><select data-game="' + j.id + '" data-side="' + side + '" data-idx="' + i + '">' + os + '</select></div>';
    }
    return '<div class="scol"><h4>Gols de ' + esc(team) + '</h4>' + rows + '</div>';
  }

  function renderJogos() {
    var cards = JOGOS.map(function (j) {
      var r = realResults[j.id] || { home: '', away: '', homeScorers: [], awayScorers: [] };
      var nh = r.home === '' || r.home == null ? 0 : +r.home;
      var na = r.away === '' || r.away == null ? 0 : +r.away;
      return '<div class="game' + (j.brasil ? ' brasil' : '') + '">' +
        '<div class="gh"><span class="gnum">J' + j.id + '</span><span>' + badges(j) + '</span></div>' +
        '<div class="gscore">' +
        '<span class="tn h">' + esc(j.mandante) + '</span>' +
        '<span class="sc"><input type="text" inputmode="numeric" value="' + (r.home === undefined ? '' : r.home) + '" data-res="' + j.id + '" data-f="home"><span class="sx">x</span><input type="text" inputmode="numeric" value="' + (r.away === undefined ? '' : r.away) + '" data-res="' + j.id + '" data-f="away"></span>' +
        '<span class="tn">' + esc(j.visitante) + '</span>' +
        '</div>' +
        ((nh > 0 || na > 0) ? '<div class="scorers">' + scorerEditor(j, 'home', j.mandante, nh, r.homeScorers) + scorerEditor(j, 'away', j.visitante, na, r.awayScorers) + '</div>' : '') +
        '</div>';
    }).join('');
    view.innerHTML = '<div class="card"><div class="hd"><div><h2>Jogos e Resultados</h2><div class="muted">Informe o placar real e os artilheiros na ordem dos gols (por time). Salvo automaticamente.</div></div></div>' +
      '<div class="note">Os pontos só são contabilizados para jogos com placar preenchido. Confrontos provisórios dependem dos jogos pendentes dos Grupos J/K.</div>' +
      '<div class="games">' + cards + '</div></div>';
  }

  function renderRegras() {
    view.innerHTML = '<div class="card"><div class="hd"><h2>Regras — Mata-Mata</h2></div><div class="rules">' +
      '<div class="rule"><span class="pts">10 pts</span><h3>Placar exato</h3><div class="muted">Acertou o placar exato do jogo.</div></div>' +
      '<div class="rule"><span class="pts">5 pts</span><h3>Vencedor ou empate</h3><div class="muted">Acertou o lado vencedor (ou o empate), mas não o placar exato.</div></div>' +
      '<div class="rule"><span class="pts">10 pts</span><h3>Nomes dos artilheiros (por time)</h3><div class="muted">Acertou quem marcou os gols de um time naquele jogo (sem a ordem). Avaliado para cada time. Brasil é obrigatório no palpite; demais times opcionais, mas pontuam se acertar.</div></div>' +
      '<div class="rule"><span class="pts">15 pts</span><h3>Artilheiros na ordem (por time)</h3><div class="muted">Acertou os nomes E a ordem dos gols de um time. NÃO soma com os 10 — vale o maior (15).</div></div>' +
      '<div class="muted">Desempate: total → cravadas → acertos na ordem → acertos de nomes → vencedores.</div>' +
      '</div></div>';
  }

  function renderCarregar() {
    view.innerHTML = '<div class="card"><div class="hd"><h2>Carregar Palpites</h2></div>' +
      '<div class="uploadzone">' +
      '<p class="muted">Selecione a planilha <b>Palpites - Bolão Balera 2026 - Mata-Mata.xlsx</b> (com as abas “Palpites Placar” e “Palpites Gols por Jogador”). O app lê as duas abas e cruza por CPF.</p>' +
      '<button class="btn ciano" onclick="document.getElementById(\'file\').click()">Selecionar planilha (.xlsx)</button>' +
      '<input id="file" type="file" accept=".xlsx,.xls" onchange="MM.upload(this)">' +
      '<p id="upmsg" class="muted" style="margin-top:14px"></p>' +
      (participants.length ? '<p class="muted">Atualmente carregados: <b>' + participants.length + '</b> participantes. <button class="btn" style="background:#fee2e2;color:#b91c1c" onclick="MM.limpar()">Limpar</button></p>' : '') +
      '</div></div>';
  }

  // ---------- detalhe (modal) ----------
  function detalhe(key) {
    var p = participants.find(function (x) { return (x.cpf || x.name) === key; });
    if (!p) return;
    var s = scoreParticipant(p);
    var rows = s.detail.map(function (d) {
      function st(x) { return x.type === 'exact' ? 'Cravou (10)' : x.type === 'winner' ? 'Vencedor (5)' : x.type === 'order' ? 'Ordem (15)' : x.type === 'names' ? 'Nomes (10)' : x.type === 'none' ? '—' : '0'; }
      var g = d.g || {};
      return '<tr><td class="g">J' + d.j.id + ' ' + esc(d.j.mandante) + ' x ' + esc(d.j.visitante) + '</td>' +
        '<td>' + (g.home !== undefined && g.home !== '' ? esc(g.home + 'x' + g.away) : '—') + '<br><span class="muted">real ' + esc(d.r.home + 'x' + d.r.away) + '</span></td>' +
        '<td>' + st(d.ps) + '</td>' +
        '<td>' + st(d.hs) + ' / ' + st(d.as) + '</td>' +
        '<td><b>' + (d.ps.pts + d.hs.pts + d.as.pts) + '</b></td></tr>';
    }).join('');
    var m = document.createElement('div'); m.className = 'modal-bg'; m.onclick = function () { m.remove(); };
    m.innerHTML = '<div class="modal" onclick="event.stopPropagation()"><h3>' + esc(p.name) + ' — ' + s.total + ' pts</h3>' +
      '<div class="muted" style="margin-bottom:10px">Placar: ' + s.placarPts + ' · Artilheiros: ' + s.scorerPts + ' · Cravadas: ' + s.exact + '</div>' +
      (s.detail.length ? '<table class="bk"><thead><tr><th class="g" style="text-align:left">Jogo</th><th>Palpite</th><th>Placar</th><th>Artilheiros (M/V)</th><th>Pts</th></tr></thead><tbody>' + rows + '</tbody></table>' : '<p class="muted">Nenhum jogo com resultado ainda.</p>') +
      '<div style="text-align:right;margin-top:14px"><button class="btn" onclick="this.closest(\'.modal-bg\').remove()">Fechar</button></div></div>';
    document.body.appendChild(m);
  }

  // ---------- ingestão xlsx ----------
  function parsePlacarCell(v) {
    if (v == null) return null; var s = String(v).toLowerCase();
    var m = s.match(/(\d+)\s*x\s*(\d+)/);
    if (!m) return null; return { home: +m[1], away: +m[2] };
  }
  function parseScorerCell(v) {
    if (v == null || String(v).trim() === '') return [];
    return String(v).split('>').map(function (x) { return x.trim(); }).filter(function (x) { return x; });
  }
  function headerMap(rows) { // rows = array de arrays; acha a linha que tem "Colaborador"
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i] || [];
      for (var c = 0; c < r.length; c++) if (norm(r[c]) === 'colaborador') return { row: i, headers: r.map(function (x) { return x == null ? '' : String(x); }) };
    }
    return null;
  }
  function colOf(headers, pred) { for (var c = 0; c < headers.length; c++) if (pred(headers[c].trim())) return c; return -1; }

  function ingest(workbook) {
    var sPlacar = workbook.Sheets['Palpites Placar'];
    var sGols = workbook.Sheets['Palpites Gols por Jogador'];
    if (!sPlacar) throw new Error('Aba "Palpites Placar" não encontrada.');
    var rowsP = XLSX.utils.sheet_to_json(sPlacar, { header: 1, raw: false });
    var hmP = headerMap(rowsP); if (!hmP) throw new Error('Cabeçalho (Colaborador) não encontrado na aba Placar.');
    var nomeC = colOf(hmP.headers, function (h) { return norm(h) === 'colaborador'; });
    var cpfC = colOf(hmP.headers, function (h) { return norm(h) === 'cpf'; });
    // mapa coluna -> id do jogo (placar): header "J{id} ..."
    var placarCols = [];
    hmP.headers.forEach(function (h, c) { var m = h.trim().match(/^J(\d+)\b/); if (m && c !== nomeC && c !== cpfC && !/gols/i.test(h)) placarCols.push({ c: c, id: +m[1] }); });

    var byCpf = {};
    function getP(name, cpf) {
      var key = (cpf || '').replace(/\D/g, '') || norm(name);
      if (!byCpf[key]) byCpf[key] = { name: name, cpf: (cpf || '').replace(/\D/g, ''), guesses: {} };
      if (name) byCpf[key].name = name;
      return byCpf[key];
    }
    for (var i = hmP.row + 1; i < rowsP.length; i++) {
      var r = rowsP[i] || []; var name = (r[nomeC] || '').toString().trim(); if (!name) continue;
      var p = getP(name, (r[cpfC] || '').toString());
      placarCols.forEach(function (pc) { var pl = parsePlacarCell(r[pc.c]); if (pl) { p.guesses[pc.id] = p.guesses[pc.id] || {}; p.guesses[pc.id].home = pl.home; p.guesses[pc.id].away = pl.away; } });
    }
    // aba gols
    if (sGols) {
      var rowsG = XLSX.utils.sheet_to_json(sGols, { header: 1, raw: false });
      var hmG = headerMap(rowsG);
      if (hmG) {
        var nomeG = colOf(hmG.headers, function (h) { return norm(h) === 'colaborador'; });
        var cpfG = colOf(hmG.headers, function (h) { return norm(h) === 'cpf'; });
        var golCols = [];
        hmG.headers.forEach(function (h, c) { var m = h.trim().match(/^J(\d+)\s+Gols\s+(.+)$/i); if (m) golCols.push({ c: c, id: +m[1], team: m[2].trim() }); });
        for (var k = hmG.row + 1; k < rowsG.length; k++) {
          var rg = rowsG[k] || []; var nm = (rg[nomeG] || '').toString().trim(); var cp = (rg[cpfG] || '').toString();
          if (!nm && !cp) continue;
          var pp = getP(nm, cp);
          golCols.forEach(function (gc) {
            var jj = jogoById(gc.id); if (!jj) return;
            var arr = parseScorerCell(rg[gc.c]);
            pp.guesses[gc.id] = pp.guesses[gc.id] || {};
            if (norm(gc.team) === norm(jj.mandante)) pp.guesses[gc.id].homeScorers = arr;
            else if (norm(gc.team) === norm(jj.visitante)) pp.guesses[gc.id].awayScorers = arr;
          });
        }
      }
    }
    return Object.keys(byCpf).map(function (k) { return byCpf[k]; });
  }

  // ---------- API global ----------
  window.MM = {
    _ingest: ingest,
    go: function (t) { activeTab = t; render(); },
    busca: function (v) { search = v; var rk; clearTimeout(window.__t); window.__t = setTimeout(function () { renderRanking(); var inp = document.querySelector('.search'); if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); } }, 120); },
    detalhe: detalhe,
    limpar: function () { if (confirm('Remover todos os palpites carregados?')) { participants = []; save(LS_PART, participants); activeTab = 'carregar'; render(); } },
    upload: function (input) {
      var f = input.files[0]; if (!f) return;
      var msg = document.getElementById('upmsg'); msg.textContent = 'Lendo planilha...';
      var reader = new FileReader();
      reader.onload = function (e) {
        try {
          if (typeof XLSX === 'undefined') { msg.textContent = 'Biblioteca de leitura (XLSX) indisponível — verifique a internet.'; return; }
          var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
          var list = ingest(wb);
          if (!list.length) { msg.textContent = 'Nenhum participante encontrado na planilha.'; return; }
          participants = list; save(LS_PART, participants); activeTab = 'ranking'; render();
        } catch (err) { msg.textContent = 'Erro ao ler: ' + err.message; console.error(err); }
      };
      reader.readAsArrayBuffer(f);
    },
    exportar: function () {
      if (typeof XLSX === 'undefined') { alert('Biblioteca XLSX indisponível.'); return; }
      var rk = ranking();
      var headers = ['cpf', 'placar', 'artilheiros', 'totalpontos'];
      var data = rk.map(function (x) {
        var cpf = (x.cpf || (window.CPF_BY_NAME && window.CPF_BY_NAME[x.name]) || '').toString().replace(/\D/g, '');
        return [cpf, x.placarPts, x.scorerPts, x.total];
      });
      var ws = XLSX.utils.aoa_to_sheet([headers].concat(data));
      for (var i = 2; i <= data.length + 1; i++) { var ref = 'A' + i; if (ws[ref]) { ws[ref].t = 's'; ws[ref].z = '@'; } }
      var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Ranking');
      XLSX.writeFile(wb, 'IMPORTACAO_RANKING_BALERA_MATAMATA.xlsx', { bookType: 'xlsx' });
    }
  };

  // ---------- eventos ----------
  document.getElementById('tabs').addEventListener('click', function (e) { if (e.target.dataset.tab) { activeTab = e.target.dataset.tab; render(); } });
  view.addEventListener('input', function (e) {
    var t = e.target;
    if (t.dataset.res) {
      var id = +t.dataset.res, f = t.dataset.f, v = t.value.replace(/\D/g, '');
      if (v !== '') v = String(Math.min(20, +v));
      realResults[id] = realResults[id] || { home: '', away: '', homeScorers: [], awayScorers: [] };
      realResults[id][f] = v;
      // ajusta tamanho das listas de artilheiros
      var nh = realResults[id].home === '' ? 0 : +realResults[id].home;
      var na = realResults[id].away === '' ? 0 : +realResults[id].away;
      realResults[id].homeScorers = (realResults[id].homeScorers || []).slice(0, nh); while (realResults[id].homeScorers.length < nh) realResults[id].homeScorers.push('');
      realResults[id].awayScorers = (realResults[id].awayScorers || []).slice(0, na); while (realResults[id].awayScorers.length < na) realResults[id].awayScorers.push('');
      save(LS_RES, realResults);
      renderJogos();
    }
  });
  view.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset.game && t.dataset.side) {
      var id = +t.dataset.game, side = t.dataset.side, idx = +t.dataset.idx;
      realResults[id] = realResults[id] || { homeScorers: [], awayScorers: [] };
      var key = side === 'home' ? 'homeScorers' : 'awayScorers';
      realResults[id][key] = realResults[id][key] || [];
      realResults[id][key][idx] = t.value;
      save(LS_RES, realResults);
    }
  });

  render();
})();

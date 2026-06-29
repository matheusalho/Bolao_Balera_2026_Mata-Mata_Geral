/* Bolão Balera 2026 — Mata-Mata · App de Ranking (Geral)
   JS puro. Dados em window.CHAVEAMENTO e window.ELENCOS (dados-mm.js).
   Pontuação (fixa por time no jogo):
     Placar exato 10 · Vencedor/Empate 5 · Artilheiros (nomes) 10 · Artilheiros na ordem 15 (vale o maior). */
(function () {
  'use strict';
  var IS_AMARO = window.APP_VARIANT === 'amaro';
  var BRASIL_ONLY = !!window.BRASIL_ONLY; // versão "só jogos do Brasil" (dados já vêm filtrados; aqui só protege a publicação)
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
  var READ_ENDPOINT = (window.READ_ENDPOINT || '').trim(); // fluxo de leitura (auto-carrega palpites + resultados). Vazio = só upload manual.
  var WRITE_RESULTS_ENDPOINT = (window.WRITE_RESULTS_ENDPOINT || '').trim(); // fluxo p/ o Amaro publicar os resultados oficiais.
  var lastUpdated = load('mm_updatedAt', null);
  var autoState = ''; // '' | 'loading' | 'ok' | 'error'
  var activeTab = (participants.length || READ_ENDPOINT) ? 'ranking' : 'carregar';
  var search = '';
  var brGameId = null; // jogo do Brasil selecionado na aba "Ranking - Jogos do Brasil"
  var shareKey = null; // participante aberto no modal de detalhe (p/ compartilhar)

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
    if (activeTab === 'brasil') return renderRankingBrasil();
    if (activeTab === 'jogos') return renderJogos();
    if (activeTab === 'regras') return renderRegras();
    if (activeTab === 'carregar') return renderCarregar();
  }

  function badges(j) {
    return j.brasil ? '<span class="badge b-brasil">BRASIL</span>' : '';
  }

  function fmtUpdated() {
    if (!lastUpdated) return '';
    try { return new Date(lastUpdated).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; }
  }

  function renderRanking() {
    var refreshBtn = READ_ENDPOINT ? '<button class="btn ghost" onclick="MM.atualizar()" title="Recarregar palpites da planilha">↻ Atualizar</button>' : '';
    if (!participants.length) {
      var inner;
      if (autoState === 'loading') inner = '<div class="spinner"></div>Carregando palpites da planilha...';
      else if (READ_ENDPOINT && autoState === 'error') inner = 'Não foi possível carregar automaticamente.<br><br>' + refreshBtn + ' <button class="btn" onclick="MM.go(\'carregar\')">Carregar manualmente</button>';
      else inner = 'Nenhum palpite carregado ainda.<br><br>' + (READ_ENDPOINT ? refreshBtn + ' ' : '') + '<button class="btn ciano" onclick="MM.go(\'carregar\')">Carregar planilha</button>';
      view.innerHTML = '<div class="card"><div class="empty">' + inner + '</div></div>';
      return;
    }
    var rk = ranking();
    var finished = JOGOS.filter(function (j) { return hasResult(realResults[j.id]); }).length;
    var filtered = search ? rk.filter(function (x) { return norm(x.name).indexOf(norm(search)) >= 0; }) : rk;
    var medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
    var rows = filtered.map(function (x) {
      var cls = x.pos <= 3 ? ' class="p' + x.pos + '"' : '';
      return '<tr' + cls + ' onclick="MM.detalhe(\'' + esc(x.cpf || x.name) + '\')">' +
        '<td class="rankpos">' + (medals[x.pos] ? medals[x.pos] + ' ' : '') + x.pos + 'º</td>' +
        '<td class="nome">' + esc(x.name) + '</td>' +
        '<td>' + x.exact + '</td>' +
        '<td>' + x.placarPts + '</td>' +
        '<td>' + x.scorerPts + '</td>' +
        '<td><span class="pill tot">' + x.total + '</span></td>' +
        '</tr>';
    }).join('');
    var sub = participants.length + ' participantes · ' + finished + '/' + JOGOS.length + ' jogos com resultado'
      + (lastUpdated ? ' · atualizado ' + fmtUpdated() : '')
      + (autoState === 'loading' ? ' <span class="loadingdot">• atualizando…</span>' : '');
    view.innerHTML =
      '<div class="card">' +
      '<div class="hd"><div><h2>' + (BRASIL_ONLY ? 'Ranking — Jogos do Brasil' : 'Ranking Geral') + '</h2><div class="muted">' + sub + '</div></div>' +
      '<div class="hd-actions">' + refreshBtn + '<input class="search" placeholder="Buscar participante..." value="' + esc(search) + '" oninput="MM.busca(this.value)"></div></div>' +
      '<div class="tablewrap"><table><thead><tr>' +
      '<th>Pos</th><th class="nome">Participante</th><th title="Placares exatos (cravadas)">Cravadas</th><th title="Pontos de placar (10/5)">Placar</th><th title="Pontos de artilheiros (10/15)">Artilheiros</th><th>Total</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
      (IS_AMARO ? '<div class="hd" style="border-top:1px solid var(--linha);border-bottom:0"><div class="muted">Exportar ranking no layout da Intranet</div><button class="btn ouro" onclick="MM.exportar()">Exportar Excel</button></div>' : '') +
      '</div>';
  }

  // ---------- Ranking restrito aos jogos do Brasil ----------
  function brasilGames() {
    return JOGOS.filter(function (j) { return norm(j.mandante) === 'brasil' || norm(j.visitante) === 'brasil'; });
  }
  function rankBrasil(gameId) {
    var r = realResults[gameId];
    var arr = participants.map(function (p) {
      var g = (p.guesses || {})[gameId] || {};
      var ps = placarScore(g, r);
      var hs = scorerScore(g.homeScorers, r ? r.homeScorers : null);
      var as = scorerScore(g.awayScorers, r ? r.awayScorers : null);
      return { name: p.name, cpf: p.cpf, g: g, placarPts: ps.pts, scorerPts: hs.pts + as.pts, total: ps.pts + hs.pts + as.pts };
    }).sort(function (a, b) { return b.total - a.total || b.placarPts - a.placarPts || a.name.localeCompare(b.name); });
    arr.forEach(function (x, i) { x.pos = i + 1; });
    return arr;
  }
  function renderRankingBrasil() {
    if (!participants.length) {
      view.innerHTML = '<div class="card"><div class="empty">Nenhum palpite carregado ainda.' + (READ_ENDPOINT ? '<br><br><button class="btn ciano" onclick="MM.atualizar()">Atualizar agora</button>' : '') + '</div></div>';
      return;
    }
    var games = brasilGames();
    if (!games.length) { view.innerHTML = '<div class="card"><div class="empty">Nenhum jogo do Brasil definido ainda.</div></div>'; return; }
    if (brGameId == null || !games.some(function (j) { return j.id === brGameId; })) brGameId = games[0].id;
    var j = jogoById(brGameId);
    var r = realResults[brGameId];
    var hasR = hasResult(r);
    var rk = rankBrasil(brGameId);
    var filtered = search ? rk.filter(function (x) { return norm(x.name).indexOf(norm(search)) >= 0; }) : rk;
    var medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
    var rows = filtered.map(function (x) {
      var cls = (hasR && x.pos <= 3) ? ' class="p' + x.pos + '"' : '';
      var pal = (x.g && x.g.home !== undefined && x.g.home !== '') ? esc(x.g.home + 'x' + x.g.away) : '—';
      return '<tr' + cls + ' onclick="MM.detalhe(\'' + esc(x.cpf || x.name) + '\')">' +
        '<td class="rankpos">' + ((hasR && medals[x.pos]) ? medals[x.pos] + ' ' : '') + x.pos + 'º</td>' +
        '<td class="nome">' + esc(x.name) + '</td>' +
        '<td>' + pal + '</td>' +
        '<td>' + x.placarPts + '</td>' +
        '<td>' + x.scorerPts + '</td>' +
        '<td><span class="pill tot">' + x.total + '</span></td>' +
        '</tr>';
    }).join('');
    var options = games.map(function (g) {
      var lbl = g.mandante + ' x ' + g.visitante + (g.dataHora ? ' - ' + g.dataHora : '');
      return '<option value="' + g.id + '"' + (g.id === brGameId ? ' selected' : '') + '>' + esc(lbl) + '</option>';
    }).join('');
    var sub = (hasR ? 'Resultado oficial: ' + esc(j.mandante + ' ' + r.home + ' x ' + r.away + ' ' + j.visitante) : 'Aguardando o resultado do jogo') + ' · ' + participants.length + ' participantes';
    view.innerHTML =
      '<div class="card">' +
      '<div class="hd"><div><h2>Ranking — Jogos do Brasil</h2><div class="muted">' + sub + '</div></div>' +
      '<div class="hd-actions">' + (READ_ENDPOINT ? '<button class="btn ghost" onclick="MM.atualizar()">↻ Atualizar</button>' : '') + '<input class="search" placeholder="Buscar participante..." value="' + esc(search) + '" oninput="MM.busca(this.value)"></div></div>' +
      '<div class="filters"><label for="brsel">Jogo do Brasil:</label><select id="brsel" onchange="MM.selBrasil(this.value)">' + options + '</select></div>' +
      '<div class="tablewrap"><table><thead><tr><th>Pos</th><th class="nome">Participante</th><th title="Palpite de placar">Palpite</th><th title="Pontos de placar (10/5)">Placar</th><th title="Pontos de artilheiros (10/15)">Artilheiros</th><th>Total</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '</div>';
  }

  function scorerEditor(j, side, team, n, values, ro) {
    if (n <= 0) return '';
    var opts = playersOf(team).concat([GOL_CONTRA]);
    var rows = '';
    for (var i = 0; i < n; i++) {
      var val = (values && values[i]) || '';
      var os = '<option value="">— artilheiro —</option>' + opts.map(function (nm) {
        return '<option value="' + esc(nm) + '"' + (norm(nm) === norm(val) ? ' selected' : '') + '>' + esc(nm) + '</option>';
      }).join('');
      rows += '<div class="srow"><span class="sidx">' + (i + 1) + '</span><select ' + (ro ? 'disabled ' : '') + 'data-game="' + j.id + '" data-side="' + side + '" data-idx="' + i + '">' + os + '</select></div>';
    }
    return '<div class="scol"><h4>Gols de ' + esc(team) + '</h4>' + rows + '</div>';
  }

  function renderJogos() {
    var ro = !IS_AMARO; // só o Amaro edita/publica (inclusive Amaro Brasil — a gravação é incremental/merge, não apaga os outros jogos)
    var cards = JOGOS.map(function (j) {
      var r = realResults[j.id] || { home: '', away: '', homeScorers: [], awayScorers: [] };
      var nh = r.home === '' || r.home == null ? 0 : +r.home;
      var na = r.away === '' || r.away == null ? 0 : +r.away;
      var dis = ro ? ' disabled' : '';
      return '<div class="game' + (j.brasil ? ' brasil' : '') + '">' +
        '<div class="gh"><span class="gnum">J' + j.id + '</span><span>' + badges(j) + '</span></div>' +
        '<div class="gscore">' +
        '<span class="tn h">' + esc(j.mandante) + '</span>' +
        '<span class="sc"><input type="text" inputmode="numeric"' + dis + ' value="' + (r.home === undefined ? '' : r.home) + '" data-res="' + j.id + '" data-f="home"><span class="sx">x</span><input type="text" inputmode="numeric"' + dis + ' value="' + (r.away === undefined ? '' : r.away) + '" data-res="' + j.id + '" data-f="away"></span>' +
        '<span class="tn">' + esc(j.visitante) + '</span>' +
        '</div>' +
        ((nh > 0 || na > 0) ? '<div class="scorers">' + scorerEditor(j, 'home', j.mandante, nh, r.homeScorers, ro) + scorerEditor(j, 'away', j.visitante, na, r.awayScorers, ro) + '</div>' : '') +
        '</div>';
    }).join('');
    var faseTxt = (window.CHAVEAMENTO && window.CHAVEAMENTO.faseAtual) ? window.CHAVEAMENTO.faseAtual : '';
    var head = ro
      ? (faseTxt ? faseTxt + ' · ' : '') + 'Resultados oficiais (somente leitura), atualizados pelo responsável.'
      : (faseTxt ? faseTxt + ' · ' : '') + 'Informe o placar e os artilheiros (na ordem) e clique em <b>Publicar resultados</b> para todos verem.';
    var actions = IS_AMARO
      ? '<button class="btn ciano" onclick="MM.publicarResultados()">Publicar resultados</button>'
      : (READ_ENDPOINT ? '<button class="btn ghost" onclick="MM.atualizar()">↻ Atualizar</button>' : '');
    view.innerHTML = '<div class="card"><div class="hd"><div><h2>Jogos e Resultados</h2><div class="muted">' + head + '</div></div>' + actions + '</div>' +
      '<p id="pubmsg" class="note" style="display:none"></p>' +
      '<div class="note">Os pontos contam apenas para os jogos com placar preenchido.</div>' +
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
    var autoBlock = READ_ENDPOINT
      ? '<p class="muted">⚡ <b>Carregamento automático ativo</b> — os palpites são lidos da planilha do SharePoint. <button class="btn ghost" onclick="MM.atualizar()">↻ Atualizar agora</button></p><hr style="border:0;border-top:1px solid var(--linha);margin:16px 0"><p class="muted">Ou carregue manualmente um arquivo:</p>'
      : '<p class="muted">Selecione a planilha <b>Palpites - Bolão Balera 2026 - Mata-Mata.xlsx</b> (abas “Palpites Placar” e “Palpites Gols por Jogador”). O app lê as duas abas e cruza por CPF.</p>';
    view.innerHTML = '<div class="card"><div class="hd"><h2>Carregar Palpites</h2></div>' +
      '<div class="uploadzone">' +
      autoBlock +
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
    shareKey = key;
    var s = scoreParticipant(p);
    var stType = function (t) { return t === 'exact' ? 'Cravou +10' : t === 'winner' ? 'Vencedor +5' : t === 'order' ? 'Ordem +15' : t === 'names' ? 'Nomes +10' : ''; };
    var lista = function (arr) {
      arr = (arr || []).filter(function (x) { return x; });
      if (!arr.length) return '<span class="none">— sem gols —</span>';
      return '<ol>' + arr.map(function (nm, i) { return '<li><span class="n">' + (i + 1) + '</span>' + esc(nm) + '</li>'; }).join('') + '</ol>';
    };
    var cards = JOGOS.map(function (j) {
      var g = (p.guesses || {})[j.id] || {};
      var r = realResults[j.id];
      var hasR = hasResult(r);
      var ps = placarScore(g, r);
      var hs = scorerScore(g.homeScorers, hasR ? r.homeScorers : null);
      var as = scorerScore(g.awayScorers, hasR ? r.awayScorers : null);
      var gamePts = ps.pts + hs.pts + as.pts;
      var hasPalpite = g.home !== undefined && g.home !== '' && g.home !== null;
      var scoreTxt = hasPalpite ? (g.home + '<small>x</small>' + g.away) : '<small>sem palpite</small>';
      var ptsBadge = hasR ? ('<span class="dpts' + (gamePts ? '' : ' zero') + '">+' + gamePts + '</span>') : '<span class="dpts wait">a jogar</span>';
      var realLine = hasR ? ('<div class="dreal">Resultado: <b>' + esc(j.mandante) + ' ' + r.home + ' x ' + r.away + ' ' + esc(j.visitante) + '</b>' + (stType(ps.type) ? ' · ' + stType(ps.type) : ' · placar 0') + '</div>') : '';
      return '<div class="dgame' + (j.brasil ? ' br' : '') + '">' +
        '<div class="dgh"><span class="gnum">J' + j.id + '</span>' +
        '<span class="dteam">' + esc(j.mandante) + '</span>' +
        '<span class="dscore ' + (hasR ? ps.type : '') + '">' + scoreTxt + '</span>' +
        '<span class="dteam">' + esc(j.visitante) + '</span>' +
        (j.brasil ? '<span class="badge b-brasil">BR</span>' : '') + ptsBadge + '</div>' +
        realLine +
        '<div class="dscorers">' +
        '<div class="dcol' + ((hs.type === 'order' || hs.type === 'names') ? ' hit' : '') + '"><h5>Gols ' + esc(j.mandante) + (hs.pts ? ' · +' + hs.pts : '') + '</h5>' + lista(g.homeScorers) + '</div>' +
        '<div class="dcol' + ((as.type === 'order' || as.type === 'names') ? ' hit' : '') + '"><h5>Gols ' + esc(j.visitante) + (as.pts ? ' · +' + as.pts : '') + '</h5>' + lista(g.awayScorers) + '</div>' +
        '</div></div>';
    }).join('');
    var sum = '<div class="dsum"><span class="chip tot">' + s.total + ' pts</span><span class="chip">Placar ' + s.placarPts + '</span><span class="chip">Artilheiros ' + s.scorerPts + '</span><span class="chip">Cravadas ' + s.exact + '</span></div>';
    var m = document.createElement('div'); m.className = 'modal-bg'; m.onclick = function () { m.remove(); };
    m.innerHTML = '<div class="modal modal-detalhe" onclick="event.stopPropagation()">' +
      '<div class="dhead"><h3>' + esc(p.name) + '</h3><div class="dhead-btns"><button class="btn ciano dshare" onclick="MM.compartilhar()">↗ Compartilhar</button><button class="dclose" aria-label="Fechar" onclick="this.closest(\'.modal-bg\').remove()">✕</button></div></div>' +
      sum +
      '<div class="dgames">' + cards + '</div></div>';
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

  // ---------- carregamento automático (fluxo de leitura) ----------
  // Espera JSON: { participants:[{name,guesses}], realResults?:{...}, updatedAt? }
  function autoLoad(manual) {
    if (!READ_ENDPOINT) { if (manual) { activeTab = 'carregar'; render(); } return; }
    autoState = 'loading';
    if (activeTab === 'ranking') renderRanking();
    fetch(READ_ENDPOINT, { method: 'POST', cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        var d = (data && data.result) ? data.result : data; // tolera resposta aninhada em "result"
        var list = d.participants || (Array.isArray(d) ? d : null);
        if (list && list.length) { participants = list; save(LS_PART, participants); }
        if (d.realResults && Object.keys(d.realResults).length) {
          if (IS_AMARO) { // não sobrescreve edições locais ainda não publicadas
            Object.keys(d.realResults).forEach(function (id) { if (!hasResult(realResults[id])) realResults[id] = d.realResults[id]; });
          } else { // Geral: resultados oficiais mandam
            realResults = d.realResults;
          }
          save(LS_RES, realResults);
        }
        lastUpdated = d.updatedAt || new Date().toISOString();
        save('mm_updatedAt', lastUpdated);
        autoState = 'ok';
        if (activeTab === 'carregar' && participants.length) activeTab = 'ranking';
        render();
      })
      .catch(function (e) { autoState = 'error'; console.error('autoLoad falhou:', e); render(); });
  }

  // ---------- API global ----------
  window.MM = {
    _ingest: ingest,
    go: function (t) { activeTab = t; render(); },
    atualizar: function () { autoLoad(true); },
    selBrasil: function (id) { brGameId = +id; renderRankingBrasil(); },
    compartilhar: function () {
      if (typeof Share === 'undefined') { alert('Módulo de compartilhamento indisponível.'); return; }
      var p = participants.find(function (x) { return (x.cpf || x.name) === shareKey; });
      if (!p) return;
      var entry = ranking().find(function (x) { return (x.cpf || x.name) === shareKey; });
      Share.open({ name: p.name, guesses: p.guesses || {}, pos: entry ? entry.pos : null, total: entry ? entry.total : 0 });
    },
    publicarResultados: function () {
      var msg = document.getElementById('pubmsg');
      function show(t) { if (msg) { msg.style.display = 'block'; msg.textContent = t; } }
      if (!WRITE_RESULTS_ENDPOINT) { show('Endpoint de publicação não configurado (config.js → WRITE_RESULTS_ENDPOINT).'); return; }
      var results = JOGOS.filter(function (j) { return hasResult(realResults[j.id]); }).map(function (j) {
        var r = realResults[j.id];
        return { matchId: j.id, mandante: j.mandante, visitante: j.visitante, home: +r.home, away: +r.away,
          homeScorers: (r.homeScorers || []).filter(Boolean), awayScorers: (r.awayScorers || []).filter(Boolean) };
      });
      show('Publicando ' + results.length + ' jogo(s)...');
      fetch(WRITE_RESULTS_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ results: results }) })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
        .then(function () { show('✓ Resultados publicados (' + results.length + ' jogos). Os colaboradores já veem o ranking atualizado.'); })
        .catch(function (e) { show('Falha ao publicar: ' + e.message); });
    },
    busca: function (v) { search = v; clearTimeout(window.__t); window.__t = setTimeout(function () { (activeTab === 'brasil' ? renderRankingBrasil : renderRanking)(); var inp = document.querySelector('.search'); if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); } }, 120); },
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

  if (IS_AMARO) {
    var _h1 = document.querySelector('header h1'); if (_h1) _h1.textContent = 'Mata-Mata · Ranking + Exportação';
    var _sub = document.querySelector('header .sub'); if (_sub) _sub.textContent = 'Bolão Copa 2026 · Amaro';
    document.title = 'Bolão BALERA — Mata-Mata 2026 · Ranking (Amaro / Intranet)';
  }
  if (BRASIL_ONLY) {
    var _hb = document.querySelector('header h1'); if (_hb) _hb.textContent = 'Jogos do Brasil' + (IS_AMARO ? ' · Exportação' : '');
    var _sb = document.querySelector('header .sub'); if (_sb) _sb.textContent = 'Bolão Copa 2026' + (IS_AMARO ? ' · Amaro' : '');
    document.querySelectorAll('#tabs button').forEach(function (b) {
      if (b.dataset.tab === 'ranking') b.textContent = 'Ranking';
      if (b.dataset.tab === 'brasil') b.textContent = 'Por jogo';
    });
    document.title = 'Bolão BALERA — Jogos do Brasil' + (IS_AMARO ? ' (Amaro)' : '');
  }
  render();
  if (READ_ENDPOINT) autoLoad(false);
})();

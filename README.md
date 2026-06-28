# Bolão Balera 2026 — Mata-Mata · Ranking (Geral)

App de acompanhamento do ranking da fase de Mata-Mata (para os colaboradores). HTML autocontido + JS puro; sem build.

## Arquivos
- `index.html` — página e estilos.
- `app.js` — lógica (pontuação, ranking, resultados, ingestão).
- `dados-mm.js` — dados (jogos do mata-mata + elencos). **Gerado** de `dados_mata-mata/*.json`; para alterar jogos/elencos, edite os JSON e regere (`node -e ...` que cria `dados-mm.js`) e copie para cá.
- Depende de SheetJS (XLSX) via CDN (`cdn.jsdelivr.net`) para ler/exportar planilhas.

## Como usar
1. Abra `index.html` (ou hospede a pasta em um servidor estático).
2. **Carregar Palpites**: selecione a planilha `Palpites - Bolão Balera 2026 - Mata-Mata.xlsx` (preenchida). O app lê as abas “Palpites Placar” e “Palpites Gols por Jogador” e cruza por CPF.
3. **Jogos e Resultados**: informe o placar real e os artilheiros na ordem dos gols (por time). Salvo no navegador (localStorage).
4. **Ranking Atualizado**: classificação calculada automaticamente. Clique em um participante para ver a quebra de pontos por jogo.

## Pontuação (fixa por time no jogo)
- Placar exato **10** · Vencedor/Empate **5**
- Artilheiros do time (nomes) **10** · Artilheiros na ordem **15** (vale o maior; não soma)
- Avaliado para cada time do jogo. Desempate: total → cravadas → ordem → nomes → vencedores.

> A variante **Amaro** (`../Bolao_Balera_2026_Mata-Mata_Amaro`) é idêntica + botão **Exportar Excel** para a Intranet.

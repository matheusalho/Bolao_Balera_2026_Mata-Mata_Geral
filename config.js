/* ============================================================================
 * Configuração do app de Ranking (Geral)
 * ----------------------------------------------------------------------------
 * READ_ENDPOINT: URL do "fluxo de leitura" do Power Automate (gatilho HTTP GET)
 * que devolve os palpites em JSON: { participants:[{name,guesses}], updatedAt }.
 *   - Vazio  -> carregamento MANUAL (aba "Carregar Palpites").
 *   - Preenchido -> a página busca os palpites automaticamente ao abrir,
 *     e mostra o botão "↻ Atualizar".
 * Veja Backend_Mata-Mata/GUIA-Leitura-Ranking.md para criar o fluxo.
 * ========================================================================== */
window.READ_ENDPOINT = '';

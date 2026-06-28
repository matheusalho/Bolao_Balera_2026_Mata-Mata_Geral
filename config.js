/* ============================================================================
 * Configuração do app de Ranking (Geral)
 * ----------------------------------------------------------------------------
 * READ_ENDPOINT: URL do "fluxo de leitura" do Power Automate (Ler_Palpites)
 * que devolve os palpites em JSON: { participants:[{name,guesses}], updatedAt }.
 * O app chama via POST (corpo vazio). Vazio aqui = carregamento manual.
 * Observação: esta URL fica pública no site; o fluxo de leitura devolve os
 * palpites SEM CPF. Veja Backend_Mata-Mata/GUIA-Leitura-Ranking.md.
 * ========================================================================== */
window.READ_ENDPOINT = 'https://defaulta4a0857a652e45f494b1685bad4ec3.bd.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/87f99646bea44827ac259babc7de547d/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=R3He56VcrkszdSsEyDA4niPMG-Ilz6ByPArrcUDpuLE';

/* Link usado no botão de compartilhar (CTA "Faça o seu palpite") e o rótulo exibido no card. */
window.PALPITES_URL = 'https://matheusalho.github.io/Palpites_Mata-Mata/';
window.SHARE_URL_LABEL = 'matheusalho.github.io/Palpites_Mata-Mata';

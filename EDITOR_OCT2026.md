# Melhorias do editor — 14/10/2026

Implementação na branch `fix/prisma-import-cutout-editor-oct2026`, versão de desenvolvimento 31. Não equivale a publicação no endereço de produção.

## Alterações e evidência

Caio esclareceu que a prioridade é o arquivo final salvo na galeria. A exportação e os ângulos salvos também usam canvas Display P3 quando suportado e JPEG 0,95, sem compensação de exposição. Corrigido um caminho adicional: Salvar na galeria guardava no projeto apenas um recorte de 240 × 300 em JPEG 0,8; agora mantém a montagem completa em JPEG 0,95. A exportação direta já era completa. Essa correção não comprova que o clareamento HDR foi resolvido.

- Cor: não foram encontrados controles automáticos de exposição, brilho ou saturação no fluxo de importação. O original permanece sem recompressão. A prévia passava por JPEG de 540 px/qualidade 0,82; agora usa até 1080 px/0,94. Os canvases fotográficos solicitam Display P3, com fallback do navegador para sRGB. A máscara/modelo continua separada da cor da fotografia. Não foi aplicada compensação artificial à pele.
- Cabelo: máscara mantém o componente principal conectado; fragmentos destacados deixam de ser preservados pelo antigo limiar de 8% da área. A faixa externa cai de 10 para 2 pixels da máscara de 1024 px; a transição de alpha é contínua e um pouco mais definida. Pode remover fios soltos ou objetos separados desejados: a ferramenta Restaurar continua disponível. Máscaras antigas são atualizadas ao editar, exceto no modo de fundo original; as imagens originais não são alteradas.
- Ordem: DateTimeOriginal, SubSecTimeOriginal e OffsetTimeOriginal são lidos nos dois formatos de byte TIFF; data vem antes da ordem numérica do nome (IMG_9 antes de IMG_12). Importação, faixas da montagem e referências da câmera usam o mesmo comparador. Metadados de fração/fuso entram no backup. Arquivos sem data ficam depois dos datados, ordenados pelo nome. Nome e data de modificação não inventam data de captura nem divisão Antes/Depois. Metadados removidos, sequências IMG reiniciadas e EXIF além do primeiro MB continuam ambíguos.
- Rotação: gesto acumula deltas angulares, atravessando ±180° sem salto e sem limite de voltas. Apenas o slider conserva seu intervalo.
- Lupa: aparece ao pintar com Apagar/Restaurar, acompanha o contato com ampliação 2,5×, desloca-se para não cobrir o dedo e fica dentro da janela. Não é incluída na exportação.
- Histórico: uma ação por pincelada, incluindo toque e interrupção do gesto. Apagar e Restaurar são reversíveis. Cada foto tem seu histórico; ação nova após desfazer descarta o ramo de refazer. Deltas de alpha limitam memória a aproximadamente 16 MB por foto, descartando apenas a reversibilidade das ações mais antigas, sem apagar a pintura. O histórico dura enquanto a foto permanece na sessão do editor; a máscara final continua persistida nos ângulos, mas a pilha de ações não é serializada para reabrir o app.
- Importação no iPhone: o diálogo é preparado no próprio toque de Importar, antes do seletor. Depois do evento de entrega dos arquivos, muda de “Aguardando fotos do iPhone” para “Importando”. Cancelamento fecha a espera. O app não controla a interface do seletor nativo nem seu preparo/download anterior ao evento de entrega.

## Validação

`node --test tests/*.test.cjs`: 31 testes aprovados. Incluem EXIF com fração inline e fuso, ordem numérica, máscara sintética, giro acumulado, histórico independente, reinício de recorte, restauração de backups e fluxo de importação. Sintaxe dos scripts e `git diff --check` verificados. Sem captura de tela ou interação com a tela do usuário.

Não foi feita comparação colorimétrica com um original HDR do iPhone; a imagem fornecida é uma montagem, não o par original/resultado. Display P3 amplia a preservação de gamut, mas não garante equivalência com a exibição HDR do Fotos. Prévia e exportação devem ser comparadas no mesmo aparelho. Fontes: [WebKit — Wide Gamut 2D Graphics using HTML Canvas](https://webkit.org/blog/12058/wide-gamut-2d-graphics-using-html-canvas/), [W3C — proposta de HDR no Canvas](https://lists.w3.org/Archives/Public/public-colorweb/2023Apr/att-0004/minimal-strawman-bf420a5c.pdf). A proposta de HDR não comprova suporte na versão do Safari de Caio.

Check no aparelho: importar fotos fora de ordem → conferir sequência e cor → recortar → apagar três pinceladas → desfazer duas → refazer uma → restaurar → girar além de 360° → salvar/reabrir a montagem. Conferir cabelo, cancelamento do seletor e se a espera aparece ao fechar a interface nativa.

## LOG DE EDIÇÃO
- 2026-10-14 11:44 -0300 · Codex — Registradas seis melhorias do editor, aviso antecipado de importação, 31 testes e limites de validação no iPhone/HDR.
- 2026-10-14 11:48 -0300 · Codex — Por esclarecimento de Caio, explicitado foco na imagem final e corrigido resultado do projeto de 240x300/JPEG0,8 para montagem completa/JPEG0,95; 32 testes aprovados; HDR ainda sem validação física.

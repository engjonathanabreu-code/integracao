# Verificação local de Projetos e Documentos

Este ambiente carrega o **App real** pela fixture de navegador já existente. O backend local usa PGlite (PostgreSQL WASM), o SQL de termos municipais e observações e as políticas de escopo da fixture de banco. Nenhum dado, segredo, sessão ou conexão de produção é usado. O HTML aplica CSP para impedir conexões remotas e a fixture também bloqueia requisições externas.

## Iniciar

Na raiz do projeto, em processos separados:

```powershell
npm run dev -- --host 127.0.0.1 --port 4178
node tests/projetos-documentos-server.mjs
```

Abrir `http://127.0.0.1:4178/tests/projetos-documentos.html?qaPerfil=Projetos`.
O login da fixture aceita e-mail/senha fictícios. O seletor inferior troca o perfil de teste e recarrega o App. A opção “Falhar rede RPC” simula falha antes de enviar os RPCs novos, sem apagar o rascunho do editor.

| Perfil | Município acessível | Objetivo |
| --- | --- | --- |
| Projetos | Município Teste A | Geometrias, unidade, memorial, termos, qualificações e observações |
| Outro Projetos | Município Teste A | Edição concorrente e autoria de observações |
| Topografia | Município Teste A | Regressão do acesso existente |
| Administrador | Municípios Teste A e B | Administração de modelos e observações |
| Consulta | Município Teste A | Negação de gravação por RPC |
| Financeiro | Município Teste A | Permissões existentes |
| Externo | Município Teste B | Isolamento entre municípios; é um perfil interno de Projetos limitado ao município B |
| Inativo | Município Teste A | Bloqueio de usuário inativo |

Núcleo A `10000000-0000-4000-8000-000000000201`, morador `morador_a` (Morador Canônico A), unidades `unidade-a` e `unidade-a-2`. O núcleo está antes da Topografia. Município A: `10000000-0000-4000-8000-000000000101`; município B termina em `102`.

## Persistência e limites

Os RPCs `integracao_documentos_observacoes_operar`, `integracao_termos_operar`, `integracao_qualificacoes_nucleo`, `integracao_gravar` e `integracao_oficio_reservar_numero` executam SQL real no backend local com `SET ROLE authenticated`, identidade e RLS correspondentes ao perfil escolhido. A gravação geral usa a função capturada e as migrações versionadas de reconciliação. Os guards reais de Projetos e de fluxo permanecem ativos. As requisições são serializadas para não misturar identidades na conexão única de PGlite. Observações, modelos, emissões, mapas, memoriais, unidades e auditoria persistem entre recargas e outras abas/sessões enquanto o processo Node estiver ativo.

O transporte de avisos realtime é simulado: uma leitura local periódica consulta a revisão PostgreSQL e entrega o evento para o mecanismo existente do App. As regras de escopo de município e seleção de contrato são fixtures explícitas; não são cópias de usuários/permissões reais. Os demais módulos continuam na fixture existente e não estão incluídos na validação deste bridge. Este harness não substitui a homologação com usuários reais e ambiente equivalente à produção.

Reiniciar o servidor cria um banco fictício novo. Os modelos iniciais dizem “Modelo fictício QA — sem validade”; não reproduzem modelos oficiais de municípios e não validam a cláusula de Ilhota.

Os arquivos `fixtures/projetos-nucleo.kml` e `fixtures/projetos-nucleo.geojson` contêm coordenadas fictícias, polígonos e um anel interno. O KML tem duas feições para testar a seleção.

## Verificação sem navegador

```powershell
node tests/projetos-documentos-server.mjs --selftest
node --test tests/projetos-documentos-persistencia.test.js
```

Esse modo inicializa outro banco descartável, consulta os três RPCs, salva observação formatada com checklist e a relê por outra identidade autorizada. Não abre uma porta nem faz conexão de rede.

O segundo comando verifica gravação de geometrias com anéis internos e memorial antes da Topografia, edição de uma unidade pelo planejador real do App, leitura como outra identidade e projeção em dispositivo vazio, idempotência, conflito real, isolamento municipal, bloqueio de Consulta/inativo, geometria inválida e tentativa de avanço indevido de etapa. Não exerce o navegador.

Nenhum arquivo deste harness é importado pela entrada de produção. Não há migração, publicação nem escrita em registros reais.

## Resultado registrado em 06/11/2026

Ambiente de desenvolvimento local Windows, Node `v24.19.0`, PGlite `0.3.14`, Vite `5.4.21`; snapshot local baseado em `ee837f02651d7c4351a84d17bee6026b536034b9`, com as alterações desta entrega ainda no workspace.

- `node scripts/verificar.mjs --build`: **1.060 testes aprovados, zero falhas, zero ignorados**, duração dos testes 98,67 s; bundle Vite concluído em 13,05 s. Esse é exatamente o script configurado para `npm run build` no `package.json`; foi invocado diretamente porque o lançador npm ficou sem iniciar no terminal.
- O log integral está em `projetos-documentos-build-20261106.log`. A primeira execução revelou três fixtures de teste do memorial incompatíveis com os novos refs; elas foram atualizadas sem remover asserts, e a execução integral posterior passou. O primeiro log foi conservado em `projetos-documentos-build-20261106-tentativa1.log`.
- `node --check` dos arquivos do harness e `git diff --check`: aprovados.
- O build emitiu avisos não bloqueantes de imports estáticos/dinâmicos compartilhados e bundle principal de 2,83 MB. Nenhuma biblioteca ou arquitetura foi substituída para eliminar esses avisos.
- Bundle principal validado: `dist/assets/index-B8cEasaj.js`; SHA-256 `7273552B115450BE3B42F6249CE1FAADEF91400ABF547545E579BA1F739CDC9B`.
- Esta validação comprova SQL, autorização, persistência, reconciliação e geração do bundle no ambiente isolado. Não representa validação visual desktop/iPad, uso de contas reais nem homologação/publicação em produção.

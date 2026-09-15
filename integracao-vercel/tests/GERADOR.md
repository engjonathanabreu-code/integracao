# Gerador, declarações, protocolo e representantes

## Modelos encontrados antes da alteração

Na configuração compartilhada não havia sobrescritas de `modelosDoc`. Os nove modelos padrão eram: contrato, procuração, requerimento de REURB, declarações de estado civil, renda, residência e posse, distrato e termo de compromisso. Os 177 formulários importados eram arquivos externos (sem equivalente destes modelos ou histórico de procurações).

Reutilizados `dec_estado_civil` (solteiro), `dec_renda` (renda e ocupação) e `dec_endereco` (residência por terceiro). Acrescentados `dec_uniao_estavel` e `dec_sem_renda`. O protocolo está em `requerimento_protocolo`, somente no núcleo. A edição continua usando `modelosDoc`, com a indicação de modelo alterado pela equipe e restauração do padrão.

## Regras e armazenamento

- Rótulo do cliente: Gerador; rota interna `comercial` preservada. O Comercial do núcleo continua sendo sua seção de condições de venda.
- O próprio sistema resolve os marcadores. Sexo desconhecido deixa os campos de concordância pendentes; não é deduzido pelo nome. A nacionalidade brasileira e as flexões de estado civil concordam com o sexo informado.
- Endereço de assinatura vem da residência do requerente ou do declarante terceiro. Renda inicial é a individual do requerente, sem confundir com renda familiar. Zero é valor válido.
- Campos de prefeitura/comarca em `ajustesMunicipio[municipioId]`, no complemento de configuração existente. Entradas e cópia do documento emitido ficam em `documentosGerados` do morador; o protocolo usa o histórico do núcleo.
- CRF disponível significa `n.checks.crfEmitida`: emitida pela prefeitura e cadastrada no sistema. Não exige registro prévio no cartório, que é justamente o objeto do pedido. Card próprio em Documentos da etapa Projeto, disponível também nas etapas seguintes para reemitir. Ao lado há acesso aos termos dos moradores que estão na etapa Projeto; estes continuam documentos individuais.
- Nenhuma nova tabela ou coluna, rota renomeada, dependência ou substituição por IA. A migração acrescenta funções e gatilhos de integridade para o histórico dos procuradores.
- A impressão/Word/HTML usa a mesma função de papel timbrado já existente. Configure o papel timbrado em Configurações. Históricos anteriores que só tinham metadados continuam exibindo esses metadados; o sistema não inventa um arquivo histórico que não foi armazenado.

## Limpeza executada em 15/09/2026

Consulta aos 11.063 complementos de moradores e à coleção legada: nenhuma procuração em `documentosGerados`. A contagem considera IDs/copias de representantes nas novas emissões e nomes nas condições das emissões antigas, uma ocorrência por documento. A exclusão foi revalidada na mesma transação, com proteção contra alteração concorrente. Uma cópia privada da configuração anterior foi preservada fora do repositório.

Mantido disponível: **Marcos Paulo Baucelli**, com OAB/SC 50.473 e CPF atualizado conforme solicitado (o CPF não está codificado no aplicativo).

Removidos, todos com **0 procurações emitidas** encontradas:

- Danusa Petters Ferrari Macedo
- André Luiz de Oliveira
- Jeizer Andre Poffo
- João Paulo da Silveira
- Cristine Balestreri
- Debora Fernandes Lourenço Scalco
- Gilmar Bispo da Silva Júnior
- Margarida da Silva Pires
- Juliano Souza Ragninni
- Jaqueline Lima Vilela
- Marcos Vinicius Almeida Bellincanta
- JOELICE BORTOLANZA CANALI
- VANDERLEI FAUSTINO DA SILVA

Marcados indisponíveis na limpeza: **nenhum**, pois nenhum tinha uso no histórico compartilhado consultado. Essa verificação não procura documentos exportados fora do sistema ou alterações que nunca chegaram ao servidor. A interface também considera o histórico já carregado localmente antes de permitir uma exclusão.

## Proteção permanente

A tela consulta a contagem completa no servidor, sem carregar os 11.063 moradores. Falha na consulta bloqueia excluir. A confirmação nomeia a pessoa e confere novamente o uso. O servidor também bloqueia a remoção usada e a nova emissão com representante removido/indisponível; a conferência contempla o formato legado de procurações. O nome de um representante usado é preservado para manter referências antigas por nome. A edição dos demais dados e a indisponibilidade continuam possíveis.

Corrigida a gravação da lista importada de representantes: ela era uma configuração com array, mas as alterações eram tratadas como registros individuais. Agora a mesma configuração é atualizada, inclusive quando a lista fica vazia, evitando reaparecimento ao recarregar.

As funções/gatilhos foram instalados no servidor durante a tarefa para proteger a limpeza. O SQL consolidado acompanha o PR. O restante do aplicativo depende da publicação deste PR.

## Verificação

- `node --test tests/*.test.js`: 85 testes passaram, incluindo toda a suíte anterior.
- `vite build`: passou.
- `/tests/modelos-html.html`: 29 testes DOM passaram (cinco declarações sem marcador, lacunas, terceiro, protocolo e regressões dos modelos/PRF).
- `tests/representantes-historico.sql`: execução com transação revertida, testando contagem 2, bloqueio de exclusão usada, exclusão sem uso, histórico após indisponibilidade e rejeição de nova procuração com indisponível.
- Interface real, com `tests/browser.html?gerador=1&mobile=1`: aba Gerador; declaração e download no histórico; terceiro preenchido e reaproveitado após sair/voltar; procuração antiga legível; confirmação de exclusão nomeada, exclusão sem uso e bloqueio com contagem 1.
- Núcleo em Projeto sem CRF: card separado e desabilitado. Com `&crf=1`: emissão e reemissão, mostrando duas emissões no histórico e autor/data.
- Celular: formulário ajustado à largura útil de 375px, sem transbordamento do aplicativo. A captura de exportação do ambiente de teste é isolada dos dados reais.

## Fora do escopo

Não foram preenchidos dados reais de prefeitura/comarca que não foram fornecidos, nem criados documentos históricos ausentes. Os textos seguem a especificação recebida. O requerimento lista seus anexos; não reúne automaticamente os arquivos em um pacote de protocolo.

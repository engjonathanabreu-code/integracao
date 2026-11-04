# Cônjuge beneficiário

No Cadastro, seção Cônjuge, o seletor **Cônjuge é beneficiário?** permite Sim/Não. Também está disponível nos cônjuges de outros requerentes. É necessário salvar o cadastro antes de gerar um novo documento.

- Sim e cadastros legados sem a marcação mantêm o comportamento anterior.
- Não exclui o cônjuge da qualificação automática de beneficiários e das assinaturas geradas; não apaga seu nome, CPF, vínculo civil ou documentos.
- Contrato e procuração também deixam vazios os marcadores específicos de cônjuge quando ele não é beneficiário. A declaração de estado civil conserva a informação matrimonial.
- Os dados matrimoniais e os requisitos documentais existentes continuam preservados. A escolha não decide se o caso exige anuência ou outra assinatura jurídica específica; conferir com o Jurídico.
- Qualificações editadas ou importadas, histórico de documentos e arquivos já emitidos não são reescritos. Modelos personalizados com nomes literais devem ser revisados manualmente; marcadores dinâmicos seguem a seleção.

Persistência em `conjuge.beneficiario` no JSON já existente, inclusive em `corequerentes[].conjuge`. Não exige migration, alteração de RLS ou atualização em massa. O seletor usa a mesma permissão de edição do cadastro. O requerente principal mantém sua função; a opção existente de benefício de outros requerentes continua em `corequerentes[].beneficiario`.

## Verificação

`node --test tests/conjuge-beneficiario*.test.js` cobre legado, sim/não, alternância, contrato/procuração, declaração civil, cônjuges de corequerentes, PJ/solteiro, histórico e patch/sincronização. `npm run build` executa a suíte completa e Vite.

## Validação manual

Com dados sintéticos, salvar Sim, reabrir e gerar contrato/procuração; marcar Não, salvar/reabrir e conferir qualificação e assinaturas; voltar a Sim e conferir restauração. Verificar declaração civil, modo somente leitura e modelos personalizados. Não usar contratos reais como massa de teste nem substituir documentos assinados. Confirmar resultado visual em ambiente com navegador disponível antes de afirmar validação visual.

Rollback: reverter somente o commit da funcionalidade; nenhum dado existente foi migrado ou removido. Após rollback, a versão anterior volta a ignorar a opção, portanto não gerar novos documentos para casos Não até revalidar o fluxo.

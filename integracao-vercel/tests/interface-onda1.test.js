import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {CAMPO_DO_ERRO_META,errosVisiveisMeta,confirmacaoRemocaoMeta,confirmacaoDescarteCadastro,avisoErrosCadastro,campoFaltando,irAoPrimeiroErro,MENSAGEM_CAMPO_FALTANDO,motivosBotaoBloqueado} from '../src/interface-regras.js';

const fonte=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const css=fonte.slice(fonte.indexOf('const CSS'),fonte.indexOf('function Modal('));
const trecho=(inicio,fim)=>fonte.slice(fonte.indexOf(inicio),fonte.indexOf(fim));

test('UI-M1: no celular a grade de formulário vira uma coluna mesmo com colunas definidas na própria janela',()=>{
 const regra=css.match(/@media \(max-width:640px\)\{\.rb \.fg\{([^}]*)\}\.rb \.fg>div\{([^}]*)\}/);
 assert.ok(regra,'regra de 640 px da grade .fg existe');
 // As janelas definem as colunas no atributo style; só !important vence esse estilo.
 assert.equal(regra[1],'grid-template-columns:1fr!important');
 assert.equal(regra[2],'grid-column:auto!important');
 const formulario=trecho('function ModalMetaERP(','function ModalDetalheMeta(');
 assert.match(formulario,/className="fg" style=\{\{ gridTemplateColumns: "1fr 1fr" \}\}/,'o formulário de meta usa a grade .fg coberta pela regra');
});

test('UI-M2: erro de meta só aparece no campo tocado ou depois de tentar salvar',()=>{
 const erros=['Informe o título da meta','Selecione ao menos um responsável','Informe o prazo final para responder','O prazo não pode ser antes da chegada','Mensagem ainda sem campo'];
 assert.deepEqual(errosVisiveisMeta(erros,{},false),{},'ao abrir, nenhum erro é mostrado');
 assert.deepEqual(errosVisiveisMeta(erros,{titulo:true},false),{titulo:'Informe o título da meta.'});
 assert.deepEqual(errosVisiveisMeta(erros,{},true),{titulo:'Informe o título da meta.',responsaveis:'Selecione ao menos um responsável.',
  prazoDev:'Informe o prazo final para responder. O prazo não pode ser antes da chegada.',geral:'Mensagem ainda sem campo.'});
 assert.deepEqual(errosVisiveisMeta([],{titulo:true},true),{});
 assert.deepEqual(errosVisiveisMeta(undefined),{});
});
test('UI-M2: toda validação do formulário de meta tem campo na tela, e Salvar não fica apagado por erro',()=>{
 const formulario=trecho('function ModalMetaERP(','function ModalDetalheMeta(');
 const mensagens=[...formulario.matchAll(/erros\.push\("([^"]+)"\)/g)].map(m=>m[1]);
 assert.ok(mensagens.length>=11,'validações localizadas no formulário');
 for(const m of mensagens)assert.ok(CAMPO_DO_ERRO_META[m],`mensagem sem campo: ${m}`);
 for(const campo of new Set(Object.values(CAMPO_DO_ERRO_META)))assert.ok(formulario.includes(`{ev.${campo}}`),`campo ${campo} mostra o próprio erro`);
 assert.doesNotMatch(formulario,/podeRetentar\(\) : erros\.length > 0/,'Salvar não é desabilitado pelos erros');
 assert.match(formulario,/if \(erros\.length\) \{ setTentouSalvar\(true\);[^\n]*return; \}/,'tentar salvar com erro revela os avisos e não grava');
 assert.match(formulario,/Título da nova meta \(obrigatório\)/);assert.match(formulario,/Responsáveis \(obrigatório\)/);
});

test('UI-M3: as ações da janela ficam num rodapé fixo, visível sem rolar até o fim',()=>{
 const regra=css.match(/\.rb \.modal-rodape\{([^}]*)\}/);
 assert.ok(regra,'estilo do rodapé existe');
 assert.match(regra[1],/position:sticky/);assert.match(regra[1],/bottom:0/);assert.match(regra[1],/background:var\(--card\)/,'o conteúdo rolado não aparece por trás dos botões');
 assert.match(css,/\.rb \.modal\{[^}]*overflow-y:auto/,'a própria janela é a área de rolagem em que o rodapé se fixa');
 const js=transformSync(trecho('function Modal(','function ModalMotivo('),{loader:'jsx',jsx:'transform'}).code;
 const Modal=new Function('React','useRef','useEffect','X',`${js};return Modal;`)(React,React.useRef,React.useEffect,()=>null);
 const h=React.createElement;
 const html=renderToStaticMarkup(h(Modal,{titulo:'Meta',onFechar(){},rodape:h('button',null,'Concluir')},h('p',null,'conteúdo longo')));
 assert.match(html,/<p>conteúdo longo<\/p><div class="[^"]*\bmodal-rodape\b[^"]*"[^>]*><button>Concluir<\/button><\/div>/);
 assert.doesNotMatch(renderToStaticMarkup(h(Modal,{titulo:'Sem ações',onFechar(){}},'x')),/modal-rodape/);
 const detalhe=trecho('function ModalDetalheMeta(','function CartaoMeta(');
 assert.match(detalhe,/rodape=\{<><button className="btn" onClick=\{fechar\}>Fechar<\/button>/,'Concluir, Editar, Excluir e Recusar seguem no rodapé da janela da meta');
});

test('UI-M4: remover item do checklist, anexo ou setor pergunta antes, no padrão de confirmação do app',()=>{
 const item=confirmacaoRemocaoMeta('checklist','Visitar as unidades');
 assert.deepEqual(Object.keys(item),['titulo','texto','rotuloBotao'],'mesmas propriedades do ModalConfirmar');
 assert.match(item.texto,/"Visitar as unidades"/);assert.equal(item.rotuloBotao,'Remover item');
 assert.match(confirmacaoRemocaoMeta('anexo','planta.pdf').texto,/"planta\.pdf"/);
 assert.match(confirmacaoRemocaoMeta('setor','Campo').texto,/"Campo"/);
 assert.match(confirmacaoRemocaoMeta('checklist','  ').texto,/Item sem título/);
 assert.throws(()=>confirmacaoRemocaoMeta('outro','x'),/desconhecido/);
 const detalhe=trecho('function ModalDetalheMeta(','function CartaoMeta(');
 // A lixeira só abre a pergunta; a alteração acontece dentro de onConfirmar.
 assert.match(detalhe,/onClick=\{\(\) => setRemocao\(\{ \.\.\.confirmacaoRemocaoMeta\("checklist", c\.titulo\), onConfirmar: \(\) => alterar\(/);
 assert.match(detalhe,/onClick=\{\(\) => setRemocao\(\{ \.\.\.confirmacaoRemocaoMeta\("anexo", a\.nome\), onConfirmar: \(\) => removerAnexo\(a\) \}\)\}/);
 assert.doesNotMatch(detalhe,/onClick=\{\(\) => (removerAnexo\(a\)|alterar\(\(q\) => \{ q\.checklist = q\.checklist\.filter)/,'nenhuma lixeira remove direto');
 assert.match(detalhe,/\{remocao && <div [^\n]*<ModalConfirmar \{\.\.\.remocao\}/);
 const pagina=trecho('function PaginaMetas(','function AbaMetasNucleo(');
 assert.match(pagina,/onClick=\{\(\) => setSetorRemocao\(\{ \.\.\.confirmacaoRemocaoMeta\("setor", s\.nome\), onConfirmar: \(\) => mutar\(/);
 assert.match(pagina,/\{setorRemocao && <ModalConfirmar \{\.\.\.setorRemocao\}/);
});

test('UI-M5: a linha do checklist é clicável e os alvos de toque têm 44 px no celular',()=>{
 const detalhe=trecho('function ModalDetalheMeta(','function CartaoMeta(');
 assert.match(detalhe,/className="flex items-center gap-2 linha-checklist"/);
 assert.match(detalhe,/<input id=\{`ck-\$\{c\.id\}`\} type="checkbox"/);
 assert.match(detalhe,/<label htmlFor=\{`ck-\$\{c\.id\}`\}[^\n]*\{c\.titulo\}/,'tocar no texto marca o item');
 const movel=css.match(/@media \(max-width:640px\)\{\.rb \.linha-checklist\{min-height:44px\}([^\n]*)\}\n/);
 assert.ok(movel,'regras de toque do celular existem');
 assert.match(movel[1],/\.rb \.linha-checklist input\[type=checkbox\],\.rb \.item-checklist input\[type=checkbox\]\{width:24px!important;height:24px!important/,'vence os 17 px definidos na própria caixa');
 assert.match(movel[1],/\.rb \.modal \.btn-icone\{width:44px;height:44px/);
 assert.match(movel[1],/\.rb \.modal \.btn\{min-height:44px\}/);
 assert.match(movel[1],/\.rb \.modal label\.tag\{min-height:44px\}/,'etiquetas de responsáveis');
 assert.match(css,/\.rb \.linha-checklist label\{flex:1;display:flex;[^}]*align-self:stretch\}/,'o texto ocupa a altura toda da linha');
});

test('UI-C1: Descartar da ficha pergunta antes e informa quantas alterações serão perdidas',()=>{
 assert.deepEqual(confirmacaoDescarteCadastro(1),{titulo:'Descartar as alterações da ficha?',texto:'1 alteração não salva será perdida. A ficha volta ao que estava salvo.',rotuloBotao:'Descartar 1 alteração'});
 assert.match(confirmacaoDescarteCadastro(7).texto,/^7 alterações não salvas serão perdidas\./);
 assert.equal(confirmacaoDescarteCadastro(7).rotuloBotao,'Descartar 7 alterações');
 assert.match(confirmacaoDescarteCadastro(0).texto,/^As alterações não salvas serão perdidas\./);
 const ficha=trecho('function PaginaProcesso(','function PaginaNucleo(');
 const botao=ficha.match(/<button[^\n]*>Descartar<\/button>/)[0];
 assert.match(botao,/onClick=\{\(\) => setModal\(\{ tipo: "confirmar", \.\.\.confirmacaoDescarteCadastro\(alterados\.length\), onConfirmar: \(\) => \{ setModal\(null\); baseFormulario\.current = /,'o rascunho só é desfeito dentro da confirmação');
 assert.equal(botao.split('setRascunho(').length,2,'um único caminho desfaz o rascunho');
 assert.match(ficha,/\{modal\?\.tipo === "confirmar" && <ModalConfirmar \{\.\.\.modal\} onFechar=\{\(\) => setModal\(null\)\} \/>\}/,'usa a confirmação já existente na ficha');
});

test('UI-C2: erros ao salvar a ficha ficam na barra de salvar e os campos são destacados',()=>{
 assert.deepEqual(avisoErrosCadastro([]),{mensagem:'',faltando:[]});
 assert.deepEqual(avisoErrosCadastro(['CPF do cônjuge','CEP da residência']),{mensagem:'Corrija antes de salvar: CPF do cônjuge, CEP da residência.',faltando:[]},'valor inválido já fica vermelho no próprio campo');
 assert.deepEqual(avisoErrosCadastro(['CPF do requerente, que é obrigatório a partir da etapa Contrato']).faltando,['requerente.cpf']);
 assert.deepEqual(avisoErrosCadastro(['CNPJ do requerente, que é obrigatório a partir da etapa Contrato','CEP do imóvel']).faltando,['requerente.cnpj']);
 assert.deepEqual(avisoErrosCadastro(['CPF do requerente']).faltando,[]);
 const form={faltando:['requerente.cpf']};
 assert.equal(campoFaltando(form,'requerente.cpf',''),MENSAGEM_CAMPO_FALTANDO);
 assert.equal(campoFaltando(form,'requerente.cpf','529.982.247-25'),'','some assim que o campo é preenchido');
 assert.equal(campoFaltando(form,'conjuge.cpf',''),'');assert.equal(campoFaltando({},'requerente.cpf',''),'','formulários sem a lista não mudam');
 const chamadas=[],campo={scrollIntoView:o=>chamadas.push(['rolar',o.block]),focus:()=>chamadas.push(['foco'])};
 assert.equal(irAoPrimeiroErro({querySelector:s=>s.includes(':not(:disabled)')?campo:null}),true);
 assert.deepEqual(chamadas,[['rolar','center'],['foco']]);
 assert.equal(irAoPrimeiroErro({querySelector:()=>null}),false);assert.equal(irAoPrimeiroErro(undefined),false);
 const ficha=trecho('function PaginaProcesso(','function PaginaNucleo(');
 // As mensagens de validação que o Salvar monta são as que a regra reconhece.
 for(const doc of ['CPF','CNPJ'])assert.ok(ficha.includes(`"${doc} do requerente, que é obrigatório a partir da etapa Contrato"`),doc);
 assert.match(ficha,/if \(invalidos\.length\) \{ setErroCadastro\(avisoCadastro\.mensagem\);[^\n]*irAoPrimeiroErro\(document\)[^\n]*return; \}/);
 assert.doesNotMatch(ficha,/setToast\(`Corrija antes de salvar/,'o aviso não depende mais do aviso que some');
 assert.match(ficha,/\{erroCadastro && <span role="alert">\{erroCadastro\}<\/span>\}/,'a barra de salvar mostra o aviso');
 assert.match(ficha,/\(sujo \|\| confirmandoCadastro \|\| !!tentativaCadastro\.current \|\| erroCadastro\) && \(/,'a barra continua na tela enquanto houver aviso');
 assert.match(fonte,/const erro = v && !cpfValido\(v\) \? "CPF inválido\. Confira os dígitos\." : campoFaltando\(form, path, v\);/);
 assert.match(fonte,/campoFaltando\(form, P\("cnpj"\), x\.cnpj\)/);
 assert.match(fonte,/const form = \{ rascunho, ia: iaPaths, faltando, set:/);
});

test('UI-C3: Novo morador diz por que Continuar está apagado',()=>{
 assert.equal(motivosBotaoBloqueado([]),'');assert.equal(motivosBotaoBloqueado(undefined),'');
 assert.equal(motivosBotaoBloqueado(['Informe o nome do requerente','Informe o CPF, ele é obrigatório']),'Para continuar: Informe o nome do requerente; Informe o CPF, ele é obrigatório.');
 assert.equal(motivosBotaoBloqueado(['Escolha a remessa','Escolha a remessa','Este código já existe. Confira o prefixo no cadastro do município.']),'Para continuar: Escolha a remessa; Este código já existe. Confira o prefixo no cadastro do município.','sem repetição nem ponto dobrado');
 assert.equal(motivosBotaoBloqueado(['Informe o título'],'Para salvar'),'Para salvar: Informe o título.');
 const morador=trecho('function ModalMorador(','function ModalVincular(');
 const rodape=morador.match(/rodape=\{<>[^\n]*Continuar para os documentos/)[0];
 assert.match(rodape,/\{erros\.length > 0 && <span id="mmotivos" className="ajuda" role="status"[^>]*>\{motivosBotaoBloqueado\(erros\)\}<\/span>\}/,'os motivos vêm da mesma lista que apaga o botão');
 assert.match(rodape,/disabled=\{erros\.length > 0\} aria-describedby=\{erros\.length > 0 \? "mmotivos" : undefined\}/,'leitor de tela anuncia o motivo junto do botão');
});

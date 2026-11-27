import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {metasAguardandoAprovacao,diasAguardandoAprovacao,aprovarMetasEmLote,resumoAprovacaoEmLote} from '../src/metas-uso.js';

const fonte=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const meta=(id,extra={})=>({id,titulo:`Meta ${id}`,status:'Aguardando aprovação',responsaveis:['r1'],solicitacaoConclusao:{id:`s${id}`,solicitanteId:'r1',data:'2026-11-20T15:00:00.000Z'},...extra});

test('USO-M3: a fila traz só o que eu posso aprovar, do pedido mais antigo para o mais novo',()=>{
 const metas=[meta('c',{solicitacaoConclusao:{data:'2026-11-22T10:00:00Z'}}),meta('a',{solicitacaoConclusao:{data:'2026-11-10T10:00:00Z'}}),
  meta('x',{status:'Em andamento'}),meta('b',{solicitacaoConclusao:null}),meta('d',{solicitacaoConclusao:{data:'2026-11-10T10:00:00Z'},titulo:'Antes'})];
 const pendente=m=>m.status==='Aguardando aprovação';
 assert.deepEqual(metasAguardandoAprovacao(metas,pendente).map(m=>m.id),['d','a','c','b']);
 assert.deepEqual(metasAguardandoAprovacao(metas,()=>false),[],'sem permissão de aprovar a fila fica vazia');
 assert.deepEqual(metasAguardandoAprovacao(null,pendente),[]);
 assert.equal(diasAguardandoAprovacao(meta('a'),'2026-11-29'),9);
 assert.equal(diasAguardandoAprovacao(meta('a'),'2026-11-20'),0);
 // 01h UTC ainda é o dia civil anterior em Brasília.
 assert.equal(diasAguardandoAprovacao(meta('a',{solicitacaoConclusao:{data:'2026-11-21T01:00:00Z'}}),'2026-11-21'),1);
 assert.equal(diasAguardandoAprovacao(meta('a',{solicitacaoConclusao:null}),'2026-11-29'),null);
});

test('USO-M3: o lote chama a aprovação individual uma vez por meta, na ordem, e separa os desfechos',async()=>{
 const chamadas=[];
 const aprovar=m=>{chamadas.push(m.id);
  if(m.id==='b')throw new Error('A meta não aguarda mais aprovação.');
  if(m.id==='c')return Promise.reject(Object.assign(new Error('Enviando em segundo plano'),{code:'CONFIRMACAO_SEGUNDO_PLANO'}));
  if(m.id==='d')return Promise.reject(Object.assign(new Error('Conflito'),{code:'PT409'}));
  return m.id==='e'?undefined:Promise.resolve();};
 const r=await aprovarMetasEmLote(['a','b','c','d','e'].map(id=>meta(id)),aprovar);
 assert.deepEqual(chamadas,['a','b','c','d','e'],'uma intenção por meta; a falha de uma não interrompe as demais');
 assert.deepEqual(r.aprovadas,['a','e']);assert.deepEqual(r.emEnvio,['c']);
 assert.deepEqual(r.falhas,[{id:'b',titulo:'Meta b',mensagem:'A meta não aguarda mais aprovação.'},{id:'d',titulo:'Meta d',mensagem:'Conflito'}]);
 assert.equal(resumoAprovacaoEmLote(r),'2 conclusões aprovadas; 1 aprovação em envio em segundo plano; 2 metas não foram aprovadas.');
 assert.equal(resumoAprovacaoEmLote({aprovadas:['a'],emEnvio:[],falhas:[]}),'1 conclusão aprovada.');
 assert.equal(resumoAprovacaoEmLote(await aprovarMetasEmLote([],aprovar)),'Nenhuma meta selecionada.');
});

test('USO-M3: botão individual e lote gravam pela mesma mutação, com a permissão atual',()=>{
 const inicio=fonte.indexOf('function aprovarConclusaoMeta(d, metaId, usuario) {'),fim=fonte.indexOf('function useConfirmacaoEdicao(');
 assert.ok(inicio>0&&fim>inicio);
 const registros=[],avisos=[];
 const aprovarConclusaoMeta=new Function('podeAprovarConclusao','registrarHistoricoMeta','novaNotificacao',`${fonte.slice(inicio,fim)};return aprovarConclusaoMeta;`)(
  (m,u)=>u.aprova===true&&m.status==='Aguardando aprovação',(d,q,acao,descricao,u)=>registros.push([q.id,acao,descricao,u.id]),(d,n)=>avisos.push(n));
 const diretor={id:'d1',nome:'Dira',aprova:true},d={metas:[meta('a'),meta('b',{status:'Em andamento'})]};
 assert.equal(aprovarConclusaoMeta(d,'a',diretor),d);
 assert.equal(d.metas[0].status,'Concluído');assert.equal(d.metas[0].solicitacaoConclusao,null);
 assert.deepEqual(registros,[['a','Conclusão aprovada','Dira aprovou a conclusão da meta.','d1']]);
 assert.deepEqual(avisos,[{titulo:'Conclusão aprovada: Meta a',texto:'Dira aprovou a conclusão.',rota:{pag:'metas'},usuarios:['r1']}]);
 // Repetir, aprovar o que não está pendente, meta inexistente ou sem permissão: recusa sem alterar nada.
 for(const [id,u] of [['a',diretor],['b',diretor],['zz',diretor]])assert.throws(()=>aprovarConclusaoMeta(d,id,u),/não aguarda mais aprovação/);
 const outro={metas:[meta('a')]};assert.throws(()=>aprovarConclusaoMeta(outro,'a',{id:'x',nome:'X',aprova:false}),/não aguarda mais aprovação/);
 assert.equal(outro.metas[0].status,'Aguardando aprovação');assert.equal(registros.length,1);assert.equal(avisos.length,1);

 const modal=fonte.slice(fonte.indexOf('function ModalDetalheMeta('),fonte.indexOf('function CartaoMeta('));
 assert.match(modal,/const aprovar = \(\) => envio\.executar\(d => aprovarConclusaoMeta\(d, m\.id, usuario\), "Meta: conclusão aprovada", \{ detalhe: m\.titulo \}, "Conclusão aprovada\.", onFechar\);/);
 const pagina=fonte.slice(fonte.indexOf('function PaginaMetas('),fonte.indexOf('function AbaMetasNucleo('));
 const uso=pagina.split('\n').find(l=>l.includes('<AprovacoesPendentesMetas'));
 assert.match(uso,/aprovaMetas\(usuario\) && <AprovacoesPendentesMetas metas=\{todasVisiveis\}/,'só para quem aprova, sobre as metas que a pessoa já vê');
 assert.match(uso,/podeAprovar=\{\(m\) => podeAprovarConclusao\(m, usuario\)\}/);
 assert.match(uso,/\(AMBIENTE\.DEMO \? mutar : mutar\.confirmado\)\(\(d\) => aprovarConclusaoMeta\(d, m\.id, usuario\), "Meta: conclusão aprovada", \{ detalhe: m\.titulo \}, \{ permitirOffline: true \}\)/);
 assert.equal(fonte.split('q.status = "Concluído"; q.solicitacaoConclusao = null;').length,2,'a regra de aprovação existe em um só lugar');
});

test('USO-M3: o componente pede confirmação, não oferece recusa em lote nem substituto',()=>{
 const c=readFileSync(new URL('../src/AprovacoesPendentesMetas.jsx',import.meta.url),'utf8');
 assert.match(c,/window\.confirm\(/);assert.match(c,/aprovarMetasEmLote\(escolhidas,aprovar\)/);
 assert.match(c,/Aguardando minha aprovação/);assert.doesNotMatch(c,/substitut|recusarConclusao/i);
});

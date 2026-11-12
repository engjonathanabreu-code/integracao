import test from 'node:test';
import assert from 'node:assert/strict';
import {recuperarAnexosMetas} from '../src/recuperacao-anexos-metas.js';
const chave=n=>'integracao-meta-arq-v1-'+n;
const meta=(id,keys)=>({id,arquivos:keys.map(chave=>({id:chave,chave}))});
const edicao=(id,antes,depois)=>({colecao:'metas',id,antes:{existe:true,valor:antes},depois:{existe:true,valor:depois}});
const item=(id,edicoes,estado='pendente_local')=>({conta:'a',id,estado,original:{intencao:{edicoes}}});
test('recupera bytes de intenções atuais, anteriores à remoção e não persistidas, sem varrer anexos históricos ou ERP',async()=>{
 const a=meta('m',[chave('um'),'erp-storage|documentos|remoto']),b=meta('m',[]),c=meta('n',[chave('dois')]);
 const diario={conta:'a',intencoes:[item('1',[edicao('m',a,b)]),item('confirmada',[edicao('antiga',meta('antiga',[chave('antiga')]),b)],'confirmado')],naoPersistidas:[{conta:'a',intencao:{edicoes:[edicao('n',c,c)]}}]};
 const original=structuredClone(diario),lidas=[];
 const r=await recuperarAnexosMetas({conta:'a',diario,storage:{get:async k=>{lidas.push(k);return 'data:text/plain;base64,'+k;}}});
 assert.deepEqual(lidas,[chave('um'),chave('dois')]);assert.equal(r.completa,true);assert.deepEqual(r.ausentes,[]);assert.equal(Object.keys(r.arquivos).length,2);assert.deepEqual(diario,original);
});
test('inclui referências preparadas e legadas somente das metas que pertencem à intenção',async()=>{
 const i=item('1',[edicao('m',meta('m',[]),meta('m',[]))]);i.preparado={antes:{metas:[meta('m',[chave('preparado')]),meta('outra',[chave('outra')])]}};i.original.legado={after:{metas:[meta('m',[chave('legado')])]}};
 const lidas=[];await recuperarAnexosMetas({conta:'a',diario:{conta:'a',intencoes:[i]},storage:{get:async k=>{lidas.push(k);return 'data:application/octet-stream;base64,AA==';}}});assert.deepEqual(lidas,[chave('preparado'),chave('legado')]);
});
test('envio legado considera apenas metas alteradas e conserva as referências de antes e depois',async()=>{
 const unchanged=meta('outra',[chave('outra')]),envio={before:{metas:[meta('m',[chave('antes')]),unchanged]},after:{metas:[meta('m',[chave('depois')]),unchanged]}};
 const lidas=[];await recuperarAnexosMetas({conta:'a',envio,storage:{get:async k=>{lidas.push(k);return 'data:text/plain,bytes';}}});assert.deepEqual(lidas,[chave('antes'),chave('depois')]);
});
test('arquivo ausente ou erro de leitura produz cópia parcial com motivos permitidos, sem copiar mensagens privadas',async()=>{
 const diario={conta:'a',intencoes:[item('1',[edicao('m',meta('m',[chave('ausente'),chave('erro'),chave('ok')]),meta('m',[]))])]},lidas=[];
 const r=await recuperarAnexosMetas({conta:'a',diario,storage:{get:async k=>{lidas.push(k);if(k===chave('erro'))throw Error('CPF e conteúdo privado');return k===chave('ok')?'data:text/plain;base64,AA==':null;}}});
 assert.equal(r.completa,false);assert.deepEqual(r.ausentes.map(x=>x.codigo),['ARQUIVO_LOCAL_AUSENTE','LEITURA_LOCAL_INDISPONIVEL']);assert.deepEqual(Object.keys(r.arquivos),[chave('ok')]);assert.doesNotMatch(JSON.stringify(r),/CPF|conteúdo privado/);
});
test('troca de geração durante uma leitura e outra conta no diário interrompem a exportação',async()=>{
 const diario={conta:'a',intencoes:[item('1',[edicao('m',meta('m',[chave('1'),chave('2')]),meta('m',[]))])]},erro=Object.assign(Error('sessão mudou'),{code:'SESSAO_ALTERADA'});let ativa=true,leituras=0;
 await assert.rejects(recuperarAnexosMetas({conta:'a',diario,conferir:()=>{if(!ativa)throw erro;},storage:{get:async()=>{leituras++;ativa=false;return 'data:text/plain,bytes';}}}),{code:'SESSAO_ALTERADA'});assert.equal(leituras,1);
 await assert.rejects(recuperarAnexosMetas({conta:'b',diario,storage:{get:async()=>{throw Error('não ler');}}}),{code:'SESSAO_ALTERADA'});
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {permissoes,SETORES} from '../src/permissoes.js';
import {projetar} from '../src/dados-compartilhados.js';
import {fixture,blank,id} from './fixture.js';
test('Financeiro possui cadastro, planos e operação financeira sem administração',()=>{
 const p=permissoes({setor:'financeiro',ativo:true});
 for(const key of ['cadastro','verCPF','planos','financeiro'])assert.equal(p[key],true,key);
 for(const key of ['config','usuarios','importar','nucleos','forcarValidacao','juridico','prf'])assert.equal(p[key],false,key);
 assert.equal(p.etapa('topografia'),false);
});
test('nova aba: demais setores leem e diretoria opera; inativos não operam',()=>{
 for(const setor of Object.keys(SETORES))assert.equal(permissoes({setor}).financeiro,['diretoria','financeiro'].includes(setor));
 assert.equal(permissoes(null).financeiro,false);
 assert.equal(permissoes({setor:'financeiro',ativo:false}).financeiro,false);
});
test('permissões anteriores são preservadas por setor',()=>{
 const baseline=JSON.parse(readFileSync(new URL('./permissoes-anteriores.json',import.meta.url)));
 for(const setor of Object.keys(SETORES).filter(s=>s!=='financeiro')) {
  const antes=baseline[setor],depois=permissoes({setor});
  for(const key of Object.keys(antes)) {
   if(typeof antes[key]==='object')for(const value of ['topografia','projeto','comercial','contrato','documental','crf'])assert.equal(depois[key](value),antes[key][value],`${setor}/${key}/${value}`);
   else assert.equal(depois[key],antes[key],`${setor}/${key}`);
  }
 }
});
test('recarga mantém Financeiro mesmo com complemento antigo Consulta',()=>{
 const b=fixture();b.profiles[0].tipo='Financeiro';
 b.integracao_usuarios.push({colecao:'usuarios',registro_id:'erp_'+id(1),dados:{setor:'consulta'}});
 const u=projetar(b,blank()).db.usuarios[0];
 assert.equal(u.setor,'financeiro');assert.equal(u.erpRef,id(1));
});

test('setor Financeiro canônico também funciona e preserva administrador',()=>{
 const b=fixture();b.profiles[0].tipo='Marketing';b.profiles[0].setor='Financeiro';
 assert.equal(projetar(b,blank()).db.usuarios[0].setor,'financeiro');
 b.profiles[0].tipo='Administrador';assert.equal(projetar(b,blank()).db.usuarios[0].setor,'diretoria');
});

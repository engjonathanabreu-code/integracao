import test from 'node:test';
import assert from 'node:assert/strict';
import { ordenarMetasContinuas } from '../src/metas-organizacao.js';

test('grade contínua prioriza setores sem duplicar responsáveis nem modificar registros', () => {
  const metas = [
    {id:'j',setor:'Jurídico'},
    {id:'p',setor:'Projetos'},
    {id:'t2',setor:'Topografia',prazo:'2026-10-02',responsaveis:['a','b']},
    {id:'pp',setor:'Pós Protocolo'},
    {id:'t1',setor:'Topografia',prazo:'2026-09-28'},
    {id:'s',setor:''},
  ];
  const antes = structuredClone(metas);
  const resultado = ordenarMetasContinuas(metas);
  assert.deepEqual(resultado.map(m => m.id), ['t1','t2','p','pp','j','s']);
  assert.deepEqual(metas, antes);
  assert.equal(resultado.find(m => m.id === 't2'), metas[2]);
  assert.equal(resultado.length, metas.length);
});

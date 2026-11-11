import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
test('prévia mostra divergência após recibo sem oferecer reenvio ou escolha local',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'integracao-leitura-ui-'));
 try{
  const arquivo=join(dir,'ui.cjs');
  await build({stdin:{contents:"import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import P from './src/PendenciasSincronizacao.jsx';export const render=sync=>renderToStaticMarkup(React.createElement(P,{sync}));",resolveDir:fileURLToPath(new URL('../',import.meta.url)),sourcefile:'ui.jsx',loader:'jsx'},jsx:'automatic',bundle:true,platform:'node',format:'cjs',outfile:arquivo,logLevel:'silent'});
  const {render}=createRequire(import.meta.url)(arquivo),item={id:'i',estado:'confirmado_aguardando_leitura',original:{modulo:'metas'},recibo:{},tentativas:1};
  const preview={id:'i',item,conflitos:[],edicoes:[],leitura:{campos:[{caminho:['metas','m','titulo'],base:'antes',local:'enviado',remoto:'atual'}],arquivos:[{id:'f',chave:'modelo',esperado:{hash:'local'},atual:null}]}};
  const html=render({pendencias:[item],previaPendencia:preview});
  assert.match(html,/Revisar leitura após recibo/);assert.match(html,/Repetir somente a leitura/);assert.match(html,/Reconhecer valores atuais sem reenviar/);assert.match(html,/Alteração enviada: enviado/);assert.match(html,/Valor atual compartilhado: atual/);assert.match(html,/Arquivo: modelo/);assert.doesNotMatch(html,/Salvar escolhas e continuar/);
  const unknown={...item,estado:'resultado_desconhecido',recibo:undefined};
  const semRecibo=render({pendencias:[unknown],previaPendencia:{...preview,item:unknown,leitura:null}});
  assert.doesNotMatch(semRecibo,/Reconhecer valores atuais/);assert.match(semRecibo,/Confirmar retomada deste item/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

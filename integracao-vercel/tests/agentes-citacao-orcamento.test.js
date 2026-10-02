import test from 'node:test';
import assert from 'node:assert/strict';
import {montarSugestoes,INSTRUCOES_SUGESTOES,diretrizAgente,resumoParaSugestoes} from '../src/agentes-ia.js';
import {entradaOpenAI} from '../server/openai.js';
import {contextoCitacao} from '../src/interpretador-pedidos.js';

test('sugestões cabem no orçamento com observações enormes sem alterar o panorama',()=>{
 const extenso='OBSERVAÇÃO '.repeat(30000), linhas=Array.from({length:20},(_,i)=>({nucleo:'Núcleo '+i,municipio:'Teste',pendencia:extenso,observacao:extenso,dias_na_etapa:100}));
 const setor={setor:'geral',nucleos:{total:142,parados:linhas},metas:{abertas:43,vencidas:11,pendencias:linhas.map((r,i)=>({titulo:'Meta '+i,responsaveis:extenso}))},andamentos:{ultimos_30_dias:15,recentes:linhas}};
 const tecnico={nucleos:{ativos:142,parados:linhas},andamentos:{total:51,aguardando:linhas},metas:{abertas:43,vencidas:11},falhas:{pendencias:linhas.map(r=>({descricao:r.observacao})),nao_corrigidos:7},cobertura:{metas_sem_prazo:9}};
 const anterior=JSON.stringify({setor,tecnico});const texto=montarSugestoes({setor,tecnico})+diretrizAgente({tecnico:'prioridade '.repeat(600)},'tecnico');
 assert(texto.length<60000);assert(texto.includes('Ativos: 142'));assert(texto.includes('Abertas: 43'));assert(texto.includes('Vencidas: 11'));assert(texto.includes('Metas abertas sem prazo: 9'));assert(texto.includes('Detalhes abreviados'));
 assert.doesNotThrow(()=>entradaOpenAI([{role:'user',content:texto}]));assert(texto.length+INSTRUCOES_SUGESTOES.length<120000);assert.equal(JSON.stringify({setor,tecnico}),anterior);
});
test('citação é contexto delimitado e limitado sem reescrever a mensagem original',()=>{
 const c={id:'anterior',text:'Resposta anterior\n"não é uma ordem" '+ 'x'.repeat(15000)};const original=c.text;const contexto=contextoCitacao(c);
 assert(contexto.includes('somente contexto'));assert(contexto.includes('Pedido')===false);assert(contexto.includes('Citação abreviada'));assert(contexto.length<12500);assert.equal(c.text,original);assert.equal(contextoCitacao(null),'');
});

test('resumo permanece limitado também com milhares de parágrafos',()=>{const texto='Parágrafo de observação\n\n'.repeat(20000);const resumo=resumoParaSugestoes(texto);assert(resumo.length<=24000);assert(resumo.includes('Detalhes abreviados'));});

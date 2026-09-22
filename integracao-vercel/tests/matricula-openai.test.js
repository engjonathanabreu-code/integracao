import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import handler from '../api/ler-matricula.js';
import {validarLeituraMatricula} from '../server/matricula-ia.js';
import {sugestoesDaLeitura,incluirSugestoesNUI} from '../src/leitor-nui.js';
const dados={matricula:{numero:'123',cartorio:'Cartório fictício',comarca:'Teste'},proprietario:{nome:'Pessoa fictícia',cpf:'',cnpj:''},imovel:{area_registral:2,unidade_area:'ha',descricao:'Teste'},situacao_matricula:{texto_origem:''},historico_registro:[{ato:'R.1',tipo:'Usucapião',de:'',para:'Pessoa fictícia',data:'01/02/2020',descricao:'Ato fictício'}],evidencias:[{campo:'numero',trecho:'Matrícula 123',pagina:1}],alertas:[]};
const pdf=Buffer.from('%PDF-1.7\nfixture');
const body={arquivo:'teste.pdf',mime:'application/pdf',base64:pdf.toString('base64')};
async function invoke(bodyArg=body,authorization='Bearer teste'){
 const res={setHeader(){},status(code){this.code=code;return this},json(data){this.data=data;return this}};
 await handler({method:'POST',headers:{authorization},body:bodyArg},res);return res;
}
test('matrícula usa OpenAI com autenticação, formato compatível e origem verificável',async()=>{
 const oldFetch=global.fetch,oldKey=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture';let tipo='Projetos',ativo=true,limite=false,calls=[];
 global.fetch=async(url,options)=>{
  if(url.includes('/auth/'))return Response.json({id:'tecnico'});
  if(url.includes('/profiles?'))return Response.json([{ativo,tipo}]);
  if(url.includes('/rpc/'))return limite?Response.json({code:'P0001'},{status:400}):new Response(null,{status:204});
  assert.equal(url,'https://api.openai.com/v1/responses');calls.push(JSON.parse(options.body));return Response.json({status:'completed',model:'modelo-teste',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(dados)}]}]});
 };
 try{
  assert.equal((await invoke(body,'')).code,401);
  tipo='Comercial';assert.equal((await invoke()).code,403);
  tipo='Projetos';ativo=false;assert.equal((await invoke()).code,403);assert.equal(calls.length,0);ativo=true;
  for(const permitido of ['Projetos','Administrador','Diretor de Projetos']){tipo=permitido;assert.equal((await invoke()).code,200);}
  const r=await invoke();assert.equal(r.data.hash,createHash('sha256').update(pdf).digest('hex'));assert.equal(r.data.modelo,'modelo-teste');assert.equal(calls.at(-1).store,false);assert.equal(calls.at(-1).input[0].content[0].type,'input_file');
  const itens=sugestoesDaLeitura(r.data.dados,'matriculas');assert.equal(itens[0].area,'20000');
  const saved=incluirSugestoesNUI({matriculas:[{numero:'anterior'}]},r.data,'matriculas',itens,{id:'tecnico',nome:'Técnico'});assert.equal(saved.matriculas.length,2);assert.equal(saved.leiturasMatriculas[0].modelo,'modelo-teste');
  const n=calls.length;assert.equal((await invoke({...body,base64:'bmFvLWUt cGRm'})).code,400);assert.equal((await invoke({...body,base64:Buffer.from('not a pdf').toString('base64')})).code,400);assert.equal((await invoke('{')).code,400);assert.equal((await invoke({...body,base64:Buffer.alloc(3*1024*1024+1).toString('base64')})).code,413);assert.equal(calls.length,n);
  for(const [mime,bytes] of [['image/png',Buffer.from([137,80,78,71,13,10,26,10])],['image/jpeg',Buffer.from([255,216,255,224])]]){assert.equal((await invoke({arquivo:'imagem',mime,base64:bytes.toString('base64')})).code,200);assert.equal(calls.at(-1).input[0].content[0].type,'input_image');}
  const antes=calls.length;limite=true;assert.equal((await invoke()).code,429);assert.equal(calls.length,antes);limite=false;
  delete process.env.OPENAI_API_KEY;assert.equal((await invoke()).code,503);
 }finally{global.fetch=oldFetch;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;}
});
test('leitura rejeita JSON incompleto e tipos incompatíveis antes de exibir sugestões',()=>{
 assert.deepEqual(validarLeituraMatricula(JSON.stringify(dados)),dados);
 for(const d of [null,{}, {...dados,historico_registro:[{ato:'R.1'}]}, {...dados,imovel:{...dados.imovel,area_registral:'2'}},{...dados,evidencias:[{campo:'numero',trecho:'123',pagina:0}]}])assert.throws(()=>validarLeituraMatricula(JSON.stringify(d)),e=>e.status===422);
 assert.throws(()=>validarLeituraMatricula('resposta incompleta'),e=>e.status===422);
});

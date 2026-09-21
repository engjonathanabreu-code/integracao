import {id} from './fixture.js';
import {diaPonto} from '../src/ponto-api.js';
export function instalarPontoFixture(){
 const hoje=diaPonto(),ontem=new Date(Date.parse(hoje+'T12:00:00Z')-86400000).toISOString().slice(0,10);
 let jornada={id:id(901),usuario_id:id(1),vinculo:new URLSearchParams(location.search).has('contrato')?'Contrato':'CLT',dias:[1,2,3,4,5],entrada:'08:00:00',saida:'17:00:00',intervalo:60,vigencia:hoje},batidas=[],aprovado=0,decisoes=[];
 const dia=()=>({dia:ontem,vinculo:'CLT',previsto:480,trabalhado:540,extra:60,aprovado,rejeitado:0,pendente_extra:60-aprovado,incompleto:false,fechado:true,assinatura:'teste',batidas:['08:00','12:00','13:00','18:00'].map(h=>ontem+'T'+h+':00-03:00'),originais:[],revisao:null,ajuste:0,saldo:aprovado});
 return (url,options,json)=>{const table=url.pathname.split('/').at(-1);if(table==='integracao_ponto'){
 const {p_acao:a,p_dados:d}=JSON.parse(options.body);
 if(a==='estado')return json({jornada,proximo:batidas.length%2?'saida':'entrada',hoje:{batidas:batidas.map(b=>b.ocorrido_em),incompleto:batidas.length%2===1}});
 if(a==='bater'){const r={id:d.pedido,tipo:d.tipo,ocorrido_em:new Date().toISOString()};batidas.push(r);return json(r);}
 if(a==='jornada'){jornada={...jornada,...d};return json({ok:true});}
 if(a==='relatorio')return json({dias:[dia()],saldo_anterior:-30});
 if(a==='decidir'){aprovado=d.aprovada?60:0;decisoes.push({id:crypto.randomUUID(),dia:ontem,minutos:60,aprovada:d.aprovada,motivo:d.motivo,autor:id(1),criado_em:new Date().toISOString()});return json({ok:true});}
 return json({ok:true});
 }if(table==='integracao_ponto_jornadas')return json([jornada]);if(table==='integracao_ponto_decisoes')return json(decisoes);if(/^integracao_ponto_(ajustes|revisoes)$/.test(table))return json([]);};
}

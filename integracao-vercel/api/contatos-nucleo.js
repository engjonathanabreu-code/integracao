import {carregarContatosNucleo,csvContatos,ErroContatos} from '../server/contatos-nucleo.js';
export default async function handler(req,res){
  res.setHeader('Cache-Control','private,no-store');res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST')return res.status(405).json({erro:'Use POST.'});
  try{const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(!body||!['csv','resumo'].includes(body.formato)||!['todos','sem-contato'].includes(body.filtro||'todos'))return res.status(400).json({erro:'Formato ou filtro inválido.'});
    const {nucleo,rows}=await carregarContatosNucleo({nucleoId:body.nucleoId,authorization:req.headers.authorization});const selecionados=body.filtro==='sem-contato'?rows.filter(r=>!r.telefone&&!r.whatsapp&&!r.email):rows;
    if(body.formato==='resumo')return res.status(200).json({nucleo:nucleo.nucleo,total:rows.length,filtrados:selecionados.length,comTelefone:rows.filter(r=>r.telefone||r.whatsapp).length,comEmail:rows.filter(r=>r.email).length,semContato:rows.filter(r=>!r.telefone&&!r.whatsapp&&!r.email).length});
    res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition',`attachment; filename="moradores-contatos-${nucleo.id}.csv"`);res.setHeader('X-Registros-Total',String(selecionados.length));
    const csv=csvContatos(selecionados);res.status(200);
    if(typeof res.write==='function'&&typeof res.end==='function'){const buffer=Buffer.from(csv,'utf8');for(let i=0;i<buffer.length;i+=65536){if(!res.write(buffer.subarray(i,i+65536)))await new Promise(resolve=>res.once('drain',resolve));}return res.end();}
    return res.send(csv);
  }catch(e){const status=e instanceof ErroContatos?e.status:e instanceof SyntaxError?400:503;return res.status(status).json({erro:e instanceof ErroContatos?e.message:status===400?'Pedido inválido.':'Não foi possível gerar o arquivo. Nenhum resultado parcial foi entregue.'});}
}

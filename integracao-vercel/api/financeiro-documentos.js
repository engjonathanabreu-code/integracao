export const config={maxDuration:120};
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='POST')return res.status(405).json({message:'Use POST.'});
 if(!/^Bearer \S+$/.test(req.headers.authorization||''))return res.status(401).json({message:'Entre novamente.'});
 if(JSON.stringify(req.body||{}).length>4300000)return res.status(413).json({message:'Envie um arquivo de até 3 MB.'});
 try{const r=await fetch('https://financeiro-integral.vercel.app/api/integracao-financeiro-ia',{method:'POST',headers:{Authorization:req.headers.authorization,'Content-Type':'application/json'},body:JSON.stringify(req.body),signal:AbortSignal.timeout(110000)});const d=await r.json().catch(()=>({message:'A análise está indisponível.'}));return res.status(r.status).json(d);}catch{return res.status(503).json({message:'A análise demorou ou está indisponível. Nenhum pagamento foi alterado.'});}
}

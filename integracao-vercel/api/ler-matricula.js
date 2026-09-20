export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='POST')return res.status(405).json({message:'Use POST.'});
 if(!/^Bearer \S+$/.test(req.headers.authorization||''))return res.status(401).json({message:'Entre novamente.'});
 try{
  const body=typeof req.body==='string'?req.body:JSON.stringify(req.body);
  if(body.length>4250000)return res.status(413).json({message:'Envie um arquivo de até 3 MB.'});
  const r=await fetch('https://leitor-de-matriculas.vercel.app/api/integracao-nui',{method:'POST',redirect:'error',headers:{Authorization:req.headers.authorization,'Content-Type':'application/json'},body,signal:AbortSignal.timeout(270000)});
  const data=await r.json();return res.status(r.status).json(data);
 }catch{return res.status(503).json({message:'O Leitor de Matrículas IA está indisponível. Tente novamente.'});}
}

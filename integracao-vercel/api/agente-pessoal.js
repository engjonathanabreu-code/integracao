import {exigirUsuarioIA} from '../server/ia-auth.js';
import {ErroIA} from '../server/openai.js';
export default async function handler(req,res){res.setHeader('Cache-Control','private,no-store');if(req.method!=='GET')return res.status(405).json({erro:'Use GET.'});try{await exigirUsuarioIA(req);return res.status(200).json({mode:process.env.OPENAI_API_KEY?.trim()?'real':'indisponivel',autonomous:false});}catch(e){return res.status(e instanceof ErroIA?e.status:503).json({erro:e instanceof ErroIA?e.message:'Não foi possível conferir a conexão com a IA.'});}}

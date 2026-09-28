// Network reachability only: no database, account data or authenticated action.
export default function handler(req,res){
 res.setHeader('Cache-Control','no-store, max-age=0');
 if(req.method!=='GET'&&req.method!=='HEAD'){res.setHeader('Allow','GET, HEAD');return res.status(405).end();}
 return res.status(204).end();
}

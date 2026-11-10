// JSON objects are unordered; arrays, numeric types and null remain meaningful.
export function igualSemantico(a,b){
 if(a===b)return true;
 if(a===null||b===null||typeof a!==typeof b||typeof a!=='object')return false;
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>igualSemantico(v,b[i]));
 const ka=Object.keys(a),kb=Object.keys(b);
 return ka.length===kb.length&&ka.every(k=>Object.hasOwn(b,k)&&igualSemantico(a[k],b[k]));
}

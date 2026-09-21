// Do not replace a screen while its unsaved form or a dialog is being used.
export function temEdicaoEmAndamento(){
 if(typeof document==='undefined')return false;
 return !!(document.activeElement?.matches('input,textarea,select,[contenteditable="true"]')||document.querySelector('[data-edicao-pendente="true"],.barra-salvar,dialog[open],[role="dialog"]'));
}

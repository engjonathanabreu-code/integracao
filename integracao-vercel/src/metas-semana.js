// Meta que o botão Editar do detalhe deve abrir; null quando ela já não existe.
export const metaParaEditar=(metas,id)=>(metas||[]).find(m=>m.id===id)||null;

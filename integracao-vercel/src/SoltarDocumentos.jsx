import React from 'react';

export default function SoltarDocumentos({ bloqueado, escolher, abrir, children }) {
  return <div className="soltar-docs" aria-busy={bloqueado}
    onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = bloqueado ? 'none' : 'copy'; }}
    onDrop={e => { e.preventDefault(); if (!bloqueado) escolher(e.dataTransfer.files); }}>
    {children}
    <button type="button" className="btn" disabled={bloqueado} onClick={abrir}>Escolher arquivos</button>
    <span className="ajuda">Clique ou arraste. PDF ou foto, até 20 MB cada, 12 arquivos por vez.</span>
  </div>;
}

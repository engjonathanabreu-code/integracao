/* Dados do PRF — formulário dos dados estáveis do município.
   Abre a partir do botão na aba Municípios. Renderiza a partir de camposPRF.js:
   campo novo no esquema aparece aqui sozinho. */

import { useMemo, useState } from "react";
import { Check, Plus, Trash2, Loader2, AlertTriangle, FileText } from "lucide-react";
import { GRUPOS, VAZIO, pendencias } from "./camposPRF.js";

const clonar = (o) => JSON.parse(JSON.stringify(o));

function Campo({ campo, valor, onChange, desabilitado }) {
  const comum = {
    className: "inp",
    value: valor || "",
    disabled: desabilitado,
    onChange: (e) => onChange(e.target.value),
    placeholder: campo.exemplo ? `ex.: ${campo.exemplo}` : undefined,
  };
  return (
    <div style={{ flex: campo.tipo === "texto" ? "1 1 100%" : "1 1 220px" }}>
      <label className="rot">
        {campo.rotulo}{campo.obrigatorio && <span aria-hidden="true"> *</span>}
      </label>
      {campo.tipo === "texto"
        ? <textarea rows={3} {...comum} />
        : <input type={campo.tipo === "data" ? "date" : "text"} {...comum} />}
    </div>
  );
}

function GrupoSimples({ grupo, dados, aoMudar, desabilitado }) {
  return (
    <div className="flex flex-wrap gap-2">
      {grupo.campos.map((c) => (
        <Campo key={c.id} campo={c} desabilitado={desabilitado}
               valor={dados?.[c.id]}
               onChange={(v) => aoMudar({ ...(dados || {}), [c.id]: v })} />
      ))}
    </div>
  );
}

function GrupoLista({ grupo, itens = [], aoMudar, desabilitado }) {
  const novo = () => Object.fromEntries(grupo.campos.map((c) => [c.id, ""]));
  return (
    <div className="flex flex-col gap-2">
      {!itens.length && <p className="ajuda" style={{ margin: 0 }}>Nenhuma {grupo.rotuloItem} cadastrada.</p>}
      {itens.map((item, i) => (
        <div key={i} className="cartao flex flex-wrap gap-2" style={{ alignItems: "flex-end" }}>
          {grupo.campos.map((c) => (
            <Campo key={c.id} campo={c} desabilitado={desabilitado}
                   valor={item?.[c.id]}
                   onChange={(v) => aoMudar(itens.map((x, k) => (k === i ? { ...x, [c.id]: v } : x)))} />
          ))}
          {!desabilitado && (
            <button className="btn btn-perigo btn-sm"
                    onClick={() => aoMudar(itens.filter((_, k) => k !== i))}
                    aria-label={`Remover ${grupo.rotuloItem} ${i + 1}`}>
              <Trash2 size={14} />
            </button>
          )}
        </div>
      ))}
      {!desabilitado && (
        <span>
          <button className="btn btn-sm" onClick={() => aoMudar([...itens, novo()])}>
            <Plus size={14} />Adicionar {grupo.rotuloItem}
          </button>
        </span>
      )}
    </div>
  );
}

export default function FormularioDadosPRF({
  municipio, dados: dadosRecebidos, podeEditar = false, aoSalvar, aoFechar,
}) {
  const [dados, setDados] = useState(() => ({ ...VAZIO(), ...clonar(dadosRecebidos || {}) }));
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("");

  const faltando = useMemo(() => pendencias(dados), [dados]);

  const salvar = async () => {
    setSalvando(true);
    try {
      await aoSalvar(dados);
      setMensagem("Dados do PRF gravados no município.");
    } catch (e) {
      setMensagem("Não foi possível gravar. Tente de novo.");
    } finally { setSalvando(false); }
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 style={{ margin: 0, color: "var(--titulo)" }}>
          <FileText size={16} style={{ verticalAlign: "-2px", marginRight: 6 }} />
          Dados do PRF — {municipio?.nome}/{municipio?.uf}
        </h3>
        <p className="ajuda" style={{ margin: "4px 0 0" }}>
          São os dados que não mudam de um núcleo para outro. Preenchidos uma vez, valem para
          todo Projeto de Regularização Fundiária deste município.
        </p>
      </div>

      {faltando.length > 0 && (
        <div className="ajuda">
          <AlertTriangle size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
          Faltam {faltando.length} campo(s) obrigatório(s): {faltando.slice(0, 4).join(" · ")}
          {faltando.length > 4 && ` e mais ${faltando.length - 4}`}.
        </div>
      )}

      {GRUPOS.map((g) => (
        <section className="cartao flex flex-col gap-2" key={g.id}>
          <div>
            <strong style={{ color: "var(--titulo)" }}>{g.titulo}</strong>
            {g.ajuda && <p className="ajuda" style={{ margin: "2px 0 0" }}>{g.ajuda}</p>}
          </div>
          {g.lista
            ? <GrupoLista grupo={g} itens={dados[g.id]} desabilitado={!podeEditar}
                          aoMudar={(v) => setDados({ ...dados, [g.id]: v })} />
            : <GrupoSimples grupo={g} dados={dados[g.id]} desabilitado={!podeEditar}
                            aoMudar={(v) => setDados({ ...dados, [g.id]: v })} />}
        </section>
      ))}

      <div className="flex flex-wrap gap-2">
        {podeEditar && (
          <button className="btn btn-primario" disabled={salvando} onClick={salvar}>
            {salvando ? <Loader2 size={16} className="girando" /> : <Check size={16} />}Salvar
          </button>
        )}
        {aoFechar && <button className="btn" onClick={aoFechar}>Fechar</button>}
        {mensagem && <span className="ajuda" style={{ alignSelf: "center" }}>{mensagem}</span>}
      </div>
    </div>
  );
}

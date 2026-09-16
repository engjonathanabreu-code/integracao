/* Memoriais — aba do núcleo, etapa Topografia.
   Substitui a planilha GM 7.5. Os dados do requerente, do núcleo e do imóvel
   vêm do cadastro; aqui o usuário só informa os vértices do levantamento. */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Upload, Calculator, FileText, Trash2, Check, AlertTriangle, Loader2,
  Settings2, ClipboardPaste, Wand2,
} from "lucide-react";
import {
  interpretarVertices, renomearVertices, processarVertices, conferirPoligono,
  formatarMedida, paraNumero,
} from "./memoriaisCalculos.js";
import { montarMemorial, dadosDoMemorial, SISTEMAS } from "./memoriaisTexto.js";

const CONFIG_PADRAO = {
  sistema: SISTEMAS.UTM,
  meridiano: "51° WGr",
  prefixo: "V",
  responsavel: { nome: "", registro: "" },
};

/* ------------------------------------------------------------ auxiliares */

function Aviso({ tipo = "alerta", children }) {
  const cor = tipo === "erro" ? "msg-erro" : "ajuda";
  return (
    <div className={cor} role={tipo === "erro" ? "alert" : undefined} style={{ marginTop: 8 }}>
      {tipo !== "erro" && <AlertTriangle size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />}
      {children}
    </div>
  );
}

const temVertices = (u) => Array.isArray(u.vertices) && u.vertices.length >= 3;

/* ------------------------------------------------------- painel de uma UI */

function PainelUnidade({ unidade, nucleo, municipio, config, podeEditar, aoSalvar, aoGerarDocumento }) {
  const [vertices, setVertices] = useState(unidade.vertices || []);
  const [avisos, setAvisos] = useState([]);
  const [colado, setColado] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const arquivo = useRef(null);

  useEffect(() => { setVertices(unidade.vertices || []); setMensagem(""); }, [unidade.id]);

  const calculado = useMemo(() => processarVertices(vertices), [vertices]);
  const conferencia = useMemo(() => conferirPoligono(vertices), [vertices]);
  const memorial = useMemo(
    () => (conferencia.valido ? montarMemorial(calculado.vertices, config) : ""),
    [calculado, conferencia.valido, config],
  );

  const carregar = (texto) => {
    const { vertices: lidos, avisos: recado } = interpretarVertices(texto);
    if (!lidos.length) { setAvisos(recado.length ? recado : ["Nenhum vértice encontrado no arquivo."]); return; }
    const semNome = lidos.filter((v) => !v.nome).length;
    setVertices(semNome === lidos.length ? renomearVertices(lidos, config.prefixo) : lidos);
    setAvisos(recado);
    setMensagem(`${lidos.length} vértices carregados. Confira antes de salvar.`);
  };

  const enviarArquivo = async (arq) => {
    if (!arq) return;
    if (arq.size > 2 * 1024 * 1024) { setAvisos(["O arquivo passa de 2 MB."]); return; }
    carregar(await arq.text());
    if (arquivo.current) arquivo.current.value = "";
  };

  const alterar = (i, campo, valor) => {
    setVertices((atual) => atual.map((v, k) => {
      if (k !== i) return v;
      if (campo === "e" || campo === "n") return { ...v, [campo]: paraNumero(valor) };
      return { ...v, [campo]: valor };
    }));
  };

  const repetirConfrontante = (i) => {
    const valor = vertices[i]?.confrontante || "";
    setVertices((atual) => atual.map((v, k) => (k > i && !v.confrontante ? { ...v, confrontante: valor } : v)));
  };

  const salvar = async () => {
    setSalvando(true);
    try {
      await aoSalvar(unidade, {
        vertices: calculado.vertices,
        area: calculado.area,
        perimetro: calculado.perimetro,
        memorial,
      });
      setMensagem("Memorial, área e perímetro gravados no cadastro da unidade.");
    } finally { setSalvando(false); }
  };

  const gerar = async () => {
    setGerando(true);
    try {
      await aoGerarDocumento(unidade, dadosDoMemorial({
        morador: unidade.morador,
        unidade: { ...unidade, area: calculado.area, perimetro: calculado.perimetro, memorial },
        nucleo, municipio, config,
      }));
    } finally { setGerando(false); }
  };

  const faltaResponsavel = !config.responsavel?.nome || !config.responsavel?.registro;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <input ref={arquivo} type="file" accept=".txt,.csv" style={{ display: "none" }}
               onChange={(e) => enviarArquivo(e.target.files?.[0])} />
        <button className="btn btn-primario" disabled={!podeEditar} onClick={() => arquivo.current?.click()}>
          <Upload size={16} />Importar TXT ou CSV
        </button>
        <button className="btn" disabled={!podeEditar || !vertices.length}
                onClick={() => setVertices(renomearVertices(vertices, config.prefixo))}>
          <Wand2 size={15} />Renomear com prefixo {config.prefixo}
        </button>
        {!!vertices.length && podeEditar && (
          <button className="btn btn-perigo" onClick={() => { setVertices([]); setAvisos([]); }}>
            <Trash2 size={15} />Limpar vértices
          </button>
        )}
      </div>

      {podeEditar && (
        <div>
          <label className="rot" htmlFor="colar">Ou cole aqui a lista de vértices</label>
          <textarea id="colar" className="inp" rows={3} value={colado}
                    placeholder={"Nome;E;N;Confrontante\nV01;712345,678;7012345,123;Rua das Flores"}
                    onChange={(e) => setColado(e.target.value)} />
          <button className="btn btn-sm" style={{ marginTop: 6 }} disabled={!colado.trim()}
                  onClick={() => { carregar(colado); setColado(""); }}>
            <ClipboardPaste size={14} />Ler o texto colado
          </button>
        </div>
      )}

      {avisos.map((a, i) => <Aviso key={i}>{a}</Aviso>)}
      {conferencia.erros.map((a, i) => <Aviso key={`e${i}`} tipo="erro">{a}</Aviso>)}
      {conferencia.alertas.map((a, i) => <Aviso key={`a${i}`}>{a}</Aviso>)}

      {!!vertices.length && (
        <>
          <div style={{ overflowX: "auto" }}>
            <table className="tabela">
              <thead>
                <tr>
                  <th>Vértice</th><th>E</th><th>N</th>
                  <th>Azimute</th><th>Distância (m)</th><th>Confrontante</th><th />
                </tr>
              </thead>
              <tbody>
                {calculado.vertices.map((v, i) => (
                  <tr key={i}>
                    <td><input className="inp" value={v.nome} disabled={!podeEditar}
                               onChange={(e) => alterar(i, "nome", e.target.value)} /></td>
                    <td><input className="inp" value={v.e ?? ""} disabled={!podeEditar}
                               onChange={(e) => alterar(i, "e", e.target.value)} /></td>
                    <td><input className="inp" value={v.n ?? ""} disabled={!podeEditar}
                               onChange={(e) => alterar(i, "n", e.target.value)} /></td>
                    <td>{v.azimute}</td>
                    <td>{formatarMedida(v.distancia)}</td>
                    <td><input className="inp" value={v.confrontante || ""} disabled={!podeEditar}
                               onChange={(e) => alterar(i, "confrontante", e.target.value)} /></td>
                    <td>
                      <button className="btn-icone" title="Repetir este confrontante nos vértices seguintes"
                              disabled={!podeEditar || !v.confrontante} onClick={() => repetirConfrontante(i)}>
                        <Calculator size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-3">
            <div><span className="rot">Área</span><strong> {formatarMedida(calculado.area)} m²</strong></div>
            <div><span className="rot">Perímetro</span><strong> {formatarMedida(calculado.perimetro)} m</strong></div>
            <div><span className="rot">Vértices</span><strong> {vertices.length}</strong></div>
          </div>

          {memorial && (
            <div>
              <label className="rot">Memorial descritivo gerado</label>
              <p style={{ textAlign: "justify", whiteSpace: "pre-wrap", margin: 0 }}>{memorial}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primario" disabled={!podeEditar || !conferencia.valido || salvando} onClick={salvar}>
              {salvando ? <Loader2 size={16} className="girando" /> : <Check size={16} />}Salvar no cadastro
            </button>
            <button className="btn" disabled={!conferencia.valido || faltaResponsavel || gerando} onClick={gerar}>
              {gerando ? <Loader2 size={16} className="girando" /> : <FileText size={16} />}Gerar documento
            </button>
          </div>
          {faltaResponsavel && <Aviso>Falta cadastrar o responsável técnico e o registro profissional nas configurações.</Aviso>}
          {mensagem && <p className="ajuda" style={{ margin: 0 }}>{mensagem}</p>}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- a aba */

export default function AbaMemoriais({
  nucleo, municipio, unidades = [], config: configRecebida, podeEditar = false,
  etapaLiberada = true, aoSalvarUnidade, aoSalvarConfig, aoGerarDocumento,
}) {
  const config = { ...CONFIG_PADRAO, ...(configRecebida || {}) };
  const [aberta, setAberta] = useState(null);
  const [ajustes, setAjustes] = useState(false);
  const [rascunho, setRascunho] = useState(config);
  const [lote, setLote] = useState("");

  const prontas = unidades.filter((u) => temVertices(u));

  const gerarLote = async () => {
    const fora = [];
    for (const u of unidades) {
      if (!temVertices(u)) { fora.push(`${u.codigo}: sem vértices importados`); continue; }
      const calc = processarVertices(u.vertices);
      const texto = montarMemorial(calc.vertices, config);
      await aoGerarDocumento(u, dadosDoMemorial({
        morador: u.morador,
        unidade: { ...u, area: calc.area, perimetro: calc.perimetro, memorial: texto },
        nucleo, municipio, config,
      }));
    }
    setLote(fora.length
      ? `${unidades.length - fora.length} memoriais gerados. Ficaram de fora: ${fora.join("; ")}.`
      : `${unidades.length} memoriais gerados.`);
  };

  if (!etapaLiberada) {
    return (
      <div className="flex flex-col gap-2">
        <p style={{ margin: 0 }}>
          Os memoriais são emitidos na etapa Topografia. O núcleo está em <strong>{nucleo?.etapa || "etapa anterior"}</strong>.
        </p>
        <p className="ajuda" style={{ margin: 0 }}>
          Assim que o núcleo chegar na Topografia, esta aba libera a importação dos vértices e a geração dos memoriais.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" style={{ justifyContent: "space-between" }}>
        <div>
          <strong>{prontas.length}</strong> de <strong>{unidades.length}</strong> unidades com vértices importados
          {" · "}sistema <strong>{config.sistema}</strong>
          {config.sistema === SISTEMAS.UTM && <> · MC <strong>{config.meridiano}</strong></>}
        </div>
        <span className="flex gap-2">
          <button className="btn btn-sm" onClick={() => { setRascunho(config); setAjustes(!ajustes); }}>
            <Settings2 size={14} />Configurações
          </button>
          <button className="btn btn-sm" disabled={!prontas.length} onClick={gerarLote}>
            <FileText size={14} />Gerar todos ({prontas.length})
          </button>
        </span>
      </div>
      {lote && <p className="ajuda" style={{ margin: 0 }}>{lote}</p>}

      {ajustes && (
        <section className="cartao flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <div style={{ flex: "1 1 180px" }}>
              <label className="rot" htmlFor="sis">Sistema de coordenadas</label>
              <select id="sis" className="inp" value={rascunho.sistema} disabled={!podeEditar}
                      onChange={(e) => setRascunho({ ...rascunho, sistema: e.target.value })}>
                <option value={SISTEMAS.UTM}>{SISTEMAS.UTM}</option>
                <option value={SISTEMAS.GEOGRAFICA}>{SISTEMAS.GEOGRAFICA}</option>
              </select>
            </div>
            <div style={{ flex: "1 1 180px" }}>
              <label className="rot" htmlFor="mc">Meridiano central</label>
              <input id="mc" className="inp" value={rascunho.meridiano} disabled={!podeEditar || rascunho.sistema !== SISTEMAS.UTM}
                     onChange={(e) => setRascunho({ ...rascunho, meridiano: e.target.value })} />
            </div>
            <div style={{ flex: "0 1 120px" }}>
              <label className="rot" htmlFor="pref">Prefixo do vértice</label>
              <input id="pref" className="inp" value={rascunho.prefixo} disabled={!podeEditar}
                     onChange={(e) => setRascunho({ ...rascunho, prefixo: e.target.value })} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <div style={{ flex: "1 1 220px" }}>
              <label className="rot" htmlFor="resp">Responsável técnico</label>
              <input id="resp" className="inp" value={rascunho.responsavel?.nome || ""} disabled={!podeEditar}
                     onChange={(e) => setRascunho({ ...rascunho, responsavel: { ...rascunho.responsavel, nome: e.target.value } })} />
            </div>
            <div style={{ flex: "1 1 220px" }}>
              <label className="rot" htmlFor="reg">Registro profissional (CREA/CAU, ART ou RRT)</label>
              <input id="reg" className="inp" value={rascunho.responsavel?.registro || ""} disabled={!podeEditar}
                     onChange={(e) => setRascunho({ ...rascunho, responsavel: { ...rascunho.responsavel, registro: e.target.value } })} />
            </div>
          </div>
          {podeEditar && (
            <span>
              <button className="btn btn-primario btn-sm" onClick={async () => { await aoSalvarConfig(rascunho); setAjustes(false); }}>
                <Check size={14} />Salvar configurações
              </button>
            </span>
          )}
        </section>
      )}

      {!unidades.length && <p className="ajuda">Este núcleo ainda não tem unidades imobiliárias cadastradas.</p>}

      {unidades.map((u) => (
        <section className="cartao" key={u.id}>
          <div className="flex flex-wrap gap-2" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong style={{ color: "var(--titulo)" }}>{u.codigo}</strong>
              <div className="ajuda" style={{ margin: 0 }}>{u.requerente}</div>
            </div>
            <span className="flex flex-wrap gap-2" style={{ alignItems: "center" }}>
              {temVertices(u)
                ? <span className="ajuda" style={{ margin: 0 }}>
                    {u.vertices.length} vértices · {formatarMedida(u.area)} m² · {formatarMedida(u.perimetro)} m
                  </span>
                : <span className="ajuda" style={{ margin: 0 }}>sem vértices</span>}
              {u.memorial && <Check size={15} aria-label="memorial gravado" />}
              <button className="btn btn-sm" onClick={() => setAberta(aberta === u.id ? null : u.id)}>
                {aberta === u.id ? "Fechar" : "Abrir"}
              </button>
            </span>
          </div>
          {aberta === u.id && (
            <div style={{ marginTop: 12 }}>
              <PainelUnidade
                unidade={u} nucleo={nucleo} municipio={municipio} config={config}
                podeEditar={podeEditar} aoSalvar={aoSalvarUnidade} aoGerarDocumento={aoGerarDocumento}
              />
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

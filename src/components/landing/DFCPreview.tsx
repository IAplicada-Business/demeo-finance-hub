// Preview do módulo DFC Aurora — fluxo de caixa semanal + tabela de categorias.
export function DFCPreview() {
  const semanas = [
    { l: "Sem 1", r: 42, d: 38 },
    { l: "Sem 2", r: 56, d: 41 },
    { l: "Sem 3", r: 48, d: 52 },
    { l: "Sem 4", r: 78, d: 49 },
  ];
  const max = Math.max(...semanas.flatMap((s) => [s.r, s.d]));

  const categorias = [
    { cat: "Receita · Vendas", val: 92_400, pct: 64, up: true, var: 12.4 },
    { cat: "Despesa Fixa · Salários", val: -42_800, pct: 30, up: false, var: 2.1 },
    { cat: "Despesa Fixa · Aluguel", val: -11_000, pct: 8, up: false, var: 0 },
  ];

  return (
    <div
      className="relative overflow-hidden"
      style={{
        background: "#FFFFFF",
        border: "1px solid rgba(74,103,65,0.08)",
        borderRadius: 22,
        boxShadow:
          "0 1px 2px rgba(27,57,77,0.04), 0 30px 64px -28px rgba(74,103,65,0.28), inset 0 1px 0 rgba(255,255,255,0.7)",
      }}
    >
      {/* Topbar */}
      <div
        className="flex items-center justify-between px-5 py-3"
        style={{ borderBottom: "1px solid rgba(74,103,65,0.06)" }}
      >
        <div>
          <div className="aurora-cap" style={{ color: "var(--sage)" }}>
            Relatório
          </div>
          <div className="aurora-serif text-[15px]" style={{ fontWeight: 500 }}>
            DFC · Abril 2026
          </div>
        </div>
        <span
          className="text-[9px] uppercase px-2.5 py-1 rounded-full"
          style={{
            background: "rgba(74,103,65,0.12)",
            color: "var(--green)",
            letterSpacing: "1.2px",
            fontWeight: 500,
          }}
        >
          ● Saldo positivo
        </span>
      </div>

      <div className="p-5">
        {/* Resumo */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: "Receitas", val: "R$ 138.9k", color: "var(--green)" },
            { label: "Despesas", val: "R$ 121.4k", color: "var(--tan)" },
            { label: "Resultado", val: "R$ 17.5k", color: "var(--navy)" },
          ].map((m) => (
            <div
              key={m.label}
              className="p-3"
              style={{
                background: "linear-gradient(135deg, var(--linen) 0%, #FFFFFF 100%)",
                borderRadius: 12,
                border: "1px solid rgba(74,103,65,0.06)",
              }}
            >
              <div className="aurora-cap" style={{ color: "var(--sage)", fontSize: 8 }}>
                {m.label}
              </div>
              <div
                className="aurora-serif mt-1"
                style={{ fontSize: 18, color: m.color, lineHeight: 1, letterSpacing: "-0.5px" }}
              >
                {m.val}
              </div>
            </div>
          ))}
        </div>

        {/* Bars semanais */}
        <div className="aurora-cap mb-2" style={{ color: "var(--sage)" }}>
          Fluxo semanal
        </div>
        <div className="grid grid-cols-4 gap-3 items-end mb-4" style={{ height: 72 }}>
          {semanas.map((s) => (
            <div key={s.l} className="h-full flex flex-col justify-end gap-1">
              <div className="flex gap-1 items-end h-full">
                <div
                  className="flex-1 rounded-t"
                  style={{
                    height: `${(s.r / max) * 100}%`,
                    background: "linear-gradient(180deg, var(--green), var(--green2))",
                  }}
                />
                <div
                  className="flex-1 rounded-t"
                  style={{
                    height: `${(s.d / max) * 100}%`,
                    background: "linear-gradient(180deg, var(--tan), #4A6B55)",
                    opacity: 0.85,
                  }}
                />
              </div>
              <div className="text-[8px] text-center" style={{ color: "var(--muted-foreground)" }}>
                {s.l}
              </div>
            </div>
          ))}
        </div>

        {/* Tabela */}
        <div
          className="overflow-hidden"
          style={{
            border: "1px solid rgba(74,103,65,0.06)",
            borderRadius: 12,
          }}
        >
          <table className="w-full">
            <thead>
              <tr style={{ background: "var(--linen)" }}>
                <th
                  className="text-left px-3 py-2 aurora-cap"
                  style={{ fontSize: 8, fontWeight: 500 }}
                >
                  Categoria
                </th>
                <th
                  className="text-left px-3 py-2 aurora-cap"
                  style={{ fontSize: 8, fontWeight: 500 }}
                >
                  Total
                </th>
                <th
                  className="text-left px-3 py-2 aurora-cap"
                  style={{ fontSize: 8, fontWeight: 500 }}
                >
                  %
                </th>
                <th
                  className="text-left px-3 py-2 aurora-cap"
                  style={{ fontSize: 8, fontWeight: 500 }}
                >
                  vs ant
                </th>
              </tr>
            </thead>
            <tbody>
              {categorias.map((row, i) => (
                <tr
                  key={row.cat}
                  style={{
                    background: i % 2 === 0 ? "#fff" : "#FAFBFA",
                    borderTop: "1px solid rgba(74,103,65,0.04)",
                  }}
                >
                  <td className="px-3 py-2 text-[10px]">{row.cat}</td>
                  <td
                    className="px-3 py-2 aurora-serif"
                    style={{ fontSize: 12, color: row.val >= 0 ? "var(--navy)" : "var(--tan)" }}
                  >
                    {row.val >= 0 ? "" : "-"}R$ {Math.abs(row.val / 1000).toFixed(1)}k
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] w-7">{row.pct}%</span>
                      <div
                        className="flex-1 max-w-[60px]"
                        style={{ height: 4, background: "var(--linen)", borderRadius: 999 }}
                      >
                        <div
                          style={{
                            width: `${row.pct}%`,
                            height: "100%",
                            background: "linear-gradient(90deg, var(--sage), var(--green))",
                            borderRadius: 999,
                          }}
                        />
                      </div>
                    </div>
                  </td>
                  <td
                    className="px-3 py-2 text-[10px]"
                    style={{
                      color: row.up
                        ? "var(--green)"
                        : row.var === 0
                          ? "var(--muted-foreground)"
                          : "var(--tan)",
                    }}
                  >
                    {row.var === 0 ? "—" : `${row.up ? "↑" : "↓"} ${row.var}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

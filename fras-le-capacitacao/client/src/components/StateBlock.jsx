export function LoadingBlock() {
  return <div style={{ padding: "40px 0", color: "var(--ink-faint)", fontSize: 13 }}>Carregando dados…</div>;
}

export function ErrorBlock({ message }) {
  return (
    <div style={{ padding: "40px 0", color: "var(--red-dark)", fontSize: 13 }}>
      Não foi possível carregar os dados{message ? `: ${message}` : ""}. Verifique se a API está rodando em
      localhost:4001.
    </div>
  );
}

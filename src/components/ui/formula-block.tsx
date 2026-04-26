export function FormulaBlock({ formula, detail }: { formula: string; detail?: string }) {
  return (
    <div className="formula-block">
      <code>{formula}</code>
      {detail ? <p>{detail}</p> : null}
    </div>
  );
}

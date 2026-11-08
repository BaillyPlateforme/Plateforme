/**
 * Un titre dont les mots composés ne se coupent pas à leur trait d'union :
 * « La check-list du jour J » ne passe pas à la ligne après « check- ».
 */
export function Insecable({ texte }: { texte: string }) {
  return (
    <>
      {texte.split(/(\s+)/).map((mot, i) =>
        mot.includes("-") ? (
          <span key={i} style={{ whiteSpace: "nowrap" }}>
            {mot}
          </span>
        ) : (
          mot
        ),
      )}
    </>
  );
}

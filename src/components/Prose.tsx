/** Renders plain text with blank-line paragraphs and "- " bullet lists. */
export default function Prose({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((block, i) => {
        const lines = block.split('\n');
        return lines.every((l) => l.startsWith('- ')) ? (
          <ul key={i} className="ml-5 list-disc">
            {lines.map((l) => (
              <li key={l}>{l.slice(2)}</li>
            ))}
          </ul>
        ) : (
          <p key={i} className="[&+p]:mt-2">
            {block}
          </p>
        );
      })}
    </>
  );
}

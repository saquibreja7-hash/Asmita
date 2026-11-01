import type { ReactNode } from "react";

// Turns the first occurrence of `token` in a translated sentence into a link,
// so the number stays tappable whatever the word order. If a translation ever
// drops the number, the link is added after the sentence rather than lost.
export function linkify(text: string, token: string, href: string, className: string): ReactNode {
  const at = text.indexOf(token);
  if (at === -1) {
    return (
      <>
        {text}{" "}
        <a className={className} href={href}>
          {token}
        </a>
      </>
    );
  }
  return (
    <>
      {text.slice(0, at)}
      <a className={className} href={href}>
        {token}
      </a>
      {text.slice(at + token.length)}
    </>
  );
}

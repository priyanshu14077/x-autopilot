// Shared (client + server) X post length rules.
// Approximates X's weighted counting: 280 weight max, URLs count as 23,
// code points in the Latin/general-punctuation ranges weigh 1, everything else 2.
export const MAX_TWEET_WEIGHT = 280;
const URL_WEIGHT = 23;
const URL_RE = /https?:\/\/[^\s]+/g;

function charWeight(cp: number) {
  if (
    (cp >= 0 && cp <= 4351) ||
    (cp >= 8192 && cp <= 8205) ||
    (cp >= 8208 && cp <= 8223) ||
    (cp >= 8242 && cp <= 8247)
  ) {
    return 1;
  }
  return 2;
}

export function tweetWeight(text: string): number {
  let weight = 0;
  const stripped = text.replace(URL_RE, () => {
    weight += URL_WEIGHT;
    return "";
  });
  for (const ch of stripped.normalize("NFC")) {
    weight += charWeight(ch.codePointAt(0)!);
  }
  return weight;
}

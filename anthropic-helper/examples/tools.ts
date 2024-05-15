import { Readability } from "npm:@mozilla/readability@0.5.0";
import { JSDOM } from "npm:jsdom@16.4.0";
import { google } from "npm:googleapis@61.0.0";

export function extractMainContent(html: string) {
  const doc = new JSDOM(html).window.document;
  const reader = new Readability(doc);
  const article = reader.parse();
  return article?.content;
}

export async function searchGoogle(query: string) {
  const res = await google.customsearch('v1').cse.list({
    key: Deno.env.get('GOOGLE_API_KEY')!,
    cx: Deno.env.get('GOOGLE_CSE_ID')!,
    q: query
  });
  return res.data.items?.slice(0, 5).map((item) => {
    return {
      title: item.title,
      link: item.link,
      snippet: item.snippet,
      kind: item.kind,
      labels: item.labels
    }
  });
}

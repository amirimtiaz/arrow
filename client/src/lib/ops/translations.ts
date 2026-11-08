/**
 * Translation for branch messages written in another language (e.g. the Shenzhen procurement office posts in
 * Chinese). Sample messages ship with a human translation; anything else uses the browser's built-in, on-device
 * Translator API where it exists (recent Chrome), so message text never leaves the machine.
 */

/** Human translations of the sample (simulated) messages, keyed by the original text. */
const KNOWN: Record<string, string> = {
  国庆黄金周运力提醒: 'Golden Week capacity alert',
  '国庆黄金周前，深圳供应商的交货期延长了约两天。请尽早预订十月份的海运舱位。':
    'Ahead of the Golden Week holiday, supplier lead times in Shenzhen are up about two days. Please book October ocean space early.',
  第二批电子产品已确认: 'Second electronics batch confirmed',
  '工厂已确认第二批订单（约 4,800 件）将于周四在盐田港装船。质检报告已上传，请提前安排达拉斯的收货。':
    'The factory confirmed the second order (about 4,800 units) loads at Yantian port on Thursday. QC reports are uploaded; please schedule receiving in Dallas in advance.',
};

const LANGUAGES: { code: string; label: string; test: RegExp }[] = [
  { code: 'ja', label: '日本語', test: /[぀-ヿ]/ },
  { code: 'ko', label: '한국어', test: /[가-힯]/ },
  { code: 'zh', label: '中文', test: /[㐀-鿿]/ },
  { code: 'hi', label: 'हिन्दी', test: /[ऀ-ॿ]/ },
];

/** The language of a non-English message, or null for English/Latin text. */
export function detectLanguage(text: string): { code: string; label: string } | null {
  const hit = LANGUAGES.find((l) => l.test.test(text));
  return hit ? { code: hit.code, label: hit.label } : null;
}

interface BrowserTranslator {
  translate(text: string): Promise<string>;
}
interface TranslatorFactory {
  availability?(options: { sourceLanguage: string; targetLanguage: string }): Promise<string>;
  create(options: { sourceLanguage: string; targetLanguage: string }): Promise<BrowserTranslator>;
}

/** English for `text`: the stored translation if there is one, else the browser's on-device translator. */
export async function translateToEnglish(text: string, sourceLanguage: string): Promise<string> {
  const known = KNOWN[text.trim()];
  if (known) return known;
  const factory = (globalThis as unknown as { Translator?: TranslatorFactory }).Translator;
  if (!factory) throw new Error('This browser has no built-in translator. Try a recent version of Chrome.');
  const options = { sourceLanguage, targetLanguage: 'en' };
  if (factory.availability && (await factory.availability(options)) === 'unavailable') {
    throw new Error('Translation from this language is not available in this browser.');
  }
  const translator = await factory.create(options);
  return translator.translate(text);
}

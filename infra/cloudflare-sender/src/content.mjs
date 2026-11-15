// Offsets and limits use UTF-16, as required by Telegram message entities.
export const SHORT_TEXT='USDT/USDC за безналичные рубли. @ccapital_acces';
export function validateEntities(text,entities=[]) {
  const boundaries=new Set([0]);let at=0,end=0;
  for(const char of text){at+=char.length;boundaries.add(at);}
  if(!Array.isArray(entities))throw Error('invalid_entities');
  for(const e of entities){
    if(e.type!=='bold' || !Number.isSafeInteger(e.offset) || !Number.isSafeInteger(e.length) || e.length<1 || e.offset<end || !boundaries.has(e.offset) || !boundaries.has(e.offset+e.length))throw Error('invalid_entities');
    end=e.offset+e.length;
  }
}
export function validateContent(g) {
  if(!['photo','text'].includes(g.format) || typeof g.text!=='string' || !g.text.trim())throw Error('invalid_content');
  if(g.text.length>Math.min(g.max_chars,g.format==='photo'?1024:4096) || g.text.split('\n').length>g.max_lines)throw Error('content_too_long');
  if(!g.allow_links && /https?:\/\/|tg:\/\/|www\.|t\.me\/|\b[a-z\d-]+\.(?:com|ru|pro|net|org)\b/i.test(g.text))throw Error('links_not_allowed');
  if(!g.allow_links && /@[a-z\d_]{3,}/i.test(g.text) && !(g.content_variant==='short_text' && g.allow_contact_handles===true && g.text===SHORT_TEXT && g.format==='text' && g.format_evidence && g.format_checked_at))throw Error('contact_not_allowed');
  if(g.content_variant==='short_text' && (g.text!==SHORT_TEXT || g.text.length>60 || g.format!=='text' || g.allow_contact_handles!==true || !g.format_evidence || !g.format_checked_at))throw Error('unapproved_short_text');
  if(!/^[a-f0-9]{64}$/.test(g.digest || ''))throw Error('content_digest_missing');
  if(g.format==='photo' && (!/^[a-f0-9]{64}$/.test(g.photo_sha256 || '') || !/^\/[a-zA-Z0-9/_.-]+$/.test(g.photo_asset || '') || g.photo_asset.includes('..')))throw Error('invalid_photo');
  validateEntities(g.text,g.entities);
}
export function formattingVisible(message,spec) {
  if(!message || message.className==='MessageEmpty' || message.message!==spec.text)return false;
  if(spec.format==='photo' && (message.media?.className!=='MessageMediaPhoto' || !message.media.photo || message.media.photo.className==='PhotoEmpty'))return false;
  const actual=new Set(),wanted=new Set();
  for(const e of message.entities || [])if(e.className==='MessageEntityBold')for(let i=e.offset;i<e.offset+e.length && i<spec.text.length;i++)actual.add(i);
  for(const e of spec.entities || [])for(let i=e.offset;i<e.offset+e.length;i++)wanted.add(i);
  return [...wanted].every(i=>actual.has(i)) && (!spec.exact_bold || actual.size===wanted.size);
}

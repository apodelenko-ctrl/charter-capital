export const NOW=Date.UTC(2026,9,6,9);
export function group(overrides={}) {
  return {chat_id:-100123,handle:'fixture_group',enabled:true,paid:true,interval_ms:300_000,slowmode_ms:0,
    verified:true,evidence:'synthetic permission',permission:'approved',valid_until:NOW+86400000,
    daily_limit:1000,day_basis:'rolling_24h',max_chars:1024,max_lines:20,allow_links:false,
    format:'photo',text:'Synthetic caption',digest:'a'.repeat(64),photo_sha256:'b'.repeat(64),photo_asset:'/campaign.jpg',
    paid_until:NOW+86400000,payment_confirmed:true,recurring_confirmed:true,gap_ms:0,...overrides};
}
export function snapshot(overrides={}) {
  return {version:2,paid_variants:[],visibility:[],archive:[],source:{discovery_enabled:false},groups:[group()],attempts:[],blocked:[],daily_limit:10000,gap_ms:0,expected_user_id:'123456',wait_until:0,halt:'',...overrides};
}

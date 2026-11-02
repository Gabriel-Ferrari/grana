// Dev (supabase local). Produção: src/env.prod.ts (trocado no build via fileReplacements).
export const env = {
    production: false,
    supabaseUrl: 'http://127.0.0.1:54321',
    supabaseKey: 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH',
    /** chave pública VAPID dos avisos (a privada fica no secret VAPID_KEYS da função remind) */
    vapidPublic: 'BN14BsyRm7M_bfqIKCfMAg-61ptZ4fuj1RcaXqmeoUSQ2dCo1RzVmDP6526Vx6DybPxz7JZUG8t1MwknK8mRxns',
};
